# TASK-0007 設定確認・動作テスト

## 確認概要

- **タスクID**: TASK-0007
- **確認内容**: RPC 関数 3 件 (`create_group_with_owner` / `generate_invitation_code` / `join_group_with_code`) が `supabase/migrations/20260519060000_initial_schema.sql` に正しく追記され、TASK-0007.md の全完了条件を満たしているかを静的に検証する。
- **実行日時**: 2026-05-19
- **実行者**: Claude Code (direct-verify, Opus 4.7)

## 設定確認結果

### 1. 検証対象ファイル

- `supabase/migrations/20260519060000_initial_schema.sql` (593 行)
- 参照: `docs/design/data-foundation/database-schema.sql` (RPC セクション転写元 = Source of Truth)
- 参照: `docs/tasks/data-foundation/TASK-0007.md` (完了条件)
- 参照: `docs/implements/data-foundation/TASK-0007/setup-report.md` (実行記録)

### 2. RPC 関数定義の存在確認

```bash
grep -n '^CREATE OR REPLACE FUNCTION' supabase/migrations/20260519060000_initial_schema.sql
```

**実測結果**:

```
30:CREATE OR REPLACE FUNCTION update_updated_at()
305:CREATE OR REPLACE FUNCTION is_member_of(target_group_id uuid)
495:CREATE OR REPLACE FUNCTION create_group_with_owner(group_name text)
528:CREATE OR REPLACE FUNCTION generate_invitation_code(target_group_id uuid)
563:CREATE OR REPLACE FUNCTION join_group_with_code(invite_code text)
```

**確認結果**:

- [x] `create_group_with_owner(group_name text)` 定義あり (行 495)
- [x] `generate_invitation_code(target_group_id uuid)` 定義あり (行 528)
- [x] `join_group_with_code(invite_code text)` 定義あり (行 563、引数名は database-schema.sql 準拠 `invite_code`)

### 3. 戻り値の型

```bash
grep -n 'RETURNS ' supabase/migrations/20260519060000_initial_schema.sql
```

**実測結果**:

```
31:RETURNS TRIGGER AS $$
306:RETURNS boolean
496:RETURNS uuid          (create_group_with_owner)
529:RETURNS text          (generate_invitation_code)
564:RETURNS uuid          (join_group_with_code)
```

**確認結果**:

- [x] `create_group_with_owner` → `uuid`
- [x] `generate_invitation_code` → `text`
- [x] `join_group_with_code` → `uuid`

### 4. 関数修飾子 (LANGUAGE / SECURITY DEFINER / SET search_path)

```bash
grep -nE 'LANGUAGE plpgsql|LANGUAGE sql' supabase/migrations/20260519060000_initial_schema.sql
grep -n 'SECURITY DEFINER' supabase/migrations/20260519060000_initial_schema.sql
grep -n 'search_path' supabase/migrations/20260519060000_initial_schema.sql
```

**実測結果サマリ**:

| 関数 | LANGUAGE | SECURITY DEFINER | SET search_path = public |
|---|---|---|---|
| `is_member_of` (TASK-0006) | sql (行 307) | 行 308 | 行 310 |
| `create_group_with_owner` | plpgsql (行 497) | 行 498 | 行 499 |
| `generate_invitation_code` | plpgsql (行 530) | 行 531 | 行 532 |
| `join_group_with_code` | plpgsql (行 565) | 行 566 | 行 567 |

- `^SET search_path = public` の行頭出現回数: **4** (期待: 4) ✅
- 関数定義に付与された `SECURITY DEFINER` 実定義箇所: **4** (期待: 4、コメント言及の 5 件除外) ✅

**確認結果**:

- [x] 3 RPC すべてに `LANGUAGE plpgsql`
- [x] 3 RPC すべてに `SECURITY DEFINER`
- [x] 3 RPC すべてに `SET search_path = public` (B2 確定方針)
- [x] is_member_of も含めて 4 個の SECURITY DEFINER 関数に search_path 固定済み

