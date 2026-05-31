# TASK-0006 設定確認・動作テスト

## 確認概要

- **タスクID**: TASK-0006
- **確認内容**: RLS ヘルパー関数 `is_member_of()` + 全 11 テーブル RLS 有効化 + RLS ポリシー 28 個 が、既存マイグレーション `20260519060000_initial_schema.sql` の末尾に転写されていることの静的検証。実 DB 適用は TASK-0009 のため、本タスクでは SQL ファイル内容の機械的検査までを行う。
- **実行日時**: 2026-05-19
- **実行者**: Claude Code (direct-verify)

## 参照文書

- **タスク仕様**: `docs/tasks/data-foundation/TASK-0006.md`
- **Source of Truth**: `docs/design/data-foundation/database-schema.sql` (RLS セクション 行 38〜471)
- **直前作業記録**: `docs/implements/data-foundation/TASK-0006/setup-report.md`
- **検証対象ファイル**: `supabase/migrations/20260519060000_initial_schema.sql`

## 設定確認結果

### 1. RLS ヘルパー関数 `is_member_of()` の修飾子確認

```bash
sed -n '305,318p' supabase/migrations/20260519060000_initial_schema.sql
```

抜粋:

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

修飾子検査:

```bash
for kw in 'RETURNS boolean' 'LANGUAGE sql' 'SECURITY DEFINER' 'STABLE' 'SET search_path = public'; do
  awk '/CREATE OR REPLACE FUNCTION is_member_of/,/\$\$;/' \
    supabase/migrations/20260519060000_initial_schema.sql | grep -cF "$kw"
done
```

**確認結果**:

- [x] `CREATE OR REPLACE FUNCTION is_member_of` 出現回数: 1 (期待: 1)
- [x] `LANGUAGE sql`: 1 (期待: 1)
- [x] `SECURITY DEFINER`: 1 (期待: 1)
- [x] `STABLE`: 1 (期待: 1)
- [x] `SET search_path = public` (B2 確定方針): 1 (期待: 1)
- [x] `RETURNS boolean`: 1 (期待: 1)
- [x] 関数本体は `group_members` を `auth.uid()` と `deleted_at IS NULL` で絞る EXISTS サブクエリ、Source of Truth (master 行 39〜51) と機能的に等価 (差分は `SET search_path = public` の追加のみ、B2 方針として明示的に許容)

### 2. 全 11 テーブルの RLS 有効化

```bash
grep -nE 'ENABLE ROW LEVEL SECURITY' supabase/migrations/20260519060000_initial_schema.sql
```

| # | 行 | テーブル |
|---|---|---|
| 1 | 325 | groups |
| 2 | 326 | group_members |
| 3 | 327 | group_invitations |
| 4 | 328 | players |
| 5 | 329 | matches |
| 6 | 330 | sets |
| 7 | 331 | set_player_positions |
| 8 | 332 | rallies |
| 9 | 333 | shots |
| 10 | 334 | position_overrides |
| 11 | 335 | recording_gaps |

```bash
diff <(grep 'ENABLE ROW LEVEL SECURITY' docs/design/data-foundation/database-schema.sql) \
     <(grep 'ENABLE ROW LEVEL SECURITY' supabase/migrations/20260519060000_initial_schema.sql)
# → 差分なし (RC=0)
```

**確認結果**:

- [x] `ENABLE ROW LEVEL SECURITY` 出現回数: 11 (期待: 11)
- [x] 対象テーブル 11 件: 設計通り (groups / group_members / group_invitations / players / matches / sets / set_player_positions / rallies / shots / position_overrides / recording_gaps)
- [x] Source of Truth と完全一致

### 3. ポリシー数の検証

```bash
awk '/^CREATE POLICY/ {match($0, /ON ([a-z_]+) FOR ([A-Z]+)/, m); print m[1] "\t" m[2]}' \
  supabase/migrations/20260519060000_initial_schema.sql | sort | uniq -c
```

