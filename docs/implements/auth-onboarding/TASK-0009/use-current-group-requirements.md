# TASK-0009: useCurrentGroup（Read）— TDD 要件定義書

**機能名**: useCurrentGroup（現在の所属 Group 読み取り composable）
**タスク ID**: TASK-0009
**要件名**: auth-onboarding
**フェーズ**: Phase 2 - ドメインロジック層
**作成日**: 2026-06-01

---

## 1. 機能の概要（EARS要件定義書・設計文書ベース）

- 🔵 **何をする機能か**: ログイン中のユーザが所属している Group を 1 件読み取る Read 専用 composable。`group_members` テーブルを `groups` 埋め込み付きで SELECT し、`{ group_id, groups: { id, name } }` を返す。所属がなければ `null` を返す。
- 🔵 **どのような問題を解決するか**: middleware（TASK-0013）や各保護 page が「現在のユーザはどの Group に属しているか」を知る必要がある。各所で個別にクエリすると 1 ナビゲーション内で重複クエリが発生するため、`useAsyncData('current-group', ...)` の固定キーでラップして 1 ナビゲーション 1 クエリに集約する（NFR-002 / ADR-008 D4）。
- 🔵 **想定されるユーザー**: アプリのログイン済みユーザ全員（チームメンバー）。間接的には middleware と page コンポーネントがこの composable の消費者。
- 🔵 **システム内での位置づけ**: ドメインロジック層の Read composable。RLS（`is_member_of`、data-foundation で実装・検証済）で保護された PostgREST SELECT をラップする薄い層。UI 層ではない（表示責務は各 page が担う）。
- **参照したEARS要件**: REQ-005（所属 Group 取得）/ REQ-103 / NFR-002（重複クエリ防止）
- **参照した設計文書**: architecture.md §既存 API マッピング、interfaces.ts `CurrentGroup` / `AsyncState` / `UseCurrentGroupReturn`、ADR-006（1 user = 1 group）、ADR-008 D4（固定キー戦略）

---

## 2. 入力・出力の仕様（EARS機能要件・TypeScript型定義ベース）

### 入力

- 🔵 **明示的な引数**: なし（`useCurrentGroup()` は引数を取らない）。
- 🔵 **暗黙の入力（composable 内部依存）**:
  - `useSupabaseUser().value?.sub` — 認証ユーザの uid（JWT の `sub` claim）。**`user.id` ではなく `user.sub`** を使う（memory `project_mvp_revised_scope`）。
  - `useSupabaseClient<Database>()` — 型付き Supabase クライアント。
- 🔵 **クエリ仕様**: `from('group_members').select('group_id, groups(id, name)').eq('user_id', uid).maybeSingle()`（architecture.md §既存 API マッピングのクエリ実測）。

### 出力

- 🔵 **戻り値型**: `UseCurrentGroupReturn = AsyncState<CurrentGroup>`（interfaces.ts）。
  ```ts
  interface AsyncState<T> {
    data: Ref<T | null>
    pending: Ref<boolean>
    error: Ref<Error | null>
    refresh: () => Promise<void>
  }
  ```
- 🔵 **`CurrentGroup` 型（interfaces.ts）**:
  ```ts
  interface CurrentGroup {
    group_id: string                              // group_members.Row['group_id']
    groups: Pick<groups.Row, 'id' | 'name'> | null // 埋め込み、null 許容
  }
  ```
- 🔵 **所属あり時の `data.value`**: `{ group_id: 'g1', groups: { id: 'g1', name: 'チームA' } }`
- 🔵 **未所属時の `data.value`**: `null`（`.maybeSingle()` の 0 行を正常値として扱う）。
- 🔵 **uid 不在（未認証）時**: handler が即時 `null` を返す（middleware 側で catch する想定）。

### 入出力の関係性

- 🔵 uid → `eq('user_id', uid)` で絞り込み → `.maybeSingle()` で 0/1 行 → 1 行なら `CurrentGroup`、0 行なら `null`。
- 🔵 クエリ `error` が非 null の場合は **そのまま throw** し、`error.vue` グローバルフォールバックに委ねる（チャネル分岐なし）。

### データフロー

- 🔵 page / middleware → `useCurrentGroup()` → `useAsyncData('current-group', handler)` → handler が PostgREST SELECT → RLS（`is_member_of`）で行フィルタ → `{ data, error }` → `data` を返却 or `error` を throw。

- **参照したEARS要件**: REQ-005 / REQ-103 / NFR-002
- **参照した設計文書**: interfaces.ts `CurrentGroup` / `AsyncState` / `UseCurrentGroupReturn`、architecture.md §既存 API マッピング、dataflow.md（middleware → composable 経路）

