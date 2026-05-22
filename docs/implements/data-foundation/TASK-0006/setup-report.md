# TASK-0006 設定作業実行

## 作業概要

- **タスクID**: TASK-0006
- **作業内容**: RLS ヘルパー関数 `is_member_of()` + 全 11 テーブルの RLS 有効化と RLS ポリシー定義を、既存マイグレーション `20260519060000_initial_schema.sql` の末尾に追記
- **実行日時**: 2026-05-19
- **実行者**: Claude Code (direct-setup)

## 設計文書参照

- **参照文書**:
  - `docs/tasks/data-foundation/TASK-0006.md` (完了条件)
  - `docs/design/data-foundation/database-schema.sql` (Source of Truth、RLS セクション 行 38〜471)
- **関連要件**: REQ-101 / REQ-201 / NFR-104 / EDGE-003
- **スキーマレビュー反映**: ⑦ A-1 / A-2 (groups / group_members の直接 INSERT 禁止)、② B-7 (recording_gaps の 3 ポリシー)
- **方針確定事項**:
  - B1 (2026-05-13): RLS は新規マイグレーションを作らず TASK-0005 のファイル末尾に追記する
  - B2 (2026-05-13): `is_member_of()` を含む全 SECURITY DEFINER 関数に `SET search_path = public` を必ず付与する

## 実行した作業

### 1. ディレクトリ作成

```bash
mkdir -p docs/implements/data-foundation/TASK-0006
```

### 2. マイグレーションファイルへの追記

**対象ファイル**: `supabase/migrations/20260519060000_initial_schema.sql`

既存ファイルの末尾 (インデックス定義のあと、行 296 の直後) に以下を順に追記しました。新規マイグレーションファイルは作成していません (B1 確定方針)。

#### 2-1. RLS ヘルパー関数 `is_member_of()`

`database-schema.sql` 行 38〜51 を転写し、TASK-0006 完了条件 / B2 確定方針に従い `SET search_path = public` を **明示的に追加** しました (Source of Truth 側には未記載のため差分が発生。CI の `supabase db lint` で `function_search_path_mutable` として検出される問題を最初から防ぐための二重防御)。

```sql
CREATE OR REPLACE FUNCTION is_member_of(target_group_id uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM group_members
    WHERE group_id = target_group_id
      AND user_id = auth.uid()
      AND deleted_at IS NULL
  );
$$;
```

#### 2-2. 全 11 テーブルの RLS 有効化

`database-schema.sql` 行 318〜328 を完全転写。`groups`, `group_members`, `group_invitations`, `players`, `matches`, `sets`, `set_player_positions`, `rallies`, `shots`, `position_overrides`, `recording_gaps` の 11 テーブルで `ALTER TABLE ... ENABLE ROW LEVEL SECURITY`。

#### 2-3. RLS ポリシー定義 (28 個)

`database-schema.sql` 行 330〜471 を完全転写。

| テーブル | SELECT | INSERT | UPDATE | 計 |
|---|---|---|---|---|
| groups | `groups_select` | (作成しない: ⑦ A-1) | `groups_update` | 2 |
| group_members | `group_members_select` | (作成しない: ⑦ A-2) | - | 1 |
| group_invitations | `group_invitations_select` | (作成しない: RPC 経由) | - | 1 |
| players | `players_select` | `players_insert` | `players_update` | 3 |
| matches | `matches_select` | `matches_insert` | `matches_update` | 3 |
| sets | `sets_select` | `sets_insert` | `sets_update` | 3 |
| set_player_positions | `spp_select` | `spp_insert` | `spp_update` | 3 |
| rallies | `rallies_select` | `rallies_insert` | `rallies_update` | 3 |
| shots | `shots_select` | `shots_insert` | `shots_update` | 3 |
| position_overrides | `po_select` | `po_insert` | `po_update` | 3 |
| recording_gaps | `recording_gaps_select` | `recording_gaps_insert` | `recording_gaps_update` | 3 |
| **合計** | 11 | 8 | 9 | **28** |

ポリシー条件:
- `groups`: `USING (is_member_of(id))`
- `group_members`, `group_invitations`, `players`, `matches`: `is_member_of(group_id)` 直接適用
- `sets`, `rallies`, `recording_gaps`: FK 経由で `matches.group_id` を `EXISTS` サブクエリで辿る
- `set_player_positions`: sets → matches 2 段の `EXISTS`
- `shots`, `position_overrides`: rallies → sets → matches 3 段の `EXISTS`

`USING` / `WITH CHECK` の使い分け: SELECT/UPDATE は `USING` のみ、INSERT は `WITH CHECK` のみ (database-schema.sql の方針に忠実)。

## 自己検証結果

すべて grep ベースで検証済み。