| テーブル | SELECT | INSERT | UPDATE | 計 | 期待 | 結果 |
|---|---|---|---|---|---|---|
| groups | 1 | 0 | 1 | 2 | 2 (⑦ A-1 INSERT なし) | OK |
| group_members | 1 | 0 | 0 | 1 | 1 (⑦ A-2 INSERT なし) | OK |
| group_invitations | 1 | 0 | 0 | 1 | 1 (RPC 経由) | OK |
| players | 1 | 1 | 1 | 3 | 3 | OK |
| matches | 1 | 1 | 1 | 3 | 3 | OK |
| sets | 1 | 1 | 1 | 3 | 3 | OK |
| set_player_positions | 1 | 1 | 1 | 3 | 3 | OK |
| rallies | 1 | 1 | 1 | 3 | 3 | OK |
| shots | 1 | 1 | 1 | 3 | 3 | OK |
| position_overrides | 1 | 1 | 1 | 3 | 3 | OK |
| recording_gaps | 1 | 1 | 1 | 3 | 3 (② B-7) | OK |
| **合計** | **11** | **8** | **9** | **28** | **28** | **OK** |

```bash
diff <(grep -E '^CREATE POLICY' docs/design/data-foundation/database-schema.sql) \
     <(grep -E '^CREATE POLICY' supabase/migrations/20260519060000_initial_schema.sql)
# → 差分なし (RC=0)

diff <(sed -n '330,471p' docs/design/data-foundation/database-schema.sql) \
     <(sed -n '337,478p' supabase/migrations/20260519060000_initial_schema.sql)
# → POLICY BODIES IDENTICAL
```

**確認結果**:

- [x] 合計ポリシー数: 28 (期待: 28)
- [x] `groups` の INSERT ポリシー数: 0 (⑦ A-1 期待: 0)
- [x] `group_members` の INSERT ポリシー数: 0 (⑦ A-2 期待: 0)
- [x] `group_invitations` の INSERT ポリシー数: 0 (期待: 0、RPC 経由)
- [x] ポリシーヘッダおよびポリシー本体は Source of Truth (master 行 330〜471) と **完全一致**
- [x] `recording_gaps` の 3 ポリシー (select / insert / update) 定義済み (② B-7)

### 4. `is_member_of()` の使い分け確認

```bash
grep -nE 'is_member_of\((id|group_id)\)' supabase/migrations/20260519060000_initial_schema.sql
grep -cE 'is_member_of\(matches\.group_id\)' supabase/migrations/20260519060000_initial_schema.sql
```

| パターン | 出現回数 | 期待 | 結果 |
|---|---|---|---|
| `is_member_of(id)` (groups 自テーブル) | 2 | 2 (groups の SELECT + UPDATE) | OK |
| `is_member_of(group_id)` (直接列参照) | 8 | 8 (group_members 1 + group_invitations 1 + players 3 + matches 3) | OK |
| `is_member_of(matches.group_id)` (FK 経由 EXISTS) | 18 | 18 (sets 3 + spp 3 + rallies 3 + shots 3 + po 3 + recording_gaps 3) | OK |
| **合計呼び出し** | **28** | **28** (全ポリシー 1 回ずつ) | **OK** |

**確認結果**:

- [x] 直接 `is_member_of(group_id)` (または `is_member_of(id)`) を呼ぶテーブル: groups, group_members, group_invitations, players, matches → 期待通り
- [x] FK 経由で `is_member_of(matches.group_id)` を呼ぶテーブル: sets, set_player_positions, rallies, shots, position_overrides, recording_gaps → 期待通り
- [x] `USING` (SELECT/UPDATE) / `WITH CHECK` (INSERT) の使い分けは Source of Truth に忠実

### 5. TASK-0007 不混入の確認

```bash
F=supabase/migrations/20260519060000_initial_schema.sql
grep -c 'CREATE OR REPLACE FUNCTION create_group_with_owner' $F  # 期待: 0
grep -c 'CREATE OR REPLACE FUNCTION generate_invitation_code' $F  # 期待: 0
grep -c 'CREATE OR REPLACE FUNCTION join_group_with_code' $F      # 期待: 0
```

**確認結果**:

- [x] `CREATE OR REPLACE FUNCTION create_group_with_owner` ヒット数: 0 (期待: 0)
- [x] `CREATE OR REPLACE FUNCTION generate_invitation_code` ヒット数: 0 (期待: 0)
- [x] `CREATE OR REPLACE FUNCTION join_group_with_code` ヒット数: 0 (期待: 0)
- [x] 注: コメント中で RPC 名に言及している箇所 (master 行 331〜332, 341, 344 と同じ箇所) はあるが、`CREATE OR REPLACE FUNCTION` プレフィックスで限定すれば 0 件 = 関数定義としては不混入

### 6. TASK-0005 部分の改変なし確認

```bash
F=supabase/migrations/20260519060000_initial_schema.sql
grep -c '^CREATE TABLE' $F   # 期待: 11
grep -c '^CREATE INDEX' $F   # 期待: 11
grep -c '^CREATE TRIGGER' $F # 期待: 11
```