---

## 3. 制約条件（EARS非機能要件・アーキテクチャ設計ベース）

- 🔵 **パフォーマンス（NFR-002）**: `useAsyncData` のキーは必ず固定文字列 `'current-group'`。middleware（TASK-0013）と各 page が同一キーで呼ぶことで 1 ナビゲーション 1 クエリを保証する。**動的キー禁止**（重複クエリの原因）。
- 🔵 **セキュリティ**: 行アクセスは `group_members` の RLS（`is_member_of`、data-foundation で適用・検証済）に委ねる。本 composable では追加の認可ロジックを持たない。uid は JWT の `sub` から取得。
- 🔵 **データ整合性（ADR-006）**: 1 user = 1 group が DB 制約で保証されるため、`group_members` の該当ユーザ行は最大 1 行。よって `.maybeSingle()` で複数行例外は発生しない。0 行は正常な「未所属」状態。
- 🔵 **エラーハンドリング制約**: クエリエラーは throw のみ（error-handling.md のチャネル分岐は本タスク非適用）。`useErrorMessage` 等 cross-cutting composable は使わない（後続タスク）。
- 🔵 **アーキテクチャ制約（ADR-007）**: 実装ファイルは `app/composables/useCurrentGroup.ts`。Composition API / `<script setup>` 規約・TypeScript strict mode に従う。
- 🔵 **型制約（embed null 許容の確定結果）**: 後述「groups embed の null 許容判定結果」のとおり、生成型 `app/types/supabase.ts` の出力に従い `groups: ... | null` を採用する。interfaces.ts の `CurrentGroup` は既にこの形で確定済（`| null` を外さない）。
- 🔵 **データベース制約（supabase.ts 実測）**:
  - `group_members.Row`: `group_id: string`（非 null 列）、FK `group_members_group_id_fkey` → `groups.id`、`isOneToOne: false`。
  - `groups.Row`: `id: string` / `name: string`。

- **参照したEARS要件**: NFR-002、REQ-005、REQ-103
- **参照した設計文書**: architecture.md §既存 API マッピング、ADR-006、ADR-007、ADR-008 D4、app/types/supabase.ts（`group_members` / `groups`）、docs/design/cross-cutting/error-handling.md（参考・非適用）

---

## 4. 想定される使用例（EARSEdgeケース・データフローベース）

### 基本的な使用パターン

- 🔵 **所属あり**: ログイン済みユーザがある Group に所属。`useCurrentGroup()` → `data.value = { group_id, groups: { id, name } }`。middleware は所属ありとして保護 page へ通過させ、page は `groups.name` を表示。
- 🔵 **未所属**: ログイン済みだがどの Group にも未所属。`data.value = null`。middleware は join/onboarding ページへリダイレクト（後続タスク）。

### データフロー

- 🔵 middleware（`/protected/*`）→ `useCurrentGroup()` → 固定キー `'current-group'` で 1 クエリ → page も同キーでキャッシュ再利用（クエリ追加発行なし）。

### エッジケース

- 🔵 **EDGE: uid 不在（未認証 / `/confirm` 等で user 未解決）**: `user.value?.sub` が `undefined` → handler 即時 `return null`（クエリを発行しない）。
- 🔵 **EDGE: 0 行（未所属）**: `.maybeSingle()` が `{ data: null, error: null }` → `null` を返す（例外を投げない）。

### エラーケース

- 🔵 **クエリエラー（RLS 拒否・ネットワーク・PostgREST エラー等）**: `{ data, error: <非null> }` → `throw error` → Nuxt の `error.vue` グローバルフォールバックで処理。本 composable はエラーメッセージ整形をしない。

- **参照したEARS要件**: REQ-005、NFR-002、EDGE（未認証 uid / 0 行 / クエリエラー）
- **参照した設計文書**: dataflow.md（middleware → composable → page）、architecture.md §既存 API マッピング、note.md §6 注意事項

---

## 5. groups embed の null 許容 判定結果（🟡 注の確定）

interfaces.ts / note.md / TASK-0009.md に残っていた「🟡 実装時確定: embed `groups` の null 許容を生成型で確定する」を、`app/types/supabase.ts` の実測で以下のとおり**確定**した。

