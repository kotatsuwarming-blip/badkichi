# TASK-0010 コンテキストノート

**タスク名**: useCreateGroup（RPC）— TDD 開発ノート  
**タスク ID**: TASK-0010  
**要件名**: auth-onboarding  
**作成日**: 2026-06-01

---

## 1. 技術スタック

### フレームワーク・ライブラリ
- **Nuxt 4.4** / Vue 3 + TypeScript strict mode
- **@nuxtjs/supabase 2.x**: `useSupabaseClient<Database>()` (RPC 呼び出し)
- **Zod**: group-name schema (TASK-0006 実装済、事前検証用)
- **Vitest**: 単体テスト (ADR-012 D5)
- **参照元**: docs/design/auth-onboarding/architecture.md §コンポーネント構成

### テスト環境
- **フレームワーク**: Vitest + Vue Test Utils
- **設定**: vitest.config.ts (tests/unit/**/*.test.ts を対象)
- **mock 戦略**: `vi.mock()` で useSupabaseClient / useCurrentGroup / useFormErrors を差し替え (ADR-012 D4)
- **参照元**: vitest.config.ts

---

## 2. 開発ルール

### composable 基本ルール（ADR-007）
- **実装ファイル**: `app/composables/useCreateGroup.ts`
- **戻り値型**: `UseCreateGroupReturn = { create, pending: Ref<boolean>, fieldErrors: Ref<Record<string, string>> }` (interfaces.ts に定義)
- **責務**: Group 作成 RPC を実行、pending 管理、エラー時は useFormErrors で inline 表示、成功時は useCurrentGroup().refresh() を呼ぶ
- **型ファイル**: `app/types/supabase.ts`（自動生成）/ `app/types/error-codes.ts`

### RPC・API ルール（architecture.md §既存 API マッピング）
- **RPC 名**: `create_group_with_owner` (生成済み型を真とする)
- **RPC 引数**: `{ group_name: string }` ← 引数名は `group_name` (`p_group_name` は要件定義の誤記)
- **RPC 戻り値**: `string` (group_id)
- **supabase.ts 確認**: app/types/supabase.ts の `create_group_with_owner: { Args: { group_name: string }, Returns: string }`
- **DB 側制約**: `groups.name` に UNIQUE 制約なし (CHECK のみ)。同名重複エラー不発生。
- **エラーハンドル**: `invalid_group_name` のみ（RPC 側で CHECK 制約に引っかかる場合）

### エラーハンドリング（error-handling.md §6.4 / §6.5）
- **エラーチャネル**: `useFormErrors` の inline 表示 (`<UFormField>`)
- **エラー識別子**: `INVALID_GROUP_NAME` → `setFieldError('name', error)` で fieldErrors['name'] に載る
- **文言生成**: `useErrorMessage().errorToMessage(error, 'create_group')` で i18n 変換
- **正常系の出し分け**: RPC 成功 `{ data: group_id, error: null }` を素通し、page が成功判定に使う
- **参照元**: docs/design/cross-cutting/error-handling.md §6.5 代表例 #2

### 二重送信防止（EDGE-003）
- **pending**: RPC 実行中は true、完了時（成功・エラー）に false に戻す
- **try/finally**: pending = false は finally ブロックで確実に実行
- **UI 側責務**: page が送信ボタン disabled={pending.value} で制御（composable は state を expose するのみ）

### 基本フロー（dataflow.md §3 参照）
1. page で `clear()` を呼ぶ（前回のエラー消去）
2. `pending.value = true`
3. `rpc('create_group_with_owner', { group_name })` 実行
4. エラー時: `setFieldError('name', error)` → fieldErrors に載る、refresh 呼ばず
5. 成功時: `useCurrentGroup().refresh()` 呼び、所属状態を最新化 (dataflow.md D5-4)
6. finally で `pending.value = false`
7. 戻り値: `{ data: group_id | null, error: unknown | null }`

