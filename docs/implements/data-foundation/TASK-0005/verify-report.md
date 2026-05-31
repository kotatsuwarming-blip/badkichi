# TASK-0005 設定確認・動作テスト

## 確認概要

- **タスクID**: TASK-0005
- **確認内容**: 初回マイグレーション SQL (全 11 テーブル DDL) のファイル整合性・構文一貫性検証
- **実行日時**: 2026-05-19 15:27 JST
- **実行者**: Claude (`/tsumiki:direct-verify` 実行)

## 検証対象ファイル

- マイグレーション: `/Users/kazuyakotake/Documents/repositries/badkichi/supabase/migrations/20260519060000_initial_schema.sql` (296 行 / 13,570 bytes)
- 転写元 DDL: `/Users/kazuyakotake/Documents/repositries/badkichi/docs/design/data-foundation/database-schema.sql`
- setup-report: `/Users/kazuyakotake/Documents/repositries/badkichi/docs/implements/data-foundation/TASK-0005/setup-report.md`

---

## 設定確認結果

### 1. ファイル存在確認 ✅

```bash
ls -l supabase/migrations/20260519060000_initial_schema.sql
# -rw-r--r-- 1 kazuyakotake staff 13570 5 19 15:02
```

- [x] マイグレーションファイル `supabase/migrations/{timestamp}_initial_schema.sql` が存在する
- [x] タイムスタンプ書式 `YYYYMMDDHHMMSS` (= `20260519060000`) に準拠

### 2. 拡張機能 / ヘルパー関数 ✅

```bash
grep -c "CREATE EXTENSION IF NOT EXISTS pgcrypto" file   # → 1
grep -c "CREATE OR REPLACE FUNCTION update_updated_at" file   # → 1
```

- [x] `CREATE EXTENSION IF NOT EXISTS pgcrypto` が含まれる (1 件)
- [x] `update_updated_at()` 関数が含まれる (1 件)

### 3. テーブル定義 (期待: 11 件) ✅

```bash
grep -cE "^CREATE TABLE " file   # → 11
```

11 件すべてのテーブルが順序通り定義済み:

| # | テーブル名 | 確認 |
|---|----------|------|
| 1 | groups | ✅ |
| 2 | group_members | ✅ |
| 3 | group_invitations | ✅ |
| 4 | players | ✅ |
| 5 | matches | ✅ |
| 6 | sets | ✅ |
| 7 | set_player_positions | ✅ |
| 8 | rallies | ✅ |
| 9 | shots | ✅ |
| 10 | position_overrides | ✅ |
| 11 | recording_gaps | ✅ |

### 4. `deleted_at` カラム / `created_at` / `updated_at` トリガー ✅

```bash
grep -cE "^\s+deleted_at\s+timestamptz" file        # → 11
grep -cE "^CREATE TRIGGER trg_.*_updated_at" file   # → 11
```

- [x] 全 11 テーブルに `deleted_at timestamptz` カラム
- [x] 全 11 テーブルに `trg_*_updated_at` トリガー
  - `trg_groups_updated_at` / `trg_group_members_updated_at` / `trg_group_invitations_updated_at`
  - `trg_players_updated_at` / `trg_matches_updated_at` / `trg_sets_updated_at`
  - `trg_set_player_positions_updated_at` / `trg_rallies_updated_at` / `trg_shots_updated_at`
  - `trg_position_overrides_updated_at` / `trg_recording_gaps_updated_at`

### 5. CHECK 制約 ✅

| 対象 | 制約 | 確認 |
|------|------|------|
| matches | `matches_players_distinct_check` (6-way 不等号) | ✅ L128 |
| matches | `video_source_type IN ('youtube','local')` | ✅ L122 |
| sets | `first_serving_team IN ('A','B')` | ✅ L156 |
| sets | `camera_near_team_at_start IN ('A','B')` | ✅ L158 |
| sets | `winner IN ('A','B')` (NULL 許容) | ✅ L159 |
| rallies | `serving_team IN ('A','B')` (NOT NULL) | ✅ L201 |
| rallies | `server_position IN ('left','right')` (NOT NULL) | ✅ L202 |
| rallies | `camera_near_team IN ('A','B')` (NULL 許容) | ✅ L206 |
| rallies | `point_winner IN ('A','B')` (NULL 許容) | ✅ L209 |
| set_player_positions | `team IN ('A','B')` | ✅ L176 |
| set_player_positions | `position IN ('left','right')` | ✅ L177 |
| players | `handedness IN ('right','left','unknown')` | ✅ L98 |
| shots | `input_source IN ('manual','ai')` | ✅ L230 |
| position_overrides | `team IN ('A','B')` | ✅ L246 |
| position_overrides | `override_type IN ('swapped','restored')` | ✅ L247 |
| groups | `groups_name_length_check` (trim 後 1〜50 文字) | ✅ L51 |
| players | `players_name_length_check` (trim 後 1〜50 文字) | ✅ L103 |

