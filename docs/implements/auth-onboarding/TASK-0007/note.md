# TASK-0007 コンテキストノート

**タスク名**: cross-cutting composable 4本（useErrorMessage / useFormErrors / useNoticeErrors / useToastErrors）
**タスクID**: TASK-0007
**要件名**: auth-onboarding
**作成日**: 2026-06-01

---

## 1. 技術スタック

### フレームワーク・ライブラリ
- **Nuxt**: 4.4 (Vue 3 + TypeScript strict mode)
- **Nuxt UI**: v4.5 (`<UFormField>` / `<UAlert>` / `useToast()` 等)
- **i18n**: `@nuxtjs/i18n` (ja ロケール、en はハコ)
- **エラー監視**: `@sentry/nuxt` (NFR-304)
- **参照元**: docs/design/auth-onboarding/architecture.md §コンポーネント構成

### テスト環境
- **フレームワーク**: Vitest + Vue Test Utils
- **設定**: vitest.config.ts (tests/unit/**/*.test.ts を対象)
- **mock 戦略**: `vi.mock('#imports')` で useI18n・Sentry を差し替え (ADR-012 D4)
- **参照元**: vitest.config.ts / docs/design/cross-cutting/error-handling.md §5.1

---

## 2. 開発ルール

### エラーハンドリング設計規約
- **層モデル**: 5層（発生源→識別→変換→提示→復帰）
  - 層2（識別）: app/types/error-codes.ts で識別子集約
  - 層3（変換）: useErrorMessage で i18n 文言に変換、PG SQLSTATE は context で出し分け
  - 層4（提示）: チャネル別 composable で型強制 (useFormErrors / useNoticeErrors / useToastErrors)
  - 層5（復帰）: composable が state を expose、page では state に応じて UI 操作
- **参照元**: docs/design/cross-cutting/error-handling.md §3 (9原則)

### App 識別子の 1:1 ルール
- App 識別子は必ず 1:1 で i18n キーに対応 (context は使わない)
- 7個の App 識別子: NOT_AUTHENTICATED / NOT_A_MEMBER / INVALID_GROUP_NAME / ALREADY_IN_GROUP / INVITATION_NOT_FOUND_BY_LINK / INVITATION_EXPIRED / INVITATION_CODE_COLLISION_AFTER_RETRY
- ALREADY_IN_GROUP は TASK-0003 で app/types/error-codes.ts に既追加
- **参照元**: docs/design/cross-cutting/error-handling.md §5.2 / §4.1 / error-codes.ts 実測

### PG SQLSTATE の context 出し分け
- PG SQLSTATE (UNIQUE_VIOLATION / FK_VIOLATION / CHECK_VIOLATION / RLS_REJECTED) は context で i18n キーを出し分け
- ErrorContext 型: 'join_group' | 'create_group' | 'generic'
- tWithContext(base, ctx) で ctx キーの存在を te() で確認、なければ .generic にフォールバック
- **参照元**: docs/design/cross-cutting/error-handling.md §5.3 / §5.5 / error-codes.ts

### i18n キー構造
- App 識別子: `errors.{code}` (flat, 例: errors.not_authenticated)
- PG SQLSTATE: `errors.{code}.{context}` (tree, 例: errors.unique_violation.join_group)
- **参照元**: docs/design/cross-cutting/error-handling.md §5.4

### ロギング・エラー監視
- unmapped 識別子は Sentry.captureException(error, { tags: { reason: 'unmapped_error_code' } })
- ユーザ操作起因の想定エラーは Sentry に送信しない (NFR-304)
- **参照元**: docs/design/cross-cutting/error-handling.md §8 / TASK-0007.md 完了条件

### test coverage 方針 (memory feedback_test_coverage)
- 境界値 + 分岐代表のみ（冗長ケース禁止）
- App 識別子 7個を全て個別テストしない、1:1 分岐代表 1件 + fallthrough + PG context の3観点に絞る
- 3チャネルラッパは state 反映のみ確認 (useErrorMessage の分岐は別途テスト)
- **参照元**: TASK-0007.md §単体テスト要件 / memory feedback_test_coverage

---

## 3. 関連実装

### 既存ファイル (参考パターン)
- **Zod スキーマ**: app/schemas/group-name.ts
  - safeParse() で境界値テスト、エラー message は識別子を直接返す
  - **参照元**: tests/unit/schemas/group-name.test.ts (境界値テストの書き方)
