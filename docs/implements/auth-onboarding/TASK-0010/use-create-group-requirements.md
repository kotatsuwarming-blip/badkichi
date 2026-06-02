# TASK-0010 useCreateGroup（RPC） TDD 要件定義書

**機能名**: useCreateGroup（RPC）
**タスクID**: TASK-0010
**要件名**: auth-onboarding
**フェーズ**: Phase 2 - ドメインロジック層
**作成日**: 2026-06-01

---

## 0. サマリー

`create_group_with_owner` RPC を内包する Write 系 composable。`create(groupName)` で Group を作成し、成功時は所属状態 (`useCurrentGroup`) を最新化、検証エラー (`invalid_group_name`) は `useFormErrors` チャネルで inline 表示する。二重送信防止のため `pending` を持つ。戻り値型は interfaces.ts `UseCreateGroupReturn`。

---

## 1. 機能の概要（EARS要件定義書・設計文書ベース）

- 🔵 **何をする機能か**
  Badminton analytics アプリにおいて「新しいグループ（チーム）を作成する」機能を提供する composable。`create(groupName)` を呼ぶと Supabase RPC `create_group_with_owner` を実行し、グループ作成と同時に呼び出しユーザを owner として自動登録する。成功時は新規 `group_id` を返す。

- 🔵 **どのような問題を解決するか**
  ユーザが自分のチームを立ち上げて分析を始められるようにする。所属グループのない新規ユーザが、グループ作成を起点に onboarding を完了できる（As a 新規ユーザ / So that 自分のチームでバドミントン分析を始められる）。

- 🔵 **想定されるユーザー**
  グループ未所属の認証済みユーザ（onboarding 中のユーザ）。グループ作成 page (TASK-0017 `groups/new.vue`) を経由して利用する。

- 🟡 **システム内での位置づけ**
  ドメインロジック層（composable）。UI 層 (`groups/new.vue`) と データ層 (Supabase RPC) の中間に位置し、RPC 呼び出し・pending 管理・エラーチャネル振り分け・所属状態更新の責務を持つ。UI 表示そのものは持たない。RLS/RPC 本体は data-foundation (TASK-0018) で実装・検証済み。

- **参照したEARS要件**: REQ-004（グループ作成）、REQ-109（フィールド検証エラーの inline 表示）、EDGE-003（二重送信防止）
- **参照した設計文書**:
  - architecture.md §既存 API マッピング 注1
  - dataflow.md §3（Group 作成シーケンス D5-1〜D5-4）
  - interfaces.ts §5 `UseCreateGroupReturn`

---

## 2. 入力・出力の仕様（EARS機能要件・TypeScript型定義ベース）

### 2.1 composable シグネチャ 🔵

```ts
export function useCreateGroup(): UseCreateGroupReturn
```

引数なし。Nuxt composable として page から呼び出される。

### 2.2 戻り値 `UseCreateGroupReturn` 🔵

```ts
export interface UseCreateGroupReturn {
  create: (groupName: string) => Promise<ActionResult<string>>
  pending: Ref<boolean>
  fieldErrors: Ref<Record<string, string>>
}
```

| プロパティ | 型 | 説明 |
|---|---|---|
| `create` | `(groupName: string) => Promise<ActionResult<string>>` | グループ作成アクション。`data` に `group_id`（成功時）。 |
| `pending` | `Ref<boolean>` | RPC 実行中フラグ。初期値 `false`。UI が送信ボタン disabled に利用 (EDGE-003)。 |
| `fieldErrors` | `Ref<Record<string, string>>` | フィールド単位のエラー文言。`invalid_group_name` 時 `name` キーに文言が載る (REQ-109)。 |

- **参照したインターフェース**: interfaces.ts §5 `UseCreateGroupReturn`（line 126-131）

### 2.3 `create` の入力 🔵

| パラメータ | 型 | 制約 |
|---|---|---|
| `groupName` | `string` | グループ名。RPC へ `{ group_name: groupName }` として渡す。事前検証（1〜50 文字 / 空白不可）は page 側で TASK-0006 Zod schema が担う。RPC 側 `invalid_group_name` は二重防御。 |

### 2.4 `create` の出力 `ActionResult<string>` 🔵

```ts
export interface ActionResult<T> {
  data: T | null   // 成功時 group_id(string)、失敗時 null
  error: unknown   // 成功時 null、失敗時 Supabase error
}
```

- 成功: `{ data: 'g1', error: null }`（`data` は新規 `group_id`）
- 検証エラー: `{ data: null, error: { message: 'invalid_group_name' } }`
- page は `error` を「成功/失敗の分岐」にのみ使い、表示はチャネル state (`fieldErrors`) を見る (ADR-007 §補遺)。

