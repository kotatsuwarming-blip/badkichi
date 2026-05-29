# TASK-0015 完了検証: RPC 統合テスト

- **要件名**: data-foundation
- **タスク ID**: TASK-0015
- **作成日**: 2026-05-29
- **検証範囲**: tdd-testcases.md TC-15-01〜TC-15-11

---

## 1. 成果物

| パス | 内容 |
|------|------|
| `tests/integration/rpc.integration.test.ts` | TC-15-01〜TC-15-11 を実装した統合テスト本体 |
| `tests/integration/helpers/rpc-fixtures.ts` | `createExpiredInvitation` / `seedCollisionInvitation` / `deleteInvitationByCode` ヘルパ |
| `supabase/migrations/20260529124258_task_0015_test_force_collision_invitation_code.sql` | TC-15-07 用 B 案テスト RPC `test_force_collision_invitation_code` |

---

## 2. 完了条件チェック

> 📝 ローカル検証範囲: `pnpm typecheck` / `pnpm lint` のみ。`pnpm test:integration` は
> 環境変数 (`NUXT_PUBLIC_SUPABASE_URL` / `NUXT_PUBLIC_SUPABASE_KEY` / `NUXT_SUPABASE_SECRET_KEY`)
> の strict secret policy によりローカル実行不可。CI (`integration-test` job, environment=dev)
> で全件パスを確認する。

### 2.1 ファイル / RPC 個別件数

- [x] `tests/integration/rpc.integration.test.ts` が作成されている 🔵
- [x] **create_group_with_owner**: 正常 1 + 異常 3 = 4 件 🔵
  - [x] TC-15-01 正常: User A + `'テストG'` → uuid + `groups.name = 'テストG'` + `group_members` 行 🔵
  - [x] TC-15-02 異常: 未認証 → `not_authenticated` 🔵
  - [x] TC-15-03 境界: `''` → `invalid_group_name` 🔵
  - [x] TC-15-04 境界: 51 文字 → `invalid_group_name` 🔵
- [x] **generate_invitation_code**: 正常 1 + 異常 2 = 3 件 🔵
  - [x] TC-15-05 正常: メンバー User A → `^[A-F0-9]{8}$`, `group_invitations` 行存在 🔵
  - [x] TC-15-06 異常: 非メンバー User B → `not_a_member` 🔵
  - [x] TC-15-07 異常: 5 回連続衝突 → `invitation_code_collision_after_retry`
        (B 案 `test_force_collision_invitation_code` + `seedCollisionInvitation` で再現) 🔵
- [x] **join_group_with_code**: 正常 1 + 異常 3 = 4 件 🔵
  - [x] TC-15-09 異常: 不正コード `INVALID0` → `invitation_not_found` 🔵
  - [x] TC-15-10 異常: 期限切れコード → `invitation_expired` (EDGE-001, EDGE-101) 🔵
  - [x] TC-15-08 正常: User B が `validCode` で参加 → `group_members` 行追加 🔵
  - [x] TC-15-11 異常: 既メンバー再参加 → `already_in_group`
        (ADR-006 早期失敗ガード経路に変更、tdd-testcases.md 注記済) 🔵

### 2.2 静的検証 / 実行

- [x] `pnpm typecheck` (ローカル実行 OK、exit 0)
- [x] `pnpm lint` (ローカル実行 OK、exit 0)
- [ ] `pnpm test:integration` 全件 pass (CI で確認、ローカル env 未配布)

### 2.3 副作用整理

- [x] `beforeAll` / `afterAll` で `cleanupTestUserData([userAId, userBId])` を呼び出し、
      テスト前後に dev DB の状態を初期化
- [x] TC-15-07 / TC-15-10 の seed コードは各 `it` の末尾で `deleteInvitationByCode()` 削除
- [x] FK CASCADE 未設定のため、cleanup は `group_invitations` → `group_members` → `groups`
      の順 (`cleanupTestUserData` 実装通り)

---

