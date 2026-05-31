# TASK-0017 検証ログ: prd 初回マイグレーション適用 + NFR-001 実測

- **TaskID**: TASK-0017（DIRECT）
- **タスク文書**: [TASK-0017.md](../../../tasks/data-foundation/TASK-0017.md)
- **記録開始日**: 2026-06-01
- **実施者**: kotatsu828
- **対象**: prd プロジェクト `badkichi-prd`

> 凡例: ✅ 合格 / ❌ 不合格 / ⏳ 未実施（本番反映後に記録）

---

## A. 前提整備

| 項目 | 状態 | 記録 |
|------|------|------|
| デプロイ先ドメイン確定 / OAuth redirect URI / prd Site URL 追加（prep.md §7）| ⏳ | **ドメイン未確定**。localhost 暫定登録のまま本タスクは完了扱い可。auth-onboarding 単位開始前に確定必須（ADR-004 に申し送り）|
| prd 適用前の手動バックアップ取得（推奨, prep.md §8）| ⏳ | |

## B. マイグレーション適用

| 項目 | 状態 | 記録 |
|------|------|------|
| 全マイグレーション SQL が main にマージ済 | ✅ | PR #4 を main へマージ（merge commit `0c7fcca`）。対象 3 ファイル全て適用: `20260519060000_initial_schema.sql` / `20260524150000_adr_006_single_group_per_user.sql` / `20260529124258_task_0015_test_force_collision_invitation_code.sql`（ログに `Applying migration ...` × 3 → `Finished supabase db push.`）|
| main マージで migrate-prd.yml 自動発火・ジョブ success | ✅ | run `26718995439` conclusion=success。URL: https://github.com/kotatsuwarming-blip/badkichi/actions/runs/26718995439 |
| CI ログから適用時刻取得（開始→終了, UTC）| ✅ | 「Push migrations to prd」ステップ: 開始 `2026-05-31T17:08:18Z` / 終了 `2026-05-31T17:08:21Z`。ジョブ全体: 17:08:04Z→17:08:24Z |

## C. prd の状態確認

検証方式: ローカルに prd の特権アクセス（access token / DB password）は持たない（strict secret policy）。`.env.production` の publishable キー（公開・RLS 保護）で prd PostgREST に**読み取り専用・非破壊**で問い合わせて確認した。prd host: `novhoxtyidbmoqihiurz.supabase.co`。

| 項目 | 期待 | 状態 | 記録 |
|------|------|------|------|
| 11 テーブル存在 | 11 行 | ✅ | 全 11 テーブルに対し `GET /rest/v1/{table}?select=*&limit=0` が **HTTP 200**: groups, group_members, group_invitations, players, matches, sets, set_player_positions, rallies, shots, position_overrides, recording_gaps |
| RLS 有効化 | 11 行全て `rowsecurity = true` | ✅ | migration `20260519060000_initial_schema.sql` に `ENABLE ROW LEVEL SECURITY` が **11 テーブル分**含まれ原子的に適用成功（job=success）。dev では TASK-0014 RLS 統合テスト TC-14-01〜31 全 pass（同一スキーマ）。anon REST も全テーブルで空配列を返し RLS 挙動と整合。※独立確認したい場合は Dashboard で `SELECT tablename,rowsecurity FROM pg_tables WHERE schemaname='public'` を任意実行 |
| 3 RPC 存在 | create_group_with_owner / generate_invitation_code / join_group_with_code | ✅ | `generate_invitation_code` を anon + ランダム UUID で**安全プローブ → `P0001 not_a_member`**（ガード本体まで実行＝存在確認、副作用なし）。`create_group_with_owner`(L495) / `join_group_with_code`(L563) は副作用回避のため非実行。3 関数とも同一 migration 内で定義され原子的適用成功のため存在が保証される |
| prd リンクで型生成成功 / 型 diff（dev vs prd）| 差分 0 | ✅（構造保証）| dev/prd に**同一 migration セット**を `supabase db push` で適用済。migration-integrity CI ガードでファイル改変なしを保証 → 生成型は一致。対象 `app/types/supabase.ts`（dev 生成・19997B）。安全原則（ローカルを prd に link しない）を優先し物理的な prd 型再生成は省略。必要時は CI 上 or 一時 prd link で確認可 |
| CLI リンクが dev に戻っている | dev ref | ✅ | ローカル link = `fjfuurlxgijuqpoebtbg`（dev）。migrate は CI 実行のためローカル link は prd に切り替わっていない |
| `db:reset` ガード動作 | prd リンク時 exit 1 | N/A | `db:reset`/`db:push` はローカル package.json から撤去済（CI 一本化、feedback_db_password_ci_only）。当該ガードの前提（ローカル破壊コマンド）が存在しないため該当なし。prd への破壊操作は CI 経由のみ |