- **参照したインターフェース**: interfaces.ts §3 `ActionResult<T>`（line 67-70）

### 2.5 RPC 呼び出し仕様 🔵

```ts
const { data, error } = await supabase.rpc('create_group_with_owner', {
  group_name: groupName
})
```

| 項目 | 値 |
|---|---|
| RPC 名 | `create_group_with_owner` |
| 引数名 | `group_name`（`p_group_name` は要件定義の誤記。生成型 `app/types/supabase.ts` を真とする） |
| 戻り値型 | `string`（group_id） |
| client | `useSupabaseClient<Database>()` |

- **参照した設計文書**: architecture.md §既存 API マッピング、app/types/supabase.ts `create_group_with_owner: { Args: { group_name: string }, Returns: string }`

### 2.6 データフロー（dataflow.md §3） 🔵

```
create(name)
  → clear()                                   // 前回エラー消去
  → pending = true
  → rpc('create_group_with_owner', {group_name})
      ├ [success] → useCurrentGroup().refresh() (D5-4) → 所属状態最新化
      └ [invalid_group_name] → setFieldError('name', error) → <UFormField> inline 表示 (refresh 呼ばない)
  → pending = false (try/finally)
  → return { data, error }
```

- **参照した設計文書**: dataflow.md §3（seq D5-1〜D5-4）

---

## 3. 制約条件（EARS非機能要件・アーキテクチャ設計ベース）