- **既存テストパターン**: tests/unit/ 配下
  - `describe() / it()` (Vitest)
  - `expect()` for assertion
  - test file: `{module}.test.ts`
  - **参照元**: tests/unit/schemas/group-name.test.ts

### 実装対象ファイル (4 本)
1. **app/composables/useErrorMessage.ts**
   - errorToMessage(error, pgContext?) が戻り値のすべて
   - App 識別子 7個の if 分岐 + PG SQLSTATE 4個の if 分岐 + fallthrough
   - 戻り値: { errorToMessage } (ErrorMessageApi に従う)
   - **参照元**: docs/design/cross-cutting/error-handling.md §5.1

2. **app/composables/useFormErrors.ts**
   - fieldErrors: Ref<Record<string, string>>
   - setFieldError(field, error, pgContext?) / clear(field?)
   - 戻り値: { fieldErrors, setFieldError, clear } (FormErrorsApi に従う)
   - **参照元**: docs/design/cross-cutting/error-handling.md §6.4

3. **app/composables/useNoticeErrors.ts**
   - notice: Ref<string | null>
   - setNotice(error, pgContext?) / clear()
   - 戻り値: { notice, setNotice, clear } (NoticeErrorsApi に従う)
   - **参照元**: docs/design/cross-cutting/error-handling.md §6.4

4. **app/composables/useToastErrors.ts**
   - showError(error, pgContext?) のみ
   - 内部で useToast() を呼び、toast.add({ title: 文言, color: 'red' })
   - 戻り値: { showError } (ToastErrorsApi に従う)
   - **参照元**: docs/design/cross-cutting/error-handling.md §6.4

### テスト対象ファイル (4 本)
1. **tests/unit/composables/useErrorMessage.test.ts**
   - TC1: App 識別子 (INVALID_GROUP_NAME) → 対応文言 (1:1 分岐代表)
   - TC2: 未マッピングエラー → generic + Sentry 呼び出し検証
   - TC3: PG SQLSTATE context 出し分け (UNIQUE_VIOLATION で join_group / generic)
   - **参照元**: TASK-0007.md §単体テスト要件 (§TC1-3)

2. **tests/unit/composables/useFormErrors.test.ts**
   - TC4: useErrorMessage mock、setFieldError で fieldErrors に文言が載る、clear で削除
   - **参照元**: TASK-0007.md §単体テスト要件 (§TC4)

3. **tests/unit/composables/useNoticeErrors.test.ts**
   - TC4: useErrorMessage mock、setNotice で notice に文言が載る、clear でリセット
   - **参照元**: TASK-0007.md §単体テスト要件 (§TC4)

4. **tests/unit/composables/useToastErrors.test.ts**
   - TC4: useToast mock、showError で toast.add({ title: 文言, color: 'red' }) 呼び出し検証
   - **参照元**: TASK-0007.md §単体テスト要件 (§TC4)

---

## 4. 設計文書

### アーキテクチャ・仕様
- **auth-onboarding アーキテクチャ**: docs/design/auth-onboarding/architecture.md
  - §composable構成: cross-cutting composable 4本の責務・戻り値型定義
  - §レイアウト戦略・認証middleware: (TASK-0007 本体ではなく参考)
  - **参照元**: architecture.md §composable構成 / §既存APIの利用マッピング

- **型定義（設計契約）**: docs/design/auth-onboarding/interfaces.ts
  - ErrorMessageApi / FormErrorsApi / NoticeErrorsApi / ToastErrorsApi の型定義
  - ErrorContext 型: 'join_group' | 'create_group' | 'generic'
  - **参照元**: interfaces.ts §4

- **エラーハンドリング規約**: docs/design/cross-cutting/error-handling.md
  - §5.1: useErrorMessage 実装コード（設計書に実装コードが完全に記載済）
  - §6.4: 3チャネルcomposable 実装コード（設計書に実装コードが完全に記載済）
  - §5.5: domain composable で context を閉じる思想
  - **参照元**: error-handling.md (実装の直接ソース)

### 実装タスク文書
- **TASK-0007**: docs/tasks/auth-onboarding/TASK-0007.md
  - 実装詳細（§1-2）
  - テストケース 4個（§単体テスト要件）
  - 実装手順（TDD Red → Green → Refactor → Verify）
  - 完了条件（チェックリスト）