- 🔵 **確定結論**: `CurrentGroup.groups` は **`| null` を維持する**（`Pick<groups.Row, 'id' | 'name'> | null`）。interfaces.ts の現行定義どおりで変更不要。
- 🔵 **根拠**:
  - `group_members` の FK `group_members_group_id_fkey` は `columns: ["group_id"]` / `referencedRelation: "groups"` / `isOneToOne: false`。
  - FK 列 `group_id` 自体は非 null だが、Supabase の型ジェネレータは `isOneToOne: false`（to-one が型上保証されない）埋め込みリレーションを **nullable** として推論する。そのため生成型上 `groups` 埋め込みは `| null` を含む。
  - 「生成型を真とする」方針（note.md §2 型チェック）に従い `| null` を残す。
- 🟡 **実装上の含意**: 所属あり行でも型上は `groups` が `null` になり得るため、page 側で `groups?.name` のように optional access が必要になる。本 composable の戻り値型としては `| null` のままで正しい（実データ上は FK 必須なので非 null だが、型の安全側に倒す）。

---

## 6. EARS要件・設計文書との対応関係

- **参照したユーザストーリー**: ログインユーザが自分の所属 Group を参照する（auth-onboarding overview / spec note.md）
- **参照した機能要件**: REQ-005（所属 Group 取得）、REQ-103
- **参照した非機能要件**: NFR-002（1 ナビゲーション 1 クエリ / 重複クエリ防止）、NFR-202（page 側 `<USkeleton>` 用に `pending` を expose）
- **参照したEdgeケース**: 未認証 uid（→ null）、0 行未所属（→ null）、クエリエラー（→ throw）
- **参照した受け入れ基準（完了条件）**:
  - `from('group_members').select('group_id, groups(id, name)').eq('user_id', uid).maybeSingle()` でクエリ
  - uid は `useSupabaseUser().value.sub`
  - `useAsyncData('current-group', ...)` 固定キー
  - 所属時 `{ group_id, groups: { id, name } }` / 未所属 `null`
  - 戻り値が `UseCurrentGroupReturn`（`data` / `pending` / `error` / `refresh`）と一致
- **参照した設計文書**:
  - **アーキテクチャ**: architecture.md §既存 API マッピング（クエリ実測・throw 方針）
  - **データフロー**: dataflow.md（middleware → composable → page、固定キー共有）
  - **型定義**: interfaces.ts `CurrentGroup`（L38-41）/ `AsyncState`（L58-63）/ `UseCurrentGroupReturn`（L122）
  - **データベース**: app/types/supabase.ts `group_members`（L58-95）/ `groups`（L96-）
  - **ADR**: ADR-006（1 user = 1 group）、ADR-007（composable 規約）、ADR-008 D4（固定キー）、ADR-012 D5（Vitest 単体テスト）
  - **エラー実装規約**: docs/design/cross-cutting/error-handling.md（参考・本タスクは throw のみで非適用）

---

## 7. 単体テスト要件（次フェーズ tdd-testcases への引き継ぎ）

> mock 戦略: `vi.mock('#imports')`（または元モジュール）で `useSupabaseClient` / `useSupabaseUser` / `useAsyncData` を差し替え。`from().select().eq().maybeSingle()` チェーンを mock し `{ data, error }` を返す。`useAsyncData` は handler を即時実行して返すスタブ。`beforeEach` で `vi.clearAllMocks()`。最小カバレッジ（境界: 所属あり / 未所属の 2 ケース）。テストファイル: `tests/unit/composables/useCurrentGroup.test.ts`。

- 🔵 **テストケース1（所属あり）**: `maybeSingle()` が `{ data: { group_id: 'g1', groups: { id: 'g1', name: 'チームA' } }, error: null }`、`user.value.sub = 'u1'` のとき、`data.value` が同オブジェクトになり `eq('user_id', 'u1')` で呼ばれる。
- 🔵 **テストケース2（未所属）**: `maybeSingle()` が `{ data: null, error: null }` のとき、`data.value` が `null`（例外を投げない）。

---

## 品質判定

- ✅ **高品質**
  - 要件の曖昧さ: なし（クエリ・uid・固定キー・戻り値型すべて確定）
  - 入出力定義: 完全（引数なし、暗黙入力 2 つ、戻り値 `AsyncState<CurrentGroup>` を型まで特定）
  - 制約条件: 明確（NFR-002 固定キー、ADR-006 単数保証、throw 方針、embed null 確定）
  - 実装可能性: 確実（実装スケルトンが TASK-0009.md に存在、生成型確認済）
  - 信頼性レベル分布: 🔵 多数 / 🟡 1 点（embed null の実装含意のみ）/ 🔴 なし
  - **🟡 注の解消**: groups embed の null 許容を supabase.ts 実測で確定（`| null` 維持）。残る未確定なし。