### 型安全性
- **Database 型**: `useSupabaseClient<Database>()` で型付き client 取得
- **ActionResult**: `{ data: T | null, error: unknown }` (interfaces.ts 定義)
- **UseCreateGroupReturn**: `{ create(groupName: string): Promise<ActionResult<string>>, pending: Ref<boolean>, fieldErrors: Ref<Record<string, string>> }`
- **参照元**: docs/design/auth-onboarding/interfaces.ts §3 / §5

---

## 3. 関連実装

### 既存 composable パターン（TASK-0007 / TASK-0009）
- **useFormErrors** (TASK-0007 実装済):
  - `setFieldError(field, error, pgContext?)` で fieldErrors に文言を載せる
  - `clear(field?)` で単一フィールドまたは全フィールドをクリア
  - 内部で `useErrorMessage().errorToMessage()` を呼ぶ
  - **実装ファイル**: app/composables/useFormErrors.ts
  - **テスト参考**: tests/unit/composables/useFormErrors.test.ts (mock の書き方)

- **useCurrentGroup** (TASK-0009 実装済):
  - `useAsyncData('current-group')` ラップで group_members SELECT 実行
  - `refresh()` で最新化（キー共有で middleware と 1 クエリ保証）
  - **実装ファイル**: app/composables/useCurrentGroup.ts
  - **呼び出し方**: `const { refresh } = useCurrentGroup()` → `await refresh()`

- **useErrorMessage** (TASK-0007 実装済):
  - `errorToMessage(error, pgContext?)` で error を i18n 文言に変換
  - context は 'create_group' を指定（APP_ERROR_CODES.INVALID_GROUP_NAME は context 不要）
  - **実装ファイル**: app/composables/useErrorMessage.ts

- **Zod schema** (TASK-0006 実装済):
  - `app/schemas/group-name.ts` で 1〜50 文字 / 空白不可を検証
  - page 側で Zod で事前検証、RPC 側では二重防御の inline 表示
  - **参照元**: TASK-0006.md / docs/design/auth-onboarding/dataflow.md §3

### テストパターン（TASK-0007 参考）
- **mock 戦略**: `vi.mock()` で useSupabaseClient / useCurrentGroup / useFormErrors を差し替え
- **useSupabaseClient mock**: `rpc()` をスパイして `{ data, error }` 返却
- **useCurrentGroup mock**: `refresh` をスパイ
- **useFormErrors mock**: `setFieldError` / `clear` をスパイ
- **vi.fn()**: spy function 作成（呼び出し引数・回数を検証可）
- **mockReturnValue / mockResolvedValue**: 戻り値指定
- **参照元**: tests/unit/composables/useFormErrors.test.ts / TASK-0007.md §単体テスト要件

---

## 4. 設計文書

### 型定義（interfaces.ts §5）
```typescript
// composable 戻り値
export interface UseCreateGroupReturn {
  create: (groupName: string) => Promise<ActionResult<string>>
  pending: Ref<boolean>
  fieldErrors: Ref<Record<string, string>>
}

// 共通型
export interface ActionResult<T> {
  data: T | null
  error: unknown
}

// ErrorContext （TASK-0007 で定義済）
export type ErrorContext = 'join_group' | 'create_group' | 'generic'
```

参照元: docs/design/auth-onboarding/interfaces.ts

### アーキテクチャ（architecture.md §既存 API マッピング）
- RPC は `create_group_with_owner({ group_name })` のみ（新規スキーマなし）
- 引数名 `group_name` は supabase.ts 生成型・DB migration で確定済
- owner 自動登録・`invalid_group_name` 発火は data-foundation (TASK-0018) で検証済
- auth-onboarding は UI 層なので新規 RLS ポリシーを追加しない

