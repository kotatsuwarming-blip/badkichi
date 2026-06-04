# TASK-0002 usePlayers TDD要件定義書

**要件名**: player-management / **TASK-ID**: TASK-0002 / **機能名**: usePlayers (Read composable)
**作成日**: 2026-06-02
**信頼性サマリー**: 🔵 100%（実装スケルトン・テスト3件確定済み、全項目が EARS 要件 + interfaces.ts + 既存実装に裏付けあり）

---

## 1. 機能の概要（EARS要件定義書・設計文書ベース）

- 🔵 **何をする機能か**: ログイン中ユーザが所属する Group の**未削除選手一覧を name 昇順で返す Read 専用 composable** `app/composables/usePlayers.ts`。`useAsyncData<Player[]>('players', handler)` の固定キーでラップする。
- 🔵 **解決する問題**: 選手一覧 page（TASK-0008）が、自 Group・未削除の選手のみを安定したキャッシュキーで取得できるようにする。追加/編集/削除後は同一固定キーの `refresh()` で一覧を再取得できる。
- 🔵 **想定ユーザー**: Group に所属するメンバー（group_members にロール列が無いためメンバー全員が選手管理可、`docs/spec/player-management/note.md`）。
- 🔵 **システム内での位置づけ**: Phase 1（基盤 + composable 層）の Read composable。page/component は supabase を直叩きせず本 composable 経由でアクセスする（REQ-403）。`useCurrentGroup.ts` と同じ「Database 型付きクライアント + 固定キー共有」思想に揃える（ADR-007 D4）。
- **参照したEARS要件**: REQ-001（一覧取得）/ REQ-201（空状態）/ REQ-403（composable 経由）/ NFR-001（部分インデックス活用）
- **参照した設計文書**: `docs/design/player-management/architecture.md`（composable 構成）, `docs/design/player-management/interfaces.ts`（UsePlayersReturn）

## 2. 入力・出力の仕様（EARS機能要件・TypeScript型定義ベース）

- 🔵 **入力パラメータ**: なし（引数なし）。内部状態として以下を読む:
  - `useCurrentGroup().data.value?.group_id`（型 `string | undefined`）— 所属 Group の id。
  - `useSupabaseClient<Database>()` — 型付き PostgREST クライアント。
- 🔵 **出力値**: `UsePlayersReturn = AsyncState<Player[]>`（`interfaces.ts §3`）
  - `data: Ref<Player[] | null>` — 未削除選手の name 昇順配列。0 件・未取得時は `[]`。
  - `pending: Ref<boolean>` / `error: Ref<Error | null>` / `refresh: () => Promise<void>`
  - `Player = { id, name, handedness: Handedness }`（`app/types/player.ts`）。`handedness` は生成型 `string` を `'right' | 'left' | 'unknown'` に narrow（`as Player[]`）。
- 🔵 **入出力の関係性**:
  - `group_id` が取得できる → `from('players').select('id, name, handedness').eq('group_id', gid).is('deleted_at', null).order('name')` の結果を `Player[]` で返す。
  - `group_id` 未取得（未所属/未認証）→ **クエリ未発行で `[]` を返す**。
  - クエリ `error` が返った場合 → `throw error`（`error.vue` グローバルフォールバックに委譲）。
- 🔵 **データフロー**: `useAsyncData('players')` 固定キーで 1 ナビゲーション 1 クエリ。handler 内で `currentGroup.data.value?.group_id` → ガード → PostgREST SELECT → narrow 返却。
- **参照したEARS要件**: REQ-001 / REQ-201 / NFR-001
- **参照した設計文書**: `interfaces.ts`（`UsePlayersReturn`, `AsyncState<T>`, `Player`, `Handedness`）, `app/types/player.ts`

## 3. 制約条件（EARS非機能要件・アーキテクチャ設計ベース）

