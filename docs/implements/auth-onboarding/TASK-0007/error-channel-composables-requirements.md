# TDD要件定義書: cross-cutting エラーチャネル composable 4本

- **機能名**: error-channel-composables（useErrorMessage / useFormErrors / useNoticeErrors / useToastErrors）
- **タスクID**: TASK-0007
- **要件名**: auth-onboarding
- **作成日**: 2026-06-01

---

## 1. 機能の概要（EARS要件定義書・設計文書ベース）

🔵 **何をする機能か**

エラーオブジェクトを i18n 文言に変換し、UI チャネル別の state に流し込む横断（cross-cutting）composable 4 本を提供する。

- **useErrorMessage**: 中核変換器。エラー識別子（App 識別子 7 種 / PG SQLSTATE 4 種）を i18n 文言へ 1:1 / context 別に変換し、未マッピング時は `errors.generic` を返しつつ Sentry へ報告する。
- **useFormErrors**: `useErrorMessage` をラップし、フィールド単位エラー文言を `fieldErrors` state（`<UFormField>` inline 表示用）に載せる。
- **useNoticeErrors**: `useErrorMessage` をラップし、単一通知文言を `notice` state（`<UAlert>` 表示用）に載せる。
- **useToastErrors**: `useErrorMessage` をラップし、`useToast()` 経由で一過性トースト（`color: 'red'`）を表示する。

🔵 **どのような問題を解決するか**

- エラー処理 5 層モデル（発生源→識別→変換→提示→復帰）のうち、層3（変換）と層4（提示）を担い、各 page / domain composable がエラー処理を場当たり的に書くことを防ぐ。
- 文言リテラル直書きを禁止し（NFR-204）、すべて `locales/ja.json` から引くことで多言語化と一貫性を担保する。
- 未マッピングエラーを取りこぼさず Sentry に集約することで運用時の検知漏れを防ぐ（NFR-304）。

🔵 **想定されるユーザー**

直接の利用者はアプリ開発者（Phase 2 の全 domain composable TASK-0008〜0013）。エンドユーザーは変換後の日本語エラー文言を各 UI チャネルで受け取る。

🔵 **システム内での位置づけ**

- アーキテクチャ上は `app/composables/` 配下の横断ユーティリティ層。
- 本 4 本が Phase 2 以降の全 domain composable のエラーチャネル基盤となる。
- 純粋なクライアント側変換ロジックであり DB / RLS / RPC を触らない。

- **参照したEARS要件**: NFR-204（文言リテラル禁止 / i18n 経由）、NFR-304（Sentry 監視）
- **参照した設計文書**:
  - `docs/design/cross-cutting/error-handling.md` §3（9 原則）/ §5.1 / §6.4
  - `docs/design/auth-onboarding/architecture.md` §composable 構成
  - `docs/decisions/005-error-handling-strategy.md`

---

## 2. 入力・出力の仕様（EARS機能要件・TypeScript型定義ベース）

### 2.1 useErrorMessage 🔵

**戻り値型**: `ErrorMessageApi`（`interfaces.ts §4`）

```ts
interface ErrorMessageApi {
  errorToMessage: (error: unknown, pgContext?: ErrorContext) => string
}
```

- **入力**:
  - `error: unknown` — 任意のエラーオブジェクト。`isAppError` / `isPgError`（`app/types/error-codes.ts`）で識別。
  - `pgContext?: ErrorContext` — `'join_group' | 'create_group' | 'generic'`。省略時のデフォルトは `'generic'`。PG SQLSTATE のみで使用、App 識別子では無視される。
