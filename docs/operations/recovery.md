# prd マイグレーション障害 復旧手順

prd（`badkichi-prd`）プロジェクトへのマイグレーション適用後に重大障害が発覚した場合の復旧手順をまとめる。

- 関連タスク: [TASK-0017](../tasks/data-foundation/TASK-0017.md)（prd 初回マイグレーション適用）
- 関連設計判断: スキーマレビュー ⑮ C-17 案 ii（適用前バックアップは追加せず Supabase 標準の日次バックアップに任せる）
- CI ワークフロー: [.github/workflows/migrate-prd.yml](../../.github/workflows/migrate-prd.yml)
- CLI 運用ガイド: [supabase-cli.md](./supabase-cli.md)

## 前提

- prd への適用は `main` への push（`supabase/migrations/**` 変更時）で `migrate-prd.yml` が自動発火し、`supabase db push --linked` が走る。
- 適用前の専用バックアップは取得しない方針。**Supabase 標準の日次バックアップ**（Free プラン: 日次・保持 7 日）に依存する。
- バックアップは **UTC 基準**。ローカル時刻と混同しないこと。

## ロールバック判断フロー

適用後に障害が発覚した場合、以下の順で判断する。

1. **CI ログ確認** — GitHub Actions の `migrate-prd` 実行ログでジョブ結果・適用内容を確認する。失敗時は `prd-migration-failure` ラベル付きの Issue が自動作成される。
2. **影響範囲評価** — どのテーブル / RPC / RLS が影響を受けたか、データ破損があるかを評価する。
3. **対応の選択**:
   - スキーマ定義のみの問題でデータ破損がない → **revert マイグレーションで前進復旧**（下記 A）
   - データ破損を伴う重大障害 → **日次バックアップから Restore**（下記 B）

> **重要（Free プラン制約）**: 日次バックアップの保持期間は **7 日**。障害発見から **7 日以内** に対応を完了する必要がある。

## A. revert マイグレーションによる前進復旧（推奨）

データ破損がなくスキーマ定義の問題のみの場合、バックアップ Restore より安全。

1. 問題のあったマイグレーションを打ち消す **revert マイグレーション SQL** を `supabase/migrations/` に追加する（タイムスタンプは新しいものを採番）。
2. `dev` で先に適用・検証する（`migrate-dev.yml` 経由）。
3. revert を含むブランチを `dev` にマージし、検証完了後 `main` にマージ。
4. `main` への push で `migrate-prd.yml` が再発火し、prd に反映される。

## B. 日次バックアップからの Restore（データ破損時）

> ⚠️ **Free プランの制約（2026-06-01 確認）**: Free プランの Backups ページは「Projects are backed up daily around midnight of your project's region」という定型メッセージのみで、**スナップショット一覧・Restore UI は表示されない**（自己リストア / PITR は Pro 機能）。日次バックアップ自体はプラットフォーム側で取得（東京リージョン = 約 00:00 JST）されているが、**Free のままでは self-serve Restore ができない可能性が高い**。

**現状の前提**: prd は実データ無し（MVP 未公開・スキーマのみ）。データ破損時も実損失はほぼ無いため、**手順 A（マイグレーション再適用 / revert）で復旧可能**。バックアップ Restore への依存度は低い。

**実データ投入前に必須の判断**:

1. **Pro プランへ移行**して self-serve Restore / PITR を有効化する（実ユーザーデータを扱う前に推奨）。
2. Restore が必要になった場合の Free プランでの手順:
   - Supabase Dashboard → 対象プロジェクト（`badkichi-prd`）→ **Database → Backups** で Restore UI の有無を確認。
   - UI が無い場合は **Supabase サポートへ問い合わせ**、または Pro へ一時アップグレードして Restore を実行。
3. Restore 後は、問題のあったマイグレーションを **revert する PR** を作成し `dev` 検証 → `main` マージ → CI 反映（手順 A と同じ）。`supabase migration list --linked` で prd の適用状況を `supabase/migrations/` と整合させる。

## エスカレーション

- 連絡 / 判断先: **オーナー kotatsu828 のみ**（MVP 段階では単独運用）。
- prd への破壊操作（`supabase db reset` 等）は禁止。CI 経由のみで操作する（[supabase-cli.md ⚠️ 禁止事項](./supabase-cli.md) 参照）。

## バックアップ仕様（参考）

| 項目 | 値 |
|------|-----|
| プラン | Free |
| バックアップ頻度 | 日次（自動） |
| 保持期間 | 7 日 |
| 基準時刻 | UTC |
| 取得場所 | Supabase Dashboard → Database → Backups |