| 検証項目 | 期待値 | 実測値 | 結果 |
|---|---|---|---|
| `ENABLE ROW LEVEL SECURITY` の数 | 11 | 11 | OK |
| `CREATE POLICY` の数 (マスターと一致) | 28 | 28 | OK |
| `CREATE OR REPLACE FUNCTION is_member_of` の数 | 1 | 1 | OK |
| 行頭 `SET search_path` 実定義文の数 | 1 | 1 | OK |
| `"groups_insert"` の数 | 0 | 0 | OK |
| `"group_members_insert"` の数 | 0 | 0 | OK |
| TASK-0007 関数の実定義 (`CREATE OR REPLACE FUNCTION create_group_with_owner` 等) の数 | 0 | 0 | OK |

検証コマンド:

```bash
grep -c "ENABLE ROW LEVEL SECURITY" supabase/migrations/20260519060000_initial_schema.sql  # → 11
grep -c "CREATE POLICY" supabase/migrations/20260519060000_initial_schema.sql               # → 28
grep "is_member_of" supabase/migrations/20260519060000_initial_schema.sql \
  | grep -c "CREATE OR REPLACE FUNCTION"                                                     # → 1
grep -cE "^SET search_path" supabase/migrations/20260519060000_initial_schema.sql            # → 1
grep -c '"groups_insert"' supabase/migrations/20260519060000_initial_schema.sql              # → 0
grep -c '"group_members_insert"' supabase/migrations/20260519060000_initial_schema.sql       # → 0
grep -c "CREATE OR REPLACE FUNCTION create_group_with_owner\
\|CREATE OR REPLACE FUNCTION generate_invitation_code\
\|CREATE OR REPLACE FUNCTION join_group_with_code" \
  supabase/migrations/20260519060000_initial_schema.sql                                      # → 0
```

マスター (`docs/design/data-foundation/database-schema.sql`) の `CREATE POLICY` 数 (28) と完全に一致。

## 完了条件チェック

- [x] `is_member_of(target_group_id uuid) RETURNS boolean` を `LANGUAGE sql` / `SECURITY DEFINER` / `STABLE` / `SET search_path = public` で定義
- [x] 全 11 テーブルで `ENABLE ROW LEVEL SECURITY`
- [x] `groups`: `groups_select` (SELECT) + `groups_update` (UPDATE)、INSERT ポリシー無し (⑦ A-1)
- [x] `group_members`: `group_members_select` のみ、INSERT ポリシー無し (⑦ A-2)
- [x] `group_invitations`: `group_invitations_select` のみ
- [x] `players` / `matches`: select / insert / update の 3 ポリシー
- [x] `sets` / `set_player_positions` / `rallies` / `shots` / `position_overrides` / `recording_gaps`: FK 経由 EXISTS で select / insert / update の 3 ポリシー
- [x] `recording_gaps` 3 ポリシー定義 (② B-7)
- [x] PostgreSQL 構文として有効 (`CREATE POLICY` 構文、`USING` / `WITH CHECK` 使い分け、`EXISTS` サブクエリ、`is_member_of()` 呼び出しすべて適合)

## 遭遇した問題と解決方法

### 問題 1: マスター (database-schema.sql) に `SET search_path = public` が記載されていない

- **発生状況**: `database-schema.sql` 行 39〜51 の `is_member_of()` 定義に `SET search_path = public` が無いが、TASK-0006 完了条件 / B2 確定方針では必須
- **解決方法**: TASK-0006 完了条件と B2 方針に従い、追記時に `SET search_path = public` を明示的に付与。マスターとの差分は許容 (タスクファイルおよび注意事項に「差分発生は許容」と明記済み)。マスター側の更新は本タスクのスコープ外

### 問題 2: 簡易 grep で TASK-0007 関数名がコメント中にヒット

- **発生状況**: `grep -c "create_group_with_owner\|generate_invitation_code\|join_group_with_code"` が 4 を返す
- **原因**: RLS ポリシーのコメントで「`create_group_with_owner` / `join_group_with_code` RPC 経由のみ」と RPC 名に言及している (`database-schema.sql` 行 331〜332, 341, 344 と同じ)
- **解決方法**: 実際の関数定義かどうかを `grep -c "CREATE OR REPLACE FUNCTION create_group_with_owner\|..."` で再検証し、0 件 (関数定義としては不混入) を確認

### 問題 3: 簡易 grep で `SET search_path` が 2 件ヒット

- **発生状況**: `grep -c "SET search_path"` が 2 を返す (期待 1)
- **原因**: ヘルパー関数の上に置いた説明コメント (`SET search_path = public を必ず付与する`) もマッチしている
- **解決方法**: 行頭マッチ (`grep -cE "^SET search_path"`) で実 SQL 文だけをカウントし、1 件で正しいことを確認

## 次のステップ

- `/tsumiki:direct-verify` で動作確認 (実 DB 適用は TASK-0009、RLS 統合テストは TASK-0015 にて)
- TASK-0007 (RPC 関数定義) で本ファイル末尾に `create_group_with_owner` / `generate_invitation_code` / `join_group_with_code` を追記。これらにも `SET search_path = public` を必ず付与する (B2)