- **出力**: `string`（i18n 文言）。
- **入出力の関係性**:
  - App 識別子（`NOT_AUTHENTICATED` / `NOT_A_MEMBER` / `INVALID_GROUP_NAME` / `ALREADY_IN_GROUP` / `INVITATION_NOT_FOUND_BY_LINK` / `INVITATION_EXPIRED` / `INVITATION_CODE_COLLISION_AFTER_RETRY`）→ `t('errors.{code}')`（1:1、flat キー）。
  - PG SQLSTATE（`UNIQUE_VIOLATION` / `FK_VIOLATION` / `CHECK_VIOLATION`）→ `tWithContext('errors.{code}', pgContext)`。`te('errors.{code}.{ctx}')` が真なら context キー、偽なら `errors.{code}.generic`（tree キー）。
  - `RLS_REJECTED` → `t('errors.rls_rejected')`（context 出し分けなし）。
  - いずれにも該当しない → `Sentry.captureException(error, { tags: { reason: 'unmapped_error_code' } })` を呼び、`t('errors.generic')` を返す。

### 2.2 useFormErrors 🔵

**戻り値型**: `FormErrorsApi`

```ts
interface FormErrorsApi {
  fieldErrors: Ref<Record<string, string>>
  setFieldError: (field: string, error: unknown, pgContext?: ErrorContext) => void
  clear: (field?: string) => void
}
```

- `setFieldError(field, error, pgContext?)`: `fieldErrors.value[field] = errorToMessage(error, pgContext)`。
- `clear(field?)`: `field` 指定時は当該キーのみ `delete`、未指定時は `fieldErrors.value = {}`。
- 初期値: `fieldErrors` は空オブジェクト `{}`。

### 2.3 useNoticeErrors 🔵

**戻り値型**: `NoticeErrorsApi`

```ts
interface NoticeErrorsApi {
  notice: Ref<string | null>
  setNotice: (error: unknown, pgContext?: ErrorContext) => void
  clear: () => void
}
```

- `setNotice(error, pgContext?)`: `notice.value = errorToMessage(error, pgContext)`。
- `clear()`: `notice.value = null`。
- 初期値: `notice` は `null`。

### 2.4 useToastErrors 🔵

**戻り値型**: `ToastErrorsApi`

```ts
interface ToastErrorsApi {
  showError: (error: unknown, pgContext?: ErrorContext) => void
}
```

- `showError(error, pgContext?)`: 内部 `useToast()` の `toast.add({ title: errorToMessage(error, pgContext), color: 'red' })` を呼ぶ。state は保持しない（一過性）。

### 2.5 データフロー

🔵

```
error (unknown)
  └─ useErrorMessage().errorToMessage(error, pgContext)
       ├─ App 識別子    → t('errors.{code}')
       ├─ PG SQLSTATE   → tWithContext('errors.{code}', pgContext) → te 判定 → ctx or .generic
       ├─ RLS_REJECTED  → t('errors.rls_rejected')
       └─ fallthrough   → Sentry.captureException(...) + t('errors.generic')
            ↓ (返り文言 string)
  ├─ useFormErrors  → fieldErrors.value[field]   → <UFormField>
  ├─ useNoticeErrors→ notice.value               → <UAlert>
  └─ useToastErrors → toast.add({ title, color }) → useToast
```

- **参照したEARS要件**: NFR-204 / NFR-304
- **参照した設計文書**:
  - `interfaces.ts §4`（`ErrorMessageApi` / `FormErrorsApi` / `NoticeErrorsApi` / `ToastErrorsApi`）、`ErrorContext`
  - `error-handling.md §5.1`（useErrorMessage 実装コード）/ §6.4（3 チャネル実装コード）

---

## 3. 制約条件（EARS非機能要件・アーキテクチャ設計ベース）

🔵 **セキュリティ / 監視要件（NFR-304）**

- 未マッピング識別子は必ず `Sentry.captureException(error, { tags: { reason: 'unmapped_error_code' } })` で報告。タグ形式は厳密一致。
- ユーザ操作起因の想定エラー（App 識別子 / PG SQLSTATE にマッピング済）は Sentry に送信しない。

🔵 **互換性 / 文言要件（NFR-204、error-handling.md §3 原則 5）**

- TS コードに文言リテラル（例: 'ログインが必要です'）を直書きしない。すべて `useI18n()` の `t()` 経由で `locales/ja.json` から引く。