**確認結果**:

- [x] `CREATE TABLE` 数: 11 (期待: 11、TASK-0005 と同じ)
- [x] `CREATE INDEX` 数 (部分インデックス WHERE deleted_at IS NULL): 11 (期待: 11)
- [x] `CREATE TRIGGER` 数 (`trg_*_updated_at`): 11 (期待: 11)
- [x] TASK-0005 で書き込んだ DDL 領域 (行 1〜296) は本タスクで改変されていない

## コンパイル・構文チェック結果

### PostgreSQL 構文の機械的一貫性

```bash
python3 で行コメント (-- ...) と単一引用符リテラルを除外したうえで:
- 括弧 '(' '\)' バランス
- ドル引用符 '$$' の出現回数偶数性
- セミコロン総数
```

| 項目 | 値 | 評価 |
|---|---|---|
| `(` の数 (コメント・文字列除外後) | 211 | — |
| `)` の数 (コメント・文字列除外後) | 211 | — |
| `( ) のバランス差` | 0 | OK |
| `$$` 出現回数 | 4 (偶数) | OK (`update_updated_at` 2 + `is_member_of` 2) |
| セミコロン数 (文末終端) | 79 | DDL/RLS の各文 + ポリシー 28 で妥当 |

**チェック結果**:

- [x] 括弧バランス: 正常 (open = close = 211)
- [x] ドル引用符ペア: 偶数 (両関数定義の本体ブロック開閉が一致)
- [x] セミコロン終端: 各 SQL 文 (CREATE EXTENSION / CREATE TABLE / CREATE TRIGGER / CREATE INDEX / CREATE FUNCTION / ALTER TABLE / CREATE POLICY) すべて `;` で終端済み
- [x] `is_member_of()` の修飾子順 (RETURNS → LANGUAGE → SECURITY DEFINER → STABLE → SET search_path → AS $$): PostgreSQL の `CREATE FUNCTION` 文法に準拠

### 注: 実 DB 適用は別タスク

本タスクでは **マイグレーション SQL の静的検査** までを行う (TASK-0006.md 動作確認セクションの「実 DB 適用は TASK-0009 で行うため、本タスクの動作確認は SQL ファイルの内容確認 + 実適用後の pg_policies 検査の 2 段階で完了させる」に従う)。`supabase db push` / `supabase db reset` の実行は本タスクのスコープ外 (TASK-0009)、RLS 動作検証は TASK-0015 (RLS 統合テスト)。

## 動作テスト結果

### 静的検査の総合 (上記項目を統合)

```bash
F=supabase/migrations/20260519060000_initial_schema.sql
grep -c 'ENABLE ROW LEVEL SECURITY' $F  # → 11
grep -c 'CREATE POLICY' $F               # → 28
grep -c 'CREATE OR REPLACE FUNCTION is_member_of' $F  # → 1
grep -cE '^SET search_path' $F           # → 1 (is_member_of の修飾子のみ)
grep -c '"groups_insert"' $F             # → 0
grep -c '"group_members_insert"' $F      # → 0
```

**テスト結果**:

- [x] 静的検証 7 項目 (関数定義 / RLS 有効化 / ポリシー数 / `USING` `WITH CHECK` の使い分け / 関数呼び出しパターン / TASK-0007 不混入 / TASK-0005 部分の無改変) すべて PASS
- [x] Source of Truth (`database-schema.sql`) との完全な行単位一致を `diff` で確認 (RC=0)
- [x] 唯一の差分は `is_member_of()` への `SET search_path = public` 追加 (B2 方針として明示的に許容済み)

### セキュリティ設定テスト

**テスト結果**:

- [x] `groups` / `group_members` に INSERT ポリシーが**ない** → ⑦ A-1 / A-2 通り、直接 INSERT は禁止 (RLS により拒否される)
- [x] `is_member_of()` は `SECURITY DEFINER` + `SET search_path = public` で **search_path 攻撃に防御済み** (B2 確定方針)
- [x] `auth.uid()` 経由で **認証済みユーザーかつ所属メンバー** のみアクセス許可、未認証ユーザーは EXISTS が false → 全テーブル拒否 (REQ-201)
- [x] 全 11 テーブルに RLS 有効化 → マルチテナント境界が DB レベルで強制 (NFR-104)

## 品質チェック結果

### Source of Truth との整合性