### データフロー（dataflow.md §3）
```
User input (1〜50字) → Zod 事前検証 → create(name)
  ↓
pending=true → rpc('create_group_with_owner', {group_name})
  ↓
[success] → useCurrentGroup().refresh() → pending=false → page navigateTo('/')
  ↓
[invalid_group_name] → setFieldError('name', error) → pending=false → <UFormField> inline 表示
```

参照元: docs/design/auth-onboarding/dataflow.md §3 (seq D5-1〜D5-4)

### スキーマ（supabase.ts 実測）
```typescript
// RPC signature
create_group_with_owner: {
  Args: { group_name: string }
  Returns: string  // group_id
}

// group_members.Row
{
  id: string
  user_id: string
  group_id: string
  joined_at: string
  ...timestamps
}

// groups.Row
{
  id: string
  name: string  // CHECK only (no UNIQUE)
  ...timestamps
}
```

参照元: app/types/supabase.ts (line 541)

---

## 5. テスト関連情報

### テストフレームワーク設定
- **Vitest**: tests/unit/ に集約、integration は別ファイル名 (*.integration.test.ts)
- **vitest.config.ts**: alias で supabase-client / async-data の安定化、include は tests/unit/**/*.test.ts
- **@nuxt/test-utils**: defineVitestConfig で auto-import / SSR 対応
- **参照元**: vitest.config.ts

### mock パターン（TASK-0007 参考）
1. **vi.hoisted**: ファクトリで spy 生成（ファイル先頭）
2. **vi.mock**: 実モジュール指定（'~/composables/useSupabaseClient' など）
3. **beforeEach**: vi.clearAllMocks() でテスト間隔離
4. **チェーン mock**: `.rpc().then({ data, error })` 形式

### 既存テストディレクトリ構成
```
tests/
├── unit/
│   └── composables/
│       ├── useFormErrors.test.ts (参考パターン)
│       ├── useErrorMessage.test.ts (参考パターン)
│       └── useCreateGroup.test.ts (TASK-0010 実装対象)
└── integration/
    └── (RPC 検証は data-foundation で完了)
```

参照元: vitest.config.ts / tests/unit/ 実測

### テストケース概要（最小カバレッジ）
1. **TC1: 成功** → rpc({ group_name }) で呼ばれる、refresh() が呼ばれる、{ data: group_id, error: null }
2. **TC2: invalid_group_name** → setFieldError('name', error) が呼ばれる、refresh() は呼ばれない

参照元: TASK-0010.md §単体テスト要件

---

## 6. 注意事項

### 🔵 確定事項（実装時自信あり）
1. **RPC 引数**: `group_name` (生成型・migration を真とする、p_group_name は誤記)
2. **戻り値型**: `ActionResult<string>` (data: group_id | null, error: unknown)
3. **エラー処理**: invalid_group_name のみ (UNIQUE_VIOLATION / GROUP_NAME_TAKEN は採用しない)
4. **pending**: try/finally で false に戻す（二重送信防止 EDGE-003）
5. **refresh 呼び**: 成功時のみ（error 時は呼ばない）
6. **useFormErrors チャネル**: inline (<UFormField>) のみ、toast / banner でない

### 🟡 実装時確認事項
1. **useCurrentGroup の実装**: TASK-0009 が完了済か確認（refresh 関数の型チェック）
2. **useFormErrors の実装**: TASK-0007 が完了済か確認（setFieldError シグネチャ確認）
3. **error-codes.ts**: INVALID_GROUP_NAME / ALREADY_IN_GROUP が既に定義されているか確認

### ⚠️ よくある罠
- `group_name` を `p_group_name` で呼ぶと RPC マッチ失敗
- refresh() を await しないと同期完了を待たずに page で stale data を読む
- `setFieldError('name', error)` の第2引数をスキップすると error 変換が走らない
- pending を never reset すると二重送信が起きる（try/finally 必須）
- GROUP_NAME_TAKEN / UNIQUE_VIOLATION で分岐を書くと、groups.name に UNIQUE 制約がないため到達不可