---

## 5. テスト関連情報

### テストフレームワーク・設定
- **Vitest**: vitest.config.ts で設定
  - include: `tests/unit/**/*.test.ts`
  - exclude: `*.integration.test.ts`
  - passWithNoTests: true
- **Vue Test Utils**: Nuxt との統合 (@nuxt/test-utils)
- **参照元**: vitest.config.ts

### mock 戦略（ADR-012 D4）
- `vi.mock('#imports')` で `useI18n` / `@sentry/nuxt` を差し替え
- useI18n: `t()` は 'errors.xxx' キーをそのまま返す、`te()` は context 存在判定を制御
- Sentry: `captureException` を `vi.fn()` でスパイ
- **参照元**: docs/design/cross-cutting/error-handling.md §5.1 / TASK-0007.md §単体テスト要件

### 既存テスト dir 構成
- `tests/unit/` ← mock unit テスト集約
- `tests/unit/composables/` ← domain / cross-cutting composable テスト
- `tests/unit/schemas/` ← Zod スキーマテスト (group-name.test.ts 実測)
- `tests/unit/middleware/` ← middleware テスト
- `tests/integration/` ← integration テスト（本TASK対象外）

### テストケース概要
1. **useErrorMessage**: 3 cases (分岐代表 + fallthrough + context)
2. **useFormErrors / useNoticeErrors / useToastErrors**: 各 1 case (state 反映確認)
3. **合計**: 4 テストファイル、4 テストケース（最小カバレッジ戦略）

---

## 6. 注意事項

### 実装上の注意
- **ALREADY_IN_GROUP の前提**: TASK-0003 で app/types/error-codes.ts に既追加確認済。未追加なら TASK-0003 を先に実施
- **文言リテラル禁止**: TS コード内に 'ログインが必要です' 等の文言を直書きしない。必ず locales/ja.json から引く (NFR-204)
- **useI18n() の te() 関数**: context キーが存在するか判定するために使用。設計書 error-handling.md §5.1 の tWithContext 参照
- **Sentry タグ**: `{ tags: { reason: 'unmapped_error_code' } }` の形式を厳密に（NFR-304）
- **3チャネルラッパの内部**: useErrorMessage().errorToMessage を呼ぶ薄いラッパ。複雑なロジックは入れない

### テスト上の注意
- **境界値テスト不要**: 境界値テストは TASK-0003 (error-codes.ts) と group-name.test.ts で完了。本TASK ではテスト対象外
- **冗長テスト禁止**: App 識別子 7個全て individual テストしない。1代表 + fallthrough + context で3観点に絞る
- **mock useErrorMessage**: 3チャネルテストで useErrorMessage を mock し、戻り値を固定文言に替える。実装テストではなく integration 検証
- **Sentry.captureException のスパイ**: `vi.fn()` で mock し、呼び出しを `.toHaveBeenCalledWith(...)` で検証
- **参照元**: memory feedback_test_coverage / TASK-0007.md §単体テスト要件

### 信頼性レベル
- **実装詳細**: 🔵 (error-handling.md で実装コード確定済)
- **テストケース**: 🔵 (ADR-012 + feedback_test_coverage で戦略確定済)
- **設計**: 🔵 (interfaces.ts + error-handling.md で型・仕様確定済)

---

## 参考：関連ファイル一覧（相対パス）

### 設計・要件文書
- docs/design/auth-onboarding/architecture.md
- docs/design/auth-onboarding/interfaces.ts
- docs/design/cross-cutting/error-handling.md
- docs/spec/auth-onboarding/requirements.md
- docs/tasks/auth-onboarding/TASK-0007.md
- docs/decisions/005-error-handling-strategy.md
- docs/decisions/012-test-strategy.md

### 既存実装（参考）
- app/types/error-codes.ts
- app/schemas/group-name.ts
- vitest.config.ts

### テストサンプル
- tests/unit/schemas/group-name.test.ts

### 依存タスク（既完了）
- TASK-0003: app/types/error-codes.ts + ALREADY_IN_GROUP
- TASK-0004: @nuxtjs/i18n + locales/ja.json キー
- TASK-0005: @sentry/nuxt v10 + Sentry 初期化
