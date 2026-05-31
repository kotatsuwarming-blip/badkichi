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
| 全マイグレーション SQL が main にマージ済 | ⏳ | 対象 3 ファイル: `20260519060000_initial_schema.sql` / `20260524150000_adr_006_single_group_per_user.sql` / `20260529124258_task_0015_test_force_collision_invitation_code.sql` |
| main マージで migrate-prd.yml 自動発火・ジョブ success | ⏳ | Actions run URL: |
| CI ログから適用時刻取得（開始→終了, UTC）| ⏳ | 開始: / 終了: |

## C. prd の状態確認

| 項目 | 期待 | 状態 | 記録 |
|------|------|------|------|
| 11 テーブル存在 | 11 行 | ⏳ | groups, group_members, group_invitations, players, matches, sets, set_player_positions, rallies, shots, position_overrides, recording_gaps |
| RLS 有効化 | 11 行全て `rowsecurity = true` | ⏳ | |
| 3 RPC 存在 | create_group_with_owner / generate_invitation_code / join_group_with_code | ⏳ | |
| prd リンクで型生成成功 | エラーなし | ⏳ | |
| 型 diff（dev vs prd）| 差分 0 | ⏳ | 対象: `app/types/supabase.ts` |
| CLI リンクが dev に戻っている | dev ref | ⏳ | `supabase status --linked` |
| `db:reset` ガード動作 | prd リンク時 exit 1 | ⏳ | ※ db:reset はローカル撤去済（CI 一本化）。ガード所在を確認の上記録 |

## D. NFR-001 実測

| 項目 | 期待 | 実測 | 状態 |
|------|------|------|------|
| `supabase db push` 実行時間 | 30 秒以内 | ⏳ 秒 | ⏳ |

> 30 秒超過時は失敗扱いとせず「現状値として記録し将来の改善対象」とする（注意事項参照）。

## E. バックアップ確認（適用後 24h 以内）

| 項目 | 状態 | 記録 |
|------|------|------|
| prd 日次バックアップ取得 | ⏳ | 取得時刻（UTC）: / 容量: |
| Free プラン DB 容量現在値 | ⏳ | / 500MB |

## F. ドキュメント更新

| 項目 | 状態 | 記録 |
|------|------|------|
| 本検証ログに A〜E を記載 | ⏳ | |
| 復旧手順を文書化 | ✅ | [docs/operations/recovery.md](../../../operations/recovery.md) 作成 + README に導線追記 |

---

## 総合判定

⏳ 本番反映（dev→main マージ・ユーザ承認待ち）後に記録する。

## 備考

- 本番反映トリガーは `main` への push（`supabase/migrations/**` 変更）→ `migrate-prd.yml` 自動発火。
- `db:push`/`db:reset` のローカル実行は禁止（CI 一本化）。検証は CI ログ + Supabase Dashboard / Management API 経由で行う。
- バックアップ・適用時刻は UTC 基準で併記する。
