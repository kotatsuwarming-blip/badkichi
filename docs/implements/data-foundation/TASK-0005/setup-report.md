# TASK-0005 設定作業実行

## 作業概要

- **タスクID**: TASK-0005
- **作業内容**: 初回マイグレーション SQL — 全 11 テーブル DDL の転写
- **実行日時**: 2026-05-19
- **実行者**: Claude (`/tsumiki:direct-setup` 実行)

## 設計文書参照

- **参照文書**:
  - [`docs/tasks/data-foundation/TASK-0005.md`](../../../tasks/data-foundation/TASK-0005.md): タスク定義 (本作業の指示書)
  - [`docs/design/data-foundation/database-schema.sql`](../../../design/data-foundation/database-schema.sql): DDL 転写元 (Source of Truth)
  - [`docs/design/data-foundation/architecture.md`](../../../design/data-foundation/architecture.md): アーキテクチャ設計補足
- **関連要件**:
  - REQ-003: 全テーブル (PRD §5.2) の作成
  - REQ-004: Supabase CLI マイグレーション機構の使用
  - REQ-405: 全主要テーブルに `deleted_at` カラム
  - NFR-302: マイグレーション追記のみ運用 (既存ファイル改変禁止)

## 実行した作業

### 1. マイグレーションファイル生成

```bash
pnpm dlx supabase migration new initial_schema
```

**実行結果**:

- `supabase/migrations/20260519060000_initial_schema.sql` (空ファイル) が生成された
- タイムスタンプ `20260519060000` は Supabase CLI が UTC で自動採番

### 2. DDL の完全転写

`docs/design/data-foundation/database-schema.sql` から以下のセクションを Write ツールでマイグレーションファイルに転写した:

| セクション | 内容 | 行数目安 |
|-----------|------|---------|
| ヘッダー (コメント) | 作成日・関連設計・信頼性レベル凡例 | 17 行 |
| 拡張機能 | `CREATE EXTENSION IF NOT EXISTS pgcrypto` | 1 行 |
| ヘルパー関数 | `update_updated_at()` のみ | 9 行 |
| テーブル定義 | 11 テーブル分の `CREATE TABLE` + `CREATE TRIGGER trg_*_updated_at` | 約 240 行 |
| インデックス | 部分インデックス 11 本 (全て `WHERE deleted_at IS NULL`) | 11 行 |

**転写したテーブル (11 件)**:
groups / group_members / group_invitations / players / matches / sets / set_player_positions / rallies / shots / position_overrides / recording_gaps

**意図的に転写しなかった要素** (B1 統合方針に従い後続タスクで追記):

- `is_member_of()` RLS ヘルパー関数 → TASK-0006 で追記
- `ALTER TABLE ... ENABLE ROW LEVEL SECURITY` (11 件) → TASK-0006 で追記
- `CREATE POLICY` (約 28 件) → TASK-0006 で追記
- RPC 関数 (`create_group_with_owner` / `generate_invitation_code` / `join_group_with_code`) → TASK-0007 で追記

### 3. 自己検証 (grep ベース)

転写完了後、TASK-0005.md の動作確認表に従って `grep` で SQL ファイルの内容を検査:

| 確認項目 | 期待 | 実測 | 結果 |
|---------|------|------|------|
| `CREATE TABLE` 件数 | 11 | 11 | OK |
| `deleted_at` カラム定義行数 (`^\s+deleted_at\s+timestamptz`) | 11 | 11 | OK |
| `trg_*_updated_at` トリガー件数 | 11 | 11 | OK |
| `CREATE INDEX` 件数 | 11 | 11 | OK |
| `matches_players_distinct_check` ヒット数 | 1 | 1 | OK |
| `video_*_ms integer` ヒット数 (rallies / shots) | 2 | 2 | OK |
| `is_member_of` ヒット数 (TASK-0006 で追記するため転写禁止) | 0 | 0 | OK |
| `CREATE POLICY` ヒット数 (TASK-0006 で追記するため転写禁止) | 0 | 0 | OK |

**生成ファイル絶対パス**:
`/Users/kazuyakotake/Documents/repositries/badkichi/supabase/migrations/20260519060000_initial_schema.sql`

## 作業結果

- [x] マイグレーションファイル生成 (`supabase migration new initial_schema`)
- [x] 拡張機能 (`pgcrypto`) の転写
- [x] ヘルパー関数 (`update_updated_at()`) の転写
- [x] 11 テーブル DDL + トリガーの転写
- [x] 部分インデックス 11 本の転写
- [x] RLS / RPC / `is_member_of()` の **不転写** を確認 (TASK-0006 / TASK-0007 用)
- [x] 自己検証 (grep 8 項目) 全て期待通り

## 遭遇した問題と解決方法

### 問題1: `grep -c 'deleted_at timestamptz'` の検証結果が想定より少なく見える

- **発生状況**: TASK-0005.md の動作確認表では `grep -c 'deleted_at timestamptz'` の期待値が「11 以上」だが、実行結果が 6 件となった。
- **根本原因**: 列幅揃えのために `deleted_at` と `timestamptz` の間にスペースを複数挿入したカラム (例: `deleted_at     timestamptz`) が、シングルスペース指定の grep パターンに一致しなかったため。これは元の `database-schema.sql` の整形スタイルをそのまま転写した結果であり、DDL としての意味は完全に同一。
- **解決方法**: 正規表現 `^\s+deleted_at\s+timestamptz` で再カウントし、11 テーブル全てに `deleted_at timestamptz` カラムが含まれることを確認した。行番号一覧 (49, 68, 85, 101, 126, 162, 180, 214, 233, 250, 270) も目視で 11 件確認済み。
- **後続タスクへの示唆**: TASK-0005.md の動作確認表のパターンは厳密化の余地あり (`\s+` 対応)。ただし本タスクの完了条件には影響しないため記録のみに留める。

## 次のステップ

- `/tsumiki:direct-verify` を実行して、本マイグレーションファイルが PostgreSQL 構文として有効であることを確認する (TASK-0005.md ステップ 3 / 動作確認表「構文パース」)。
- 動作確認の手段:
  - `pnpm dlx supabase db push --dry-run` 相当 (dev リンク済み)
  - または `psql -f` でファイルパースのみ実行
- dev DB への実適用は TASK-0009 で実施する (本タスクではファイル単位のパース確認まで)。
- TASK-0006 (RLS ヘルパー関数 + RLS ポリシー) は本ファイル末尾に追記する形で進める (B1 統合方針)。