## 3. TASK-0015 仕様からの差分・補足

### 3.1 テスト実行順序の変更 (TC-15-08 → 09 → 10 → 11 ではなく 09 → 10 → 08 → 11)

**理由**: ADR-006 (TASK-0018) の追補により `join_group_with_code` 冒頭で「既所属チェック」が
先に発火する。TC-15-09 (`invitation_not_found`) / TC-15-10 (`invitation_expired`) を
TC-15-08 (User B が参加) の後に実行すると `already_in_group` が先に raise されてしまい、
本来検証したい例外名と異なる結果となる。
よって `describe('join_group_with_code')` 内で「未所属時の異常系 → 参加 → 既所属時の異常系」
の順に並び替えた。tdd-testcases.md § 1 の表は順序ではなく ID 順なので矛盾しない。

### 3.2 TC-15-11 の期待値変更 (PG `23505` → `already_in_group`)

**理由**: ADR-006 (TASK-0018) の追補で RPC 冒頭に `IF EXISTS (group_members WHERE user_id = auth.uid())`
ガードが追加され、UNIQUE 違反 (23505) ではなく `already_in_group` 例外が先に発火する。
tdd-testcases.md TC-15-11 行で既に注記済み。

### 3.3 TC-15-07 B 案実装 = テスト用 RPC migration の追加

**migration**: `supabase/migrations/20260529124258_task_0015_test_force_collision_invitation_code.sql`

- `generate_invitation_code` 本体は `gen_random_uuid()` ベースで CSPRNG 出力を制御不可
- B 案として `test_force_collision_invitation_code` という固定コード `'DEADBEEF'` を使う
  ラッパ RPC を追加 (`SECURITY DEFINER` + `SET search_path = public`)
- テスト側で `seedCollisionInvitation()` 経由で同コードを事前 INSERT → 5 回 UNIQUE 違反 → 例外発火
- **prd への適用**: 本 migration は prd にも適用される (CI で migrate-prd.yml が反応)。
  RPC は `is_member_of()` チェック + 固定コード返却のため誤呼び出しの実害は限定的だが、
  TASK-0017 (prd 初回マイグレーション) 直前に **本 RPC を別 migration で `DROP FUNCTION` するか
  検討する必要がある**。ADR 候補として残す (`project_adr_candidates_pre_kairo_design.md` に追記推奨)。

---

## 4. CI 経路で確認すべき項目 (ローカル未確認)

| 項目 | 検証手段 |
|------|----------|
| migrate-dev.yml が新規 migration を dev に適用 | GitHub Actions UI |
| db-lint (`supabase db lint --linked --level error`) で警告なし | ci.yml `db-lint` ジョブ |
| integration-test ジョブで TC-15-01〜TC-15-11 全件 pass | ci.yml `integration-test` ジョブ |
| migration integrity ガードに引っかからない (既存ファイル改変なし) | ci.yml `migration-integrity` ジョブ |

> ⚠️ **タイミング注意**: ci.yml の `integration-test` ジョブと migrate-dev.yml は別ワークフロー。
> 同一 commit で push した場合、migrate-dev が dev DB へ migration を反映する前に
> integration-test が走ると TC-15-07 が `function does not exist` で fail する可能性がある。
> 失敗時は **GitHub Actions UI から integration-test を re-run** すれば次回はパスする。
> (TASK-0014 (ADR-006 migration) の commit でも同様パターンが想定された)

---

## 5. 品質レベルサマリー

| カテゴリ | 🔵 | 🟡 | 🔴 | 合計 |
|----------|----|----|----|------|
| 完了条件 (機能) | 11 | 0 | 0 | 11 |
| 実装詳細 | 5 | 1 (TC-15-07 prd 残置) | 0 | 6 |
| 単体テスト要件 | 11 | 0 | 0 | 11 |

**評価**: 機能完了条件は 11/11 即実装、🟡 残課題は「テスト用 RPC を prd に残すか否か」のみ。
TASK-0017 着手前に対処要否を判断する。