### 5. 例外 (RAISE EXCEPTION) の網羅

```bash
grep -n "RAISE EXCEPTION" supabase/migrations/20260519060000_initial_schema.sql
```

**実測結果**:

```
505:    RAISE EXCEPTION 'not_authenticated';
511:    RAISE EXCEPTION 'invalid_group_name';
540:    RAISE EXCEPTION 'not_a_member';
554:        RAISE EXCEPTION 'invitation_code_collision_after_retry';
578:    RAISE EXCEPTION 'invitation_not_found';
582:    RAISE EXCEPTION 'invitation_expired';
```

**確認結果**:

| 関数 | 期待例外 | 実装 |
|---|---|---|
| create_group_with_owner | `not_authenticated` | [x] 行 505 |
| create_group_with_owner | `invalid_group_name` | [x] 行 511 |
| generate_invitation_code | `not_a_member` | [x] 行 540 |
| generate_invitation_code | `invitation_code_collision_after_retry` | [x] 行 554 |
| join_group_with_code | `invitation_not_found` | [x] 行 578 |
| join_group_with_code | `invitation_expired` | [x] 行 582 |
| join_group_with_code | PG `23505` 伝播 (二重参加) | [x] 行 587-588 INSERT のみ、明示変換なし |

api-endpoints.md / database-schema.sql の確定値と完全一致。

### 6. 正常系ロジック

#### create_group_with_owner

- [x] `auth.uid() IS NULL` ガード (行 504-506)
- [x] `group_name` trim 後 1〜50 文字外で `invalid_group_name` (行 508-512)
- [x] `INSERT INTO groups (name) VALUES (trim(group_name)) RETURNING id INTO new_group_id` (行 514)
- [x] `INSERT INTO group_members (group_id, user_id) VALUES (new_group_id, auth.uid())` (行 515)
- [x] `RETURN new_group_id` (行 517)
- [x] 同一トランザクション内で 2 INSERT 原子化 (plpgsql 関数本体は単一トランザクション)

#### generate_invitation_code

- [x] `is_member_of(target_group_id)` チェック (行 539)
- [x] 8 文字大文字 hex 生成: `upper(substring(replace(gen_random_uuid()::text, '-', '') from 1 for 8))` (行 546)
- [x] `INSERT INTO group_invitations (group_id, code, created_by, expires_at) VALUES (target_group_id, new_code, auth.uid(), now() + interval '7 days')` (行 549-550)
- [x] `EXCEPTION WHEN unique_violation` でリトライ (行 552)
- [x] `max_attempts constant int := 5` (行 537)、`IF attempt >= max_attempts THEN RAISE EXCEPTION 'invitation_code_collision_after_retry'` (行 553-554)
- [x] 成功時 `RETURN new_code` (行 551)

#### join_group_with_code

- [x] `SELECT * INTO invitation_record FROM group_invitations WHERE code = invite_code AND deleted_at IS NULL` (行 573-575)
- [x] `IF NOT FOUND THEN RAISE EXCEPTION 'invitation_not_found'` (行 577-579)
- [x] `IF invitation_record.expires_at < now() THEN RAISE EXCEPTION 'invitation_expired'` (行 581-583)
- [x] `INSERT INTO group_members (group_id, user_id) VALUES (target_group_id, auth.uid())` (行 587-588)
- [x] UNIQUE (group_id, user_id) 制約に二重参加検出を委譲。明示的なカスタム例外への変換なし
- [x] `RETURN target_group_id` (行 591)

### 7. TASK-0005 / TASK-0006 部分の無改変確認

```bash
grep -c '^CREATE TABLE'              ...   # 11 件
grep -c '^CREATE INDEX'              ...   # 11 件
grep -c 'ENABLE ROW LEVEL SECURITY'  ...   # 11 件
grep -c 'CREATE POLICY'              ...   # 28 件
grep -c '^CREATE OR REPLACE FUNCTION is_member_of' ...  # 1 件
```