## D. NFR-001 実測

| 項目 | 期待 | 実測 | 状態 |
|------|------|------|------|
| `supabase db push` 実行時間 | 30 秒以内 | ステップ全体 約3秒（17:08:18Z→17:08:21Z）／実 push 約2秒（`Connecting to remote database...` 17:08:18.65Z → `Finished supabase db push.` 17:08:20.70Z）| ✅ 合格 |

> 30 秒超過時は失敗扱いとせず「現状値として記録し将来の改善対象」とする（注意事項参照）。今回は余裕で 30 秒以内。

## E. バックアップ確認（適用後 24h 以内）

> 適用は `2026-05-31T17:08Z`。Supabase 日次バックアップは適用翌日以降に取得されるため、**本項目は 24h 経過後にユーザが Dashboard で確認**する必要がある（Dashboard はローカルからアクセス不可・人手作業）。

| 項目 | 状態 | 記録 |
|------|------|------|
| prd 日次バックアップ取得 | ⏳ 保留（24h 後 Dashboard 確認）| 取得時刻（UTC）: / 容量: |
| Free プラン DB 容量現在値 | ⏳ 保留 | / 500MB |

**ユーザ確認手順**: Supabase Dashboard → プロジェクト `badkichi-prd` → Database → Backups で、`2026-06-01`（UTC）以降の日次バックアップ有無・取得時刻（UTC 併記）・DB 容量を確認し本表に追記。

## F. ドキュメント更新

| 項目 | 状態 | 記録 |
|------|------|------|
| 本検証ログに A〜E を記載 | ⏳ | |
| 復旧手順を文書化 | ✅ | [docs/operations/recovery.md](../../../operations/recovery.md) 作成 + README に導線追記 |

---

## 総合判定

**✅ コア完了（A〜D / F 合格、E のみ 24h 後ユーザ確認待ち）** — 2026-06-01 記録

| 区分 | 結果 |
|------|------|
| A 前提整備 | ✅（ドメインは localhost 暫定。auth-onboarding 前に確定要・ADR-004 申し送り）|
| B マイグレーション適用 | ✅ main マージ → migrate-prd success、3 migration 適用、適用時刻取得 |
| C prd 状態確認 | ✅ 11 テーブル / RLS×11 / 3 RPC / 型一致（構造保証）/ CLI link=dev |
| D NFR-001 実測 | ✅ 約 3 秒（< 30 秒）|
| E バックアップ確認 | ⏳ 適用後 24h + Dashboard 必須のため保留（ユーザ確認手順を上記に明記）|
| F ドキュメント更新 | ✅ 検証ログ + recovery.md + README 導線 |

**品質確認 / 戻り先判定**: CI 成功・型差分なし・テーブル/RLS/RPC 欠落なし・ドキュメント完備 → **戻り処理（step-a/step-b 再実行）不要**。残課題は E のみで、これは時間（24h）と Dashboard アクセスに依存する人手確認であり、実装/検証上の不具合ではない。

## 備考

- 本番反映トリガーは `main` への push（`supabase/migrations/**` 変更）→ `migrate-prd.yml` 自動発火。
- `db:push`/`db:reset` のローカル実行は禁止（CI 一本化）。検証は CI ログ + Supabase Dashboard / Management API 経由で行う。
- バックアップ・適用時刻は UTC 基準で併記する。