🔵 **i18n キー構造制約（error-handling.md §5.4）**

- App 識別子: `errors.{code}`（flat、context 不使用）。
- PG SQLSTATE: `errors.{code}.{context}`（tree、`te()` で存在確認、なければ `.generic` フォールバック）。

🔵 **アーキテクチャ制約**

- Composition API のみ（Options API 禁止）。TypeScript strict mode。
- 戻り値は `interfaces.ts §4` の 4 インターフェースと完全一致。
- 3 チャネル composable は薄いラッパに徹し、複雑なロジックを持たない（`useErrorMessage().errorToMessage` を呼ぶのみ）。
- ESLint: 1tbs brace style / no comma dangle。

🔵 **依存前提**

- `ALREADY_IN_GROUP` は TASK-0003 で `APP_ERROR_CODES`（`app/types/error-codes.ts`）に追加済であること。
- i18n キーは TASK-0004 で `locales/ja.json` に定義済であること。
- Sentry は TASK-0005 で初期化済であること。

🔵 **データベース / API 制約**

- 該当なし。本タスクは DB を触らない純クライアントロジック（統合テストも不要）。

- **参照したEARS要件**: NFR-204, NFR-304
- **参照した設計文書**: `error-handling.md §3 / §5.1 / §5.4`、`architecture.md §composable 構成`、`docs/decisions/012-test-strategy.md`、`CLAUDE.md`（Coding Conventions）

---

## 4. 想定される使用例（EARS Edgeケース・データフローベース）

### 4.1 基本的な使用パターン 🔵

- **App 識別子変換**: `useErrorMessage().errorToMessage({ message: 'invalid_group_name' })` → `t('errors.invalid_group_name')` の文言。
- **フォームフィールドエラー**: `useFormErrors().setFieldError('name', err)` → `fieldErrors.value['name']` に文言、`<UFormField>` が inline 表示。
- **画面通知**: `useNoticeErrors().setNotice(err)` → `notice.value` に文言、`<UAlert>` が表示。
- **トースト**: `useToastErrors().showError(err)` → `toast.add({ title: 文言, color: 'red' })`。

### 4.2 PG SQLSTATE context 出し分け 🔵

- `errorToMessage(uniqueViolationErr, 'join_group')`:
  - `te('errors.unique_violation.join_group')` が真 → `errors.unique_violation.join_group`。
  - 偽 → `errors.unique_violation.generic`（フォールバック）。

### 4.3 エッジケース / エラーケース 🔵

- **未マッピングエラー（fallthrough）**: App 識別子にも PG SQLSTATE にも一致しない `error` → `t('errors.generic')` を返却 + `Sentry.captureException` を 1 回呼ぶ。
- **context キー欠落**: PG SQLSTATE で `pgContext` に対応するキーが i18n に無い → `.generic` キーに自動フォールバック。
- **pgContext 省略**: `errorToMessage(error)`（第 2 引数なし）→ デフォルト `'generic'` を適用。
- **clear の二系統**: `useFormErrors().clear('name')`（単一）/ `clear()`（全消去）。`useNoticeErrors().clear()` は `notice` を `null` に。

### 4.4 データフロー（再掲）

§2.5 のフロー図参照。

- **参照したEARS要件**: 通常要件（App 識別子変換）/ EDGE（未マッピング fallthrough、context 欠落フォールバック）
- **参照した設計文書**: `error-handling.md §5.1 / §5.3 / §6.4`、`interfaces.ts §4`

---

## 5. EARS要件・設計文書との対応関係