**実測結果**:

| チェック項目 | 期待値 | 実測値 | 判定 |
|---|---|---|---|
| `^CREATE TABLE` | 11 | 11 | ✅ |
| `^CREATE INDEX` | 11 | 11 | ✅ |
| `ENABLE ROW LEVEL SECURITY` | 11 | 11 | ✅ |
| `CREATE POLICY` | 28 | 28 | ✅ |
| `is_member_of` 関数定義 | 1 | 1 | ✅ |

TASK-0005 / TASK-0006 部分の改変なし。

## コンパイル・構文チェック結果

### 1. ドル引用符 `$$` のペアバランス

```bash
grep -oF '$$' supabase/migrations/20260519060000_initial_schema.sql | wc -l
```

**実測**: 10 (= 5 関数 × 2 ペア、偶数) ✅

内訳:

- `update_updated_at` : 行 31, 36
- `is_member_of` : 行 311, 318
- `create_group_with_owner` : 行 500, 519
- `generate_invitation_code` : 行 533, 560
- `join_group_with_code` : 行 568, 593

すべて開閉対応あり。

### 2. 括弧 `()` のバランス (コメント / 文字列リテラル除外後)

Python スクリプトで行コメント (`--`) と単一引用符文字列を除去してカウント:

```
Open parens: 238
Close parens: 238
Balanced: True
```

✅ 括弧バランス成立。

### 3. トランザクション制御ステートメントの不在

```bash
grep -nE "(BEGIN|COMMIT|ROLLBACK)" ...
```

**実測**:

```
32:BEGIN     ← plpgsql 関数本体 BEGIN
503:BEGIN    ← plpgsql 関数本体 BEGIN
538:BEGIN    ← plpgsql 関数本体 BEGIN
548:BEGIN    ← EXCEPTION ブロックの BEGIN
572:BEGIN    ← plpgsql 関数本体 BEGIN
```

`COMMIT` / `ROLLBACK` / トップレベル `BEGIN;` は **皆無**。Supabase マイグレーション要件 (CLI が自動でラップ) を満たす。 ✅

### 4. SQL 構文の一貫性

セミコロンで終端されるステートメント (`grep -c ';$'` = 116 行) と関数定義の対応を目視確認。RPC 3 関数とも `$$;` で正しく終端。

### 5. 日時関数

- [x] `now() + interval '7 days'` (行 550): 7 日後の有効期限 (EDGE-101)
- [x] `now()` 比較: 期限切れ検証 (行 581)

## 動作テスト結果

### 1. 静的検証スコープ

TASK-0007.md 動作確認セクションの規定により、本タスクの動作確認は **関数定義の存在確認まで** とする (RPC 実挙動の検証は TASK-0015 RPC 統合テストで実施)。`supabase db push` / `supabase db reset` は **実行禁止**。

### 2. 期待される DB 適用後の挙動 (将来 TASK-0015 で実検証)

```sql
-- 3 RPC 存在確認
SELECT proname, prosecdef, prorettype::regtype
FROM pg_proc
WHERE proname IN ('create_group_with_owner','generate_invitation_code','join_group_with_code');
```

期待結果:

| proname | prosecdef | prorettype |
|---|---|---|
| create_group_with_owner | t | uuid |
| generate_invitation_code | t | text |
| join_group_with_code | t | uuid |

```sql
-- search_path 固定確認
SELECT proname, proconfig FROM pg_proc
WHERE proname IN ('is_member_of','create_group_with_owner','generate_invitation_code','join_group_with_code');
```

期待: 4 件すべて `proconfig` が `{search_path=public}` を含む。

## 品質チェック結果

### セキュリティ設定の確認