### 6. `video_*_ms` 型 ✅

```bash
grep -nE "video_.*_ms[[:space:]]+integer" file
# 208: video_start_timestamp_ms integer,
# 228: video_timestamp_ms integer,
```

- [x] `rallies.video_start_timestamp_ms` が `integer` 型 (L208, NULL 許容)
- [x] `shots.video_timestamp_ms` が `integer` 型 (L228, NULL 許容)

### 7. 複合 UNIQUE / 複合 FK ✅

| 対象 | 制約 | 確認 |
|------|------|------|
| players | `UNIQUE (group_id, id)` (`players_group_id_id_key`) | ✅ L106 |
| matches | `players(group_id, id)` への複合 FK × 4 本 | ✅ L137-140 |
| set_player_positions | `UNIQUE (set_id, team, position)` | ✅ L184 |
| set_player_positions | `UNIQUE (set_id, player_id)` | ✅ L181 |
| sets | `UNIQUE (match_id, set_number)` | ✅ L163 |
| rallies | `UNIQUE (set_id, rally_number)` | ✅ L215 |
| shots | `UNIQUE (rally_id, shot_number)` | ✅ L234 |
| group_members | `UNIQUE (group_id, user_id)` | ✅ L69 |
| group_invitations | `code UNIQUE` (カラム単位) | ✅ L80 |

### 8. `rallies` NOT NULL カラム ✅

L201-204:
- [x] `serving_team` NOT NULL
- [x] `server_position` NOT NULL
- [x] `server_player_id` NOT NULL
- [x] `receiver_player_id` NOT NULL

L206-209 (NULL 許容で意図通り):
- [x] `camera_near_team` (NULL 許容)
- [x] `video_start_timestamp_ms` (NULL 許容)
- [x] `point_winner` (NULL 許容)

### 9. `recording_gaps` テーブル ✅

- [x] L261-271: 独立テーブルとして CREATE TABLE 定義
- [x] L273-275: `trg_recording_gaps_updated_at` トリガー付与

### 10. 部分インデックス (期待: 11 本、全て `WHERE deleted_at IS NULL`) ✅

```bash
grep -cE "^CREATE INDEX " file              # → 11
grep -c "WHERE deleted_at IS NULL" file     # → 11
```

| # | インデックス名 | 確認 |
|---|------------|------|
| 1 | idx_group_members_user_id | ✅ |
| 2 | idx_group_members_group_id | ✅ |
| 3 | idx_group_invitations_code | ✅ |
| 4 | idx_players_group_id | ✅ |
| 5 | idx_matches_group_id | ✅ |
| 6 | idx_sets_match_id | ✅ |
| 7 | idx_set_player_positions_set_id | ✅ |
| 8 | idx_rallies_set_id | ✅ |
| 9 | idx_shots_rally_id | ✅ |
| 10 | idx_position_overrides_rally_id | ✅ |
| 11 | idx_recording_gaps_set_id | ✅ |

### 11. 不転写要素の確認 (期待: 全て 0 ヒット) ✅

```bash
for pat in "is_member_of" "ENABLE ROW LEVEL SECURITY" "CREATE POLICY" \
           "create_group_with_owner" "generate_invitation_code" "join_group_with_code"; do
  grep -c "$pat" file
done
# → 0 0 0 0 0 0
```

- [x] `is_member_of` 関数定義: 0 件 (TASK-0006 で追記予定)
- [x] `ALTER TABLE ... ENABLE ROW LEVEL SECURITY`: 0 件 (TASK-0006)
- [x] `CREATE POLICY`: 0 件 (TASK-0006)
- [x] `create_group_with_owner` / `generate_invitation_code` / `join_group_with_code`: 0 件 (TASK-0007)

---

## コンパイル・構文チェック結果

### PostgreSQL 構文確認 (ファイル一貫性レベル) ✅

**実施方針**:
TASK-0005.md の動作確認では `pnpm dlx supabase db push --dry-run` または `psql` でのパース確認が示唆されているが、
- `supabase db push --dry-run` は実 DB 接続を試みるため **破壊コマンドポリシーに抵触する** 可能性があり実施しない
- ローカル環境に `psql` / `sqlparse` がインストールされていない (`which psql` → 未検出、`python3 -c "import sqlparse"` → ModuleNotFoundError)

そのため本タスクでは **ファイル一貫性レベルの構文チェック** で代用した:

```bash
# 括弧バランス (コメント + 文字列リテラルを除外した上で計測)
open  paren count: 167
close paren count: 167
final depth:       0   # ← balanced

# ステートメント数 (コメント + 文字列リテラルを除外)
semicolons (outside comments/strings): 35
# 期待値: 1 (extension) + 1 (function) + 11 (CREATE TABLE) + 11 (CREATE TRIGGER) + 11 (CREATE INDEX) = 35  ✅
```