- [x] master `docs/design/data-foundation/database-schema.sql` の RLS セクション (行 38〜51, 318〜471) と差分: **`SET search_path = public` の追加のみ**
- [x] それ以外のポリシーヘッダ / ポリシー本体 / RLS 有効化文は **完全一致** (`diff` で確認済み)
- [x] master との差分は TASK-0006 の B2 確定方針として **明示的に許容**、setup-report の問題 1 として記録済み

### 完了条件チェック (TASK-0006.md の完了条件と対応)

- [x] `is_member_of(target_group_id uuid) RETURNS boolean` が `LANGUAGE sql` / `SECURITY DEFINER` / `STABLE` / `SET search_path = public` の 4 修飾子をすべて持って定義されている
- [x] 全 11 テーブルで `ALTER TABLE ... ENABLE ROW LEVEL SECURITY` 実行
- [x] `groups`: `groups_select` (SELECT) + `groups_update` (UPDATE) のみ、INSERT ポリシーなし (⑦ A-1)
- [x] `group_members`: `group_members_select` (SELECT) のみ、INSERT ポリシーなし (⑦ A-2)
- [x] `group_invitations`: `group_invitations_select` (SELECT) のみ
- [x] `players` / `matches`: select / insert / update の 3 ポリシー、`is_member_of(group_id)` 直接適用
- [x] `sets` / `set_player_positions` / `rallies` / `shots` / `position_overrides` / `recording_gaps`: 各 3 ポリシー、FK 経由 EXISTS で `is_member_of(matches.group_id)` を適用
- [x] `recording_gaps` の 3 ポリシー定義済み (② B-7)
- [x] PostgreSQL 構文として有効 (括弧バランス、`$$` ペア、セミコロン終端、`CREATE FUNCTION` 修飾子順がすべて適合)

## 全体的な確認結果

- [x] 設定作業 (setup) が正しく完了している
- [x] 全ての静的検査項目が成功している
- [x] 品質基準 (Source of Truth との一致 + B2 方針による search_path 強化) を満たしている
- [x] 次のタスク (TASK-0007 RPC 関数定義) に進む準備が整っている

## 発見された問題と解決

### 発見された問題: なし (FAIL なし)

本タスクの静的検査では新たに発見された問題はありません。setup フェーズで認識済みの差分 (`SET search_path = public` の master 未記載) は B2 確定方針により許容済みであり、本検証フェーズでは PASS として扱います。

## 推奨事項

- TASK-0009 (実 DB 適用) で `supabase db push` 実行後、`SELECT proname, proconfig FROM pg_proc WHERE proname = 'is_member_of'` で `search_path=public` の反映を確認すること
- TASK-0011 (`supabase db lint` CI 統合) で `function_search_path_mutable` ルールが PASS することを確認 (B2 の二重防御が機能している証跡)
- TASK-0015 (RLS 統合テスト) で「未所属ユーザーの SELECT が空集合を返す」「`groups` / `group_members` への直接 INSERT が `permission denied` で拒否される」を実際にテストすること

## 次のステップ

- TASK-0006 完了マーキング (本 verify-report 直後に TASK-0006.md を `[x]` + ステータス更新へ反映)
- TASK-0007 (RPC 関数定義) で本ファイル末尾に `create_group_with_owner` / `generate_invitation_code` / `join_group_with_code` を追記。すべて `SET search_path = public` 付き SECURITY DEFINER (B2)
- TASK-0009 で実 DB 適用、TASK-0011 で `supabase db lint` CI 統合、TASK-0015 で RLS 統合テスト

## CLAUDE.mdへの記録内容

本タスクは SQL ファイルへの追記のみで、新たな実行コマンド・サービス起動・ビルド手順は発生していないため、CLAUDE.md への追記は **不要**。既存の `pnpm dev` / `pnpm build` / `pnpm lint` / `pnpm typecheck` でカバー済み。Supabase CLI 関連コマンド (`supabase db push` 等) は TASK-0009 のスコープであり、本タスクでの記録は行わない (ユーザ指示: 「CLAUDE.md / README.md には触らない」)。

## 検証結果サマリー

**全項目 PASS / FAIL 0 件**

- 静的検査項目: 7 カテゴリ (関数定義 / RLS 有効化 / ポリシー数 / 関数呼び出しパターン / 構文機械チェック / TASK-0007 不混入 / TASK-0005 部分の無改変) すべて PASS
- Source of Truth との一致: ポリシー本体 + RLS 有効化文 + ポリシーヘッダで `diff` 差分 0
- B2 確定方針 (`SET search_path = public`) も反映済み