- [x] 全 RPC に `SECURITY DEFINER` (RLS バイパスを意図的に許可)
- [x] 全 SECURITY DEFINER 関数に `SET search_path = public` (CVE-2018-1058 系 search_path 攻撃の防御)
- [x] `auth.uid()` ベースの認可ガード (create_group_with_owner で `not_authenticated`、generate_invitation_code で `is_member_of`)
- [x] 招待コード生成は CSPRNG (`gen_random_uuid()`)、衝突時はリトライ + 上限あり (DoS 耐性)
- [x] UNIQUE 制約による二重参加防止 (アプリ層 race condition に依存しない)

### Supabase ベストプラクティス整合

- [x] B1 確定方針: 既存マイグレーションへの追記 (新規 `_rpc.sql` 作成なし) ✅
- [x] B2 確定方針: 全 SECURITY DEFINER 関数に search_path 固定 ✅
- [x] `supabase db lint` で `function_search_path_mutable` が出ない構造 (TASK-0011 で CI 検証予定)

### 例外名と api-endpoints.md の整合

- [x] `invitation_not_found` / `invitation_expired` / PG `23505` (database-schema.sql + api-endpoints.md 確定値)

## 全体的な確認結果

- [x] TASK-0007.md の全完了条件 (create_group_with_owner 6 件 + generate_invitation_code 7 件 + join_group_with_code 7 件 + 共通 4 件) を充足
- [x] 3 RPC 関数の存在 + 修飾子 (LANGUAGE plpgsql / SECURITY DEFINER / SET search_path = public) すべて確認
- [x] 例外の網羅 (6 種類 + PG 23505 伝播) すべて確認
- [x] 正常系ロジック (CSPRNG / リトライ / 7 日有効 / UNIQUE 二重参加防止) すべて確認
- [x] TASK-0005 / TASK-0006 部分の無改変 (テーブル 11 / インデックス 11 / RLS 有効化 11 / ポリシー 28 / is_member_of 1)
- [x] 構文の機械的一貫性 (`$$` 偶数、括弧バランス、トップレベル `BEGIN/COMMIT` 不在)

## 発見された問題と解決

なし。setup-report.md 通りに `database-schema.sql` の RPC セクションを完全転写し、`SET search_path = public` を B2 方針に従って付与済み。修正・自動解決は不要。

## 結論

**全項目 PASS / FAIL 0 件**

TASK-0007 の RPC 関数定義はすべて完了条件を満たしており、後続 TASK-0008 (型自動生成) へ進める状態。

## 推奨事項

- TASK-0008 で `pnpm supabase gen types typescript --linked > types/supabase.ts` を実行し、RPC の TypeScript 型 (`Database['public']['Functions']`) を取り込む
- TASK-0011 の CI で `supabase db lint --linked` を回し、`function_search_path_mutable` 等のセキュリティ警告が無いことを継続的に保証する
- TASK-0015 の RPC 統合テストで以下を検証する:
  - create_group_with_owner: 未認証時の `not_authenticated`、trim 後 0 / 51 文字での `invalid_group_name`、正常作成時の groups + group_members 同時生成
  - generate_invitation_code: 非メンバー時の `not_a_member`、衝突モックでの 5 回リトライ動作、7 日後 expires_at
  - join_group_with_code: 存在しないコードでの `invitation_not_found`、期限切れでの `invitation_expired`、二重参加での PG `23505`

## 次のステップ

- TASK-0007 のステータスを「✅ 完了」に更新済み (本検証で全完了条件 PASS)
- TASK-0008 (型自動生成パイプライン) の開始準備が整った
- overview.md の更新は別ステップで処理 (本タスクスコープ外)

## CLAUDE.mdへの記録内容

本タスクは DB マイグレーションファイルへの SQL 追記のみで、新規の開発コマンド (テスト / 起動 / ビルド) は導入していない。CLAUDE.md の既存 `## Commands` セクション (pnpm dev / build / lint / typecheck / preview) で十分であり、追記不要と判定した。