- 🔵 **パフォーマンス要件（NFR-001）**: `is('deleted_at', null)` フィルタを必ず含め、部分インデックス `idx_players_group_id ON players(group_id) WHERE deleted_at IS NULL` を効かせる。`eq('group_id', gid)` も明示する（RLS と二重だがインデックス活用とテスト検証性のため）。
- 🔵 **キャッシュ制約（ADR-007 D4 / NFR）**: `useAsyncData` のキーは**必ず固定文字列 `'players'`**。動的キー（group_id を埋め込む等）は 1 ナビゲーション内で重複クエリを生むため禁止。
- 🔵 **セキュリティ要件（NFR-101 / RLS）**: RLS `players_select = is_member_of(group_id)` で自 Group のみが返る。クエリでも `eq('group_id', gid)` を明示し二重防御する。
- 🔵 **アーキテクチャ制約（REQ-403 / ADR-007）**: page/component から supabase 直叩き禁止、composable 経由のみ。エラー整形（useToast）は本 composable で行わず throw して `error.vue` に委ねる（`useCurrentGroup` と同方針）。
- 🔵 **データベース制約（initial_schema.sql）**: `players` は `group_id NOT NULL`、`handedness CHECK(right/left/unknown)`、ソフト削除（`deleted_at`、DELETE ポリシーなし）。`select` 列は `'id, name, handedness'` のみ（余分な列を取得しない）。
- 🔵 **コーディング制約（CLAUDE.md）**: `<script setup lang="ts">`・Composition API のみ・TypeScript strict・ESLint(1tbs, no comma dangle)。`pnpm typecheck` / `pnpm lint` が通ること。
- **参照したEARS要件**: NFR-001 / NFR-101 / REQ-403 / ADR-007 D4
- **参照した設計文書**: `docs/spec/player-management/note.md`（players スキーマ + RLS）, `app/composables/useCurrentGroup.ts`（固定キーパターン）

## 4. 想定される使用例（EARSEdgeケース・データフローベース）

- 🔵 **基本パターン（REQ-001）**: 所属 Group あり（`group_id = 'g1'`）→ `from('players')` で `eq('group_id', 'g1')` / `is('deleted_at', null)` / `order('name')` を実行し、取得行配列を返す。
- 🔵 **エッジ: 0 件**: 自 Group に未削除選手が 0 人 → 空配列 `[]` を返す（空状態 REQ-201、page が空状態 UI を表示）。
- 🔵 **エッジ: group_id 未取得（NFR-001 / 未所属ガード）**: `useCurrentGroup().data.value = null`（未所属/未認証）→ クエリ未発行で `[]` を返す（`from('players')` を呼ばない）。
- 🔵 **エッジ: deleted_at 設定済み行（EDGE-005）**: `is('deleted_at', null)` フィルタにより削除済み選手は一覧から除外される。
- 🔵 **エラーケース**: PostgREST/RLS/通信エラー → `if (error) throw error` で `error.vue` に委譲（本 composable はチャネル分岐を持たない）。
- 🔵 **リフレッシュ**: 追加/編集/削除（TASK-0003〜0005）後は page 側で `usePlayers().refresh()` を呼び、同一固定キーで再取得する。
- **参照したEARS要件**: REQ-001 / REQ-201 / EDGE-005 / NFR-001
- **参照した設計文書**: `docs/design/player-management/dataflow.md`, `docs/tasks/player-management/TASK-0002.md`（単体テスト要件）

## 5. EARS要件・設計文書との対応関係

- **参照したユーザストーリー**: 選手一覧の閲覧（Group メンバーが自チームの選手を name 昇順で一覧する）
- **参照した機能要件**: REQ-001（一覧取得）/ REQ-201（空状態）/ REQ-403（composable 経由）
- **参照した非機能要件**: NFR-001（部分インデックス + deleted_at IS NULL フィルタ）/ NFR-101（RLS 自 Group 限定）
- **参照したEdgeケース**: EDGE-005（deleted_at 設定済み行の除外）/ 未所属ガード（group_id 未取得で `[]`）
- **参照した受け入れ基準**:
  - TC-001-01: `from('players')` 呼出 + `eq('group_id', 'g1')` 呼出 + 取得行配列返却
  - TC-001-02: `is('deleted_at', null)` 呼出 + `order('name')` 呼出
  - TC-NFR-001-01: `group_id` 未取得時 `[]` 返却 + `from('players')` 未呼出
- **参照した設計文書**:
  - **アーキテクチャ**: `docs/design/player-management/architecture.md`（composable 構成、固定キー Read）
  - **データフロー**: `docs/design/player-management/dataflow.md`
  - **型定義**: `docs/design/player-management/interfaces.ts`（`UsePlayersReturn = AsyncState<Player[]>`, `Player`, `Handedness`）, `app/types/player.ts`
  - **データベース**: `supabase/migrations/20260519060000_initial_schema.sql`（`players` テーブル + `idx_players_group_id` 部分インデックス）
  - **API仕様**: PostgREST 直接（`from('players').select(...).eq(...).is(...).order(...)`）。専用 REST エンドポイントなし。

---

## 品質判定

- 要件の曖昧さ: なし（実装スケルトン・テスト3件が確定済み）
- 入出力定義: 完全（`UsePlayersReturn = AsyncState<Player[]>`、入力なし、ガード/エラー分岐明確）
- 制約条件: 明確（固定キー・部分インデックス・RLS・select 列限定）
- 実装可能性: 確実（`useCurrentGroup.ts` の同型実装が既存）
- 信頼性レベル: 🔵 100%

**判定**: ✅ 高品質