---

## 7. 次フェーズへの注意点

### requirements フェーズ（tsumiki:tdd-requirements）
- **TASK-0006 migration 確認**: create_group_with_owner RPC で group_name 引数が生成済か
- **error-codes.ts 確認**: INVALID_GROUP_NAME / ALREADY_IN_GROUP が既存か
- **useFormErrors 確認**: setFieldError(field, error, pgContext?) の型が合致するか

### testcases フェーズ（tsumiki:tdd-testcases）
- **テストケース 2つ（最小）**: 成功 / invalid_group_name の分岐代表
- **mock 戦略詳細**: useSupabaseClient.rpc / useCurrentGroup.refresh / useFormErrors.setFieldError の返却値・呼び出し検証方法
- **pending 初期化**: ref(false) で正しく初期化されるか確認

### green フェーズ（tsumiki:tdd-green）
- **error-handling.md 適用**: useErrorMessage().errorToMessage(error, 'create_group') で i18n 文言変換
- **useFormErrors 実装確認**: setFieldError が fieldErrors state に反映されるか（mock で検証）
- **pending finally**: エラー時も必ず false にリセット

### verify-complete フェーズ（tsumiki:tdd-verify-complete）
- **両テストケース通過**: TC1 success + TC2 invalid_group_name
- **型チェック**: UseCreateGroupReturn に create / pending / fieldErrors が全て expose されているか

---

## 8. 参考ファイル一覧（相対パス）

### 設計・要件文書
- docs/tasks/auth-onboarding/TASK-0010.md (実装詳細・完了条件)
- docs/design/auth-onboarding/architecture.md (アーキテクチャ・API マッピング)
- docs/design/auth-onboarding/dataflow.md (Group 作成フロー § D5-1〜D5-4)
- docs/design/auth-onboarding/interfaces.ts (型定義 § UseCreateGroupReturn / ActionResult)
- docs/design/cross-cutting/error-handling.md (エラー処理戦略 § 6.4 / 6.5)
- docs/spec/auth-onboarding/acceptance-criteria.md (受け入れ基準 REQ-003 / REQ-004 / REQ-109)

### 既存実装（参考）
- app/composables/useFormErrors.ts (TASK-0007 実装済)
- app/composables/useCurrentGroup.ts (TASK-0009 実装済)
- app/composables/useErrorMessage.ts (TASK-0007 実装済)
- app/schemas/group-name.ts (TASK-0006 実装済)
- app/types/supabase.ts (RPC 生成型)
- app/types/error-codes.ts (エラー識別子)

### テストサンプル
- tests/unit/composables/useFormErrors.test.ts (mock パターン・vi.hoisted 参考)
- tests/unit/composables/useErrorMessage.test.ts (mock useI18n / Sentry パターン)
- vitest.config.ts (alias / include 設定)

### 依存タスク（完了状況確認）
- TASK-0006: Zod group-name schema (事前検証用)
- TASK-0007: cross-cutting composable 4本（useFormErrors / useErrorMessage など）
- TASK-0009: useCurrentGroup（Read composable）
- TASK-0018: data-foundation (migration / RPC 実装・検証済)

---

## 🎯 要点まとめ

**実装**: useSupabaseClient + useFormErrors + useCurrentGroup を組み合わせた RPC composable

**RPC 呼び出し**: `rpc('create_group_with_owner', { group_name: groupName })`

**引数名**: `group_name` (生成型・migration 真とする、`p_group_name` は誤記)

**戻り値**: `{ create, pending, fieldErrors }` (UseCreateGroupReturn)

**エラー処理**: invalid_group_name → setFieldError('name', error)、success → refresh()

**pending**: try/finally で確実に false へリセット（二重送信防止）

**テスト**: 2 ケース（成功・invalid_group_name），mock useSupabaseClient/useCurrentGroup/useFormErrors