- [x] 括弧バランス: 0 (balanced)
- [x] ステートメント数: 35 (期待値と一致)
- [x] `$$ ... $$` plpgsql 関数本体の閉じ忘れなし

**正式な PostgreSQL 構文検証は TASK-0009 で実 DB 適用時に行う。本タスクでは「ファイル単位の一貫性チェックまで」とする** (TASK-0005.md 動作確認の注記に従う)。

### 転写忠実性確認 ✅

`diff` で `supabase/migrations/20260519060000_initial_schema.sql` と `docs/design/data-foundation/database-schema.sql` を比較した結果、差分は以下の **2 箇所のみ** で、いずれも B1 統合方針に基づく意図的な除外:

| 差分箇所 | 内容 | 判定 |
|---------|------|------|
| `is_member_of()` 関数定義 (schema.sql L37-51) | 設計側にあり、マイグレーション側で除外 | ✅ TASK-0006 で追記予定 |
| RLS + RPC セクション (schema.sql L312-584) | 設計側にあり、マイグレーション側で除外 | ✅ TASK-0006 / TASK-0007 で追記予定 |

それ以外の DDL 部分は **完全一致** (転写ミスなし)。

---

## 動作テスト結果

本タスク (TASK-0005) は SQL ファイルの作成のみで実行可能なコード/コマンドの追加はないため、動作テストは「ファイル整合性検証」と「構文一貫性検証」で代用 (上記セクション参照)。

実 DB への適用検証は **TASK-0009 (CI ワークフロー整備)** にて行う。

---

## 品質チェック結果

### セキュリティ ✅

- [x] secret 値・ハードコード認証情報は含まれない (純粋な DDL のみ)
- [x] RLS は意図通り **未設定** (TASK-0006 で別途付与予定)
  - dev DB に **実適用する前に必ず TASK-0006 が完了している** ことを TASK-0009 の前提として確認する必要あり
- [x] `auth.users` への FK は Supabase 標準スキーマに依存 (Supabase プロジェクト初期化済みのため問題なし)

### パフォーマンス ✅

- [x] 部分インデックス 11 本がすべて `WHERE deleted_at IS NULL` 付き (REQ-405 ソフトデリート前提の最適化)
- [x] RLS パフォーマンス用の `idx_group_members_user_id` / `idx_group_members_group_id` が含まれる

### 追記運用ポリシー ✅

- [x] 後続 TASK-0006 / TASK-0007 は本ファイルの **末尾に追記** する方針 (B1 確定、TASK-0005.md 注意事項)
- [x] 本ファイルは TASK-0006 以降のタスクで「書き換え」してはならず、追記のみ許可される

---

## 全体的な確認結果

- [x] 設定作業 (DDL 転写) が正しく完了している
- [x] 完了条件 14 項目すべてクリア
- [x] 動作確認 6 項目すべてクリア
- [x] 構文一貫性チェック (括弧バランス + ステートメント数) がパス
- [x] 転写禁止要素 (is_member_of / RLS / RPC) の不混入を確認
- [x] 次のタスク (TASK-0006: RLS) に進む準備が整っている

**結果サマリー**: **全項目 PASS / FAIL 件数 = 0**

---

## 発見された問題と解決

特に問題は発見されなかった。setup-report で言及された「`grep -c 'deleted_at timestamptz'` のパターンが厳密でなかった」件は、verify 側で `\s+` 対応の正規表現 (`^\s+deleted_at\s+timestamptz`) を使用することで 11 件カウントを確認した。

---

## CLAUDE.md / README.md への記録

**記録なし**。

TASK-0005 では SQL ファイルの追加のみで、新規の実行コマンド (テスト・起動・ビルド・マイグレーション) は導入されない。マイグレーション適用コマンド (`supabase db push`) の記載は TASK-0009 (CI ワークフロー整備) で正式に追加する想定。

---

## 推奨事項

- TASK-0006 (RLS) に進む前に、本マイグレーションファイルを dev DB に **実適用** しないこと。RLS なしの状態で適用すると、`auth.users` を介した参照は機能するが Row Level Security が掛からないため、TASK-0006 完了後に併せて push する運用が安全 (B1 統合方針の意図に沿う)。
- 正式な PostgreSQL 構文検証 (実 DB へのトランザクション内ロールバック適用) は TASK-0009 で実施する。

---

## 次のステップ

1. ✅ TASK-0005.md の完了条件チェックボックスを全て `[x]` に更新
2. ✅ TASK-0005.md にステータス: 完了 / 完了日 2026-05-19 を追記
3. ⏭️ TASK-0006 (RLS ヘルパー関数 + 全テーブル RLS ポリシー) を本ファイル末尾に追記する形で開始
4. ⏭️ `overview.md` のチェックボックス更新は別工程 (step-c) で実施
