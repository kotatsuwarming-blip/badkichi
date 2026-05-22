# TASK-0007 設定作業実行

## 作業概要

- **タスクID**: TASK-0007
- **作業内容**: RPC 関数 (create_group_with_owner / generate_invitation_code / join_group_with_code) を `supabase/migrations/20260519060000_initial_schema.sql` の末尾に追記する
- **実行日時**: 2026-05-19
- **実行者**: Claude Code (direct-setup, Opus 4.7)

## 設計文書参照

- **参照文書**:
  - `docs/tasks/data-foundation/TASK-0007.md` (完了条件 / B1・B2 確定方針)
  - `docs/design/data-foundation/database-schema.sql` (行 473〜575: RPC セクション、転写元 = Source of Truth)
  - `docs/design/data-foundation/api-endpoints.md` (例外名の確定値: `invitation_not_found` / `invitation_expired` / PG `23505`)
- **関連要件**: REQ-102, REQ-103, REQ-202, NFR-103, EDGE-001, EDGE-002, EDGE-101, スキーマレビュー ⑦ A-1/A-2, ⑧ B-12, ⑩ A-3

## 実行した作業

### 1. RPC 3 関数を既存マイグレーションファイルの末尾に追記

**変更ファイル**: `supabase/migrations/20260519060000_initial_schema.sql`

B1 確定方針 (2026-05-13) により新規ファイルは作成せず、TASK-0006 で追記された RLS セクションの直後 (旧末尾 478 行目) に以下の RPC セクションを Edit で追記した。

#### a) `create_group_with_owner(group_name text) RETURNS uuid`

- `LANGUAGE plpgsql` / `SECURITY DEFINER` / `SET search_path = public` (B2)
- `auth.uid() IS NULL` → `RAISE EXCEPTION 'not_authenticated'`
- `group_name` NULL / trim 後 1〜50 文字外 → `RAISE EXCEPTION 'invalid_group_name'`
- `groups` INSERT → `group_members` INSERT を同一トランザクションで原子化 (RLS は SECURITY DEFINER でバイパス)
- 戻り値: 新規 `groups.id`

#### b) `generate_invitation_code(target_group_id uuid) RETURNS text`

- `LANGUAGE plpgsql` / `SECURITY DEFINER` / `SET search_path = public` (B2)
- `is_member_of(target_group_id)` NG → `RAISE EXCEPTION 'not_a_member'`
- CSPRNG: `upper(substring(replace(gen_random_uuid()::text, '-', '') from 1 for 8))` で 8 文字大文字 hex 生成
- `group_invitations` INSERT、`expires_at = now() + interval '7 days'`
- UNIQUE 衝突時に最大 5 回リトライ (`max_attempts constant int := 5`)、全敗時 `RAISE EXCEPTION 'invitation_code_collision_after_retry'`
- 戻り値: 生成した 8 文字コード

#### c) `join_group_with_code(invite_code text) RETURNS uuid`

- `LANGUAGE plpgsql` / `SECURITY DEFINER` / `SET search_path = public` (B2)
- 引数名は `invite_code` (database-schema.sql 準拠)
- `group_invitations` を `code = invite_code AND deleted_at IS NULL` で検索 → 該当なしで `RAISE EXCEPTION 'invitation_not_found'`
- `expires_at < now()` で `RAISE EXCEPTION 'invitation_expired'`
- `group_members` INSERT (UNIQUE 制約 `(group_id, user_id)` で二重参加防止 → PG code `23505` を伝播)
- 戻り値: 参加した `group_id`

### 2. B2 (search_path 固定) 対応

`database-schema.sql` の RPC 定義には `SET search_path = public` が記載されていないが、TASK-0007.md の B2 確定方針に従い、追記時に **3 関数すべて** に付与した。`is_member_of()` (TASK-0006) と方針を揃え、`supabase db lint` (TASK-0011 で導入予定) との二重防御とする。

### 3. 自己検証 (grep)

すべて期待値通り:

| チェック項目 | コマンド | 期待値 | 実測値 |
|---|---|---|---|
| `create_group_with_owner` 定義 | `grep -c '^CREATE OR REPLACE FUNCTION create_group_with_owner' ...` | 1 | **1** |
| `generate_invitation_code` 定義 | `grep -c '^CREATE OR REPLACE FUNCTION generate_invitation_code' ...` | 1 | **1** |
| `join_group_with_code` 定義 | `grep -c '^CREATE OR REPLACE FUNCTION join_group_with_code' ...` | 1 | **1** |
| `SET search_path = public` 行数 | `grep -c '^SET search_path = public' ...` | 4 (is_member_of + 3 RPC) | **4** |
| `not_authenticated` | `grep -c "RAISE EXCEPTION 'not_authenticated'" ...` | 1 | **1** |
| `invalid_group_name` | `grep -c "RAISE EXCEPTION 'invalid_group_name'" ...` | 1 | **1** |
| `not_a_member` | `grep -c "RAISE EXCEPTION 'not_a_member'" ...` | 1 | **1** |
| `invitation_not_found` | `grep -c "RAISE EXCEPTION 'invitation_not_found'" ...` | 1 | **1** |
| `invitation_expired` | `grep -c "RAISE EXCEPTION 'invitation_expired'" ...` | 1 | **1** |
| `invitation_code_collision_after_retry` | `grep -c "RAISE EXCEPTION 'invitation_code_collision_after_retry'" ...` | 1 | **1** |
| `max_attempts = 5` | `grep "max_attempts" ... \| grep -c "5"` | 1 | **1** |
| **TASK-0005 / TASK-0006 不変条件** |  |  |  |
| `CREATE TABLE` | `grep -c '^CREATE TABLE' ...` | 11 | **11** |
| `CREATE INDEX` | `grep -c '^CREATE INDEX' ...` | 11 | **11** |
| `ENABLE ROW LEVEL SECURITY` | `grep -c 'ENABLE ROW LEVEL SECURITY' ...` | 11 | **11** |
| `CREATE POLICY` | `grep -c 'CREATE POLICY' ...` | 28 | **28** |

## 作業結果

- [x] `create_group_with_owner` を追記 (`SECURITY DEFINER` + `SET search_path = public`)
- [x] `generate_invitation_code` を追記 (CSPRNG + 5 回リトライ + 7 日有効期限)
- [x] `join_group_with_code` を追記 (期限検証 + UNIQUE による二重参加防止)
- [x] 3 関数すべてに `SET search_path = public` 付与 (B2 確定方針)
- [x] 例外名は database-schema.sql / api-endpoints.md 準拠 (`invitation_not_found` / `invitation_expired` / PG `23505`)
- [x] TASK-0005 (テーブル / インデックス) / TASK-0006 (RLS / ポリシー) 部分は無改変
- [x] 新規ファイル作成なし (B1 確定方針)
- [x] `BEGIN/COMMIT` を含まない

## 遭遇した問題と解決方法

なし。`database-schema.sql` の RPC セクションを完全転写し、`SET search_path = public` のみ B2 方針に従って追記した。

## 適用判断

- `supabase db push` / `supabase db reset` は **実行しない** (TASK-0007.md 厳守事項)
- 実 DB への適用は後続タスク (TASK-0008 で型生成、TASK-0011 で CI lint、TASK-0015 で RPC 統合テスト) で行う

## 次のステップ

- `/tsumiki:direct-verify data-foundation TASK-0007` を実行して定義の存在確認 (psql / SQL Editor からの `pg_proc` 検索)
- TASK-0008: 型自動生成パイプライン (RPC の TypeScript 型を `types/supabase.ts` に取り込む)