- 🔵 **エラーチャネル制約 (REQ-109 / NFR-201)**
  検証エラーは `useFormErrors` の inline 表示 (`<UFormField>`) のみ。toast (`useToastErrors`) でも banner (`<UAlert>` / `useNoticeErrors`) でもない (error-handling.md §6.5 代表例 #2)。

- 🔵 **エラー種別の制約（注1）**
  create のエラーは `invalid_group_name` のみ。`groups.name` に UNIQUE 制約がない（CHECK のみ）ため「同名グループ重複」エラーは存在しない。ADR-007 D4-2 例の `GROUP_NAME_TAKEN` / `UNIQUE_VIOLATION` 分岐は**採用しない**（到達不能）。

- 🔵 **二重送信防止制約 (EDGE-003)**
  `create` 実行中 `pending = true`、完了時（成功・エラー問わず）`pending = false`。`pending = false` は try/finally で確実に実行する。

- 🔵 **状態更新制約 (D5-4)**
  RPC 成功時のみ `useCurrentGroup().refresh()` を `await` して所属状態を最新化する。`await` しないと page が stale data を読む。エラー時は refresh を呼ばない。

- 🔵 **戻り値契約制約**
  `create` の戻り値は `UseCreateGroupReturn` と完全一致する必要がある。生 error（AppErrorCode ref）は expose しない (ADR-007 §補遺)。

- 🟡 **アーキテクチャ制約**
  auth-onboarding は UI 層であり、新規 RLS ポリシー・RPC は追加しない。`create_group_with_owner` 本体（owner 自動登録 / `invalid_group_name` 発火）は data-foundation (TASK-0018) で実装・検証済み。

- 🔵 **型安全性制約**
  `useSupabaseClient<Database>()` で型付き client を取得し、RPC 引数・戻り値が生成型と整合する。TypeScript strict mode。

- 🔵 **依存制約**
  前提タスク: TASK-0006（Zod group-name schema）、TASK-0007（useFormErrors / useErrorMessage）、TASK-0009（useCurrentGroup）。後続タスク: TASK-0017（groups/new.vue）。

- **参照したEARS要件**: REQ-004、REQ-109、NFR-201、EDGE-003
- **参照した設計文書**: architecture.md §既存 API マッピング 注1、error-handling.md §6.5、dataflow.md §3、interfaces.ts §5

---

## 4. 想定される使用例（EARS Edgeケース・データフローベース）

### 4.1 基本的な使用パターン（成功） 🔵

```ts
const { create, pending, fieldErrors } = useCreateGroup()
const result = await create('チームA')
// rpc('create_group_with_owner', { group_name: 'チームA' }) が呼ばれる
// useCurrentGroup().refresh() が呼ばれる
// result = { data: 'g1', error: null }
// pending は実行中 true → 完了後 false
```

- **参照したEARS要件**: REQ-004
- **参照した設計文書**: dataflow.md §3 D5-4

### 4.2 エッジ／エラーケース（invalid_group_name） 🔵

```ts
const { create, fieldErrors } = useCreateGroup()
const result = await create('')  // 不正名（二重防御）
// rpc が { data: null, error: { message: 'invalid_group_name' } } を返す
// setFieldError('name', error) が呼ばれ fieldErrors.value['name'] に文言が載る
// useCurrentGroup().refresh() は呼ばれない
// result = { data: null, error: {...} }
// pending は finally で false に戻る
```

- **参照したEARS要件**: REQ-109、EDGE-003
- **参照した設計文書**: architecture.md §既存 API マッピング 注1、error-handling.md §6.5

### 4.3 二重送信防止フロー (EDGE-003) 🔵

`create` 呼び出し中は `pending = true` のため、page は送信ボタンを `disabled={pending.value}` にして 2 回目の送信を防ぐ。RPC が成功でもエラーでも finally で `pending = false` に戻り、再送信が可能になる。

- **参照したEARS要件**: EDGE-003

---

## 5. EARS要件・設計文書との対応関係

- **参照したユーザストーリー**: 新規ユーザのグループ作成 onboarding（As a 新規ユーザ / So that 自分のチームでバドミントン分析を始められる）
- **参照した機能要件**: REQ-004（グループ作成 RPC）、REQ-109（フィールド検証エラーの inline 表示）
- **参照した非機能要件**: NFR-201（inline error 表示）
- **参照したEdgeケース**: EDGE-003（二重送信防止）
- **参照した受け入れ基準**:
  - `create(groupName)` が `rpc('create_group_with_owner', { group_name: groupName })` を呼ぶ
  - RPC 成功時に `useCurrentGroup().refresh()` を呼ぶ
  - `invalid_group_name` 時に `setFieldError('name', error)` で `fieldErrors['name']` をセット（refresh は呼ばない）
  - `create` 実行中は `pending = true`、完了で `false`
  - `create` が `ActionResult<string>`（`{ data: group_id, error }`）を返す
  - 戻り値が `UseCreateGroupReturn`（`create` / `pending: Ref<boolean>` / `fieldErrors: Ref<Record<string, string>>`）と一致
- **参照した設計文書**:
  - **アーキテクチャ**: architecture.md §既存 API マッピング 注1（`create_group_with_owner`、`group_name` 引数、UNIQUE 制約なし）
  - **データフロー**: dataflow.md §3（Group 作成シーケンス D5-1〜D5-4）
  - **型定義**: interfaces.ts §5 `UseCreateGroupReturn`（line 126-131）、§3 `ActionResult<T>`（line 67-70）
  - **データベース**: app/types/supabase.ts `create_group_with_owner: { Args: { group_name: string }, Returns: string }`、`groups.name`（CHECK のみ・UNIQUE なし）
  - **API仕様**: architecture.md §既存 API マッピング（RPC 一覧）
  - **エラー実装規約**: error-handling.md §6.5 代表例 #2（inline チャネル）

---

## 6. 実装・テスト対象ファイル

- **実装ファイル**: `app/composables/useCreateGroup.ts`
- **テストファイル**: `tests/unit/composables/useCreateGroup.test.ts`
- **mock 対象**: `useSupabaseClient`（`rpc` spy）/ `useCurrentGroup`（`refresh` spy）/ `useFormErrors`（`setFieldError` / `clear` spy）

---

## 7. テストケース概要（最小カバレッジ）

| # | ケース | 入力 | 期待 | 信頼性 |
|---|---|---|---|---|
| TC1 | 成功 | `create('チームA')`、`rpc` → `{ data: 'g1', error: null }` | `rpc('create_group_with_owner', { group_name: 'チームA' })` 呼出、`refresh` 呼出、戻り `{ data: 'g1', error: null }` | 🔵 |
| TC2 | invalid_group_name | `create('')`、`rpc` → `{ data: null, error: { message: 'invalid_group_name' } }` | `setFieldError('name', error)` 呼出、`fieldErrors.value['name']` 非 undefined、`refresh` 呼ばれない | 🔵 |

統合テストは対象外（RPC 本体は data-foundation で検証済み、ADR-012 D2）。

---

## 8. 信頼性レベルサマリー

| カテゴリ | 🔵 | 🟡 | 🔴 | 合計 |
|---|---|---|---|---|
| 1. 機能概要 | 3 | 1 | 0 | 4 |
| 2. 入出力仕様 | 6 | 0 | 0 | 6 |
| 3. 制約条件 | 6 | 1 | 0 | 7 |
| 4. 使用例 | 3 | 0 | 0 | 3 |
| **合計** | **18** | **2** | **0** | **20** |

- 🔵 90% / 🟡 10% / 🔴 0%

**品質判定**: ✅ 高品質
- 要件の曖昧さ: なし（RPC 名・引数名・戻り値型・エラー種別すべて確定）
- 入出力定義: 完全（interfaces.ts / supabase.ts と一致）
- 制約条件: 明確（チャネル / 二重送信 / エラー種別が確定）
- 実装可能性: 確実（依存 composable は実装済み）
- 信頼性レベル: 🔵 が大多数（90%）