- **参照したユーザストーリー**: 認証・オンボーディングにおけるエラー文言の一貫提示（auth-onboarding）
- **参照した機能要件**: TASK-0007 完了条件（App 識別子 1:1 変換 / PG context 出し分け / fallthrough+Sentry / 3 チャネル state 提供 / 戻り値型一致）
- **参照した非機能要件**: NFR-204（i18n 文言経由）、NFR-304（Sentry 監視）
- **参照したEdgeケース**: 未マッピング fallthrough、context キー欠落フォールバック、pgContext 省略
- **参照した受け入れ基準**: TASK-0007 §単体テスト要件 TC1〜TC4
- **参照した設計文書**:
  - **アーキテクチャ**: `docs/design/auth-onboarding/architecture.md` §composable 構成
  - **データフロー**: `docs/design/auth-onboarding/dataflow.md`（エラー提示フロー）
  - **型定義**: `docs/design/auth-onboarding/interfaces.ts §4`（`ErrorMessageApi` / `FormErrorsApi` / `NoticeErrorsApi` / `ToastErrorsApi`、`ErrorContext`）
  - **エラー実装規約**: `docs/design/cross-cutting/error-handling.md §3 / §5.1 / §5.3 / §5.4 / §6.4`
  - **ADR**: `docs/decisions/005-error-handling-strategy.md`、`docs/decisions/012-test-strategy.md`（D2 mock unit / D4 mock 戦略）

---

## 6. 実装対象ファイル

| ファイル | 役割 | 戻り値型 | 設計ソース |
|---|---|---|---|
| `app/composables/useErrorMessage.ts` | 識別子→文言 変換中核 + Sentry fallthrough | `ErrorMessageApi` | error-handling.md §5.1 |
| `app/composables/useFormErrors.ts` | `fieldErrors` state（`<UFormField>`） | `FormErrorsApi` | error-handling.md §6.4 |
| `app/composables/useNoticeErrors.ts` | `notice` state（`<UAlert>`） | `NoticeErrorsApi` | error-handling.md §6.4 |
| `app/composables/useToastErrors.ts` | `useToast` 一過性トースト | `ToastErrorsApi` | error-handling.md §6.4 |

---

## 7. テスト方針（最小カバレッジ、tdd-testcases への引き継ぎ）

🔵 *memory `feedback_test_coverage` + ADR-012 D2/D4*

- **mock 戦略**: `vi.mock('#imports')` で `useI18n`（`t` はキーをそのまま返す or 固定文言マップ、`te` は context 存在判定を制御）と `@sentry/nuxt` の `captureException`（`vi.fn()` スパイ）を差し替え。
- **useErrorMessage に検証を集中**（3 観点）:
  - TC1: App 識別子 1:1 分岐の代表 1 件（`INVALID_GROUP_NAME`）。7 種を全て個別テストしない。
  - TC2: 未マッピング fallthrough → `errors.generic` + `Sentry.captureException({ tags: { reason: 'unmapped_error_code' } })` 1 回。
  - TC3: PG SQLSTATE context 出し分け（`UNIQUE_VIOLATION`）。`te` 真で `.join_group` / 偽で `.generic`。
- **3 チャネルラッパ**は state 反映のみ各 1 ケース（TC4）。`useErrorMessage` を mock し固定文言を返させる:
  - useFormErrors: `setFieldError('name', err)` で `fieldErrors.value['name']` に文言、`clear` で削除。
  - useNoticeErrors: `setNotice(err)` で `notice.value` に文言、`clear` で `null`。
  - useToastErrors: `showError(err)` で `useToast().add({ title: 文言, color: 'red' })` 呼び出し検証。
- **境界値テストは不要**（error-codes.ts / group-name.test.ts で完了済）。
- **統合テストは不要**（DB を触らない）。

---

## 品質判定

```
✅ 高品質:
- 要件の曖昧さ: なし（実装コード・戻り値型が設計書に確定済）
- 入出力定義: 完全（4 インターフェース + 入出力関係を明記）
- 制約条件: 明確（NFR-204 / NFR-304 / i18n キー構造 / 依存前提）
- 実装可能性: 確実（error-handling.md §5.1/§6.4 に実装コードそのまま）
- 信頼性レベル: 🔵 が全項目（設計文書 100% 裏付け、推測なし）
```

**信頼性サマリー**: 全項目 🔵（青信号）。EARS 要件・設計文書（error-handling.md §5.1/§6.4、interfaces.ts §4、ADR-012）に直接裏付けられており推測項目なし。
