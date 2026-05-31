# Supabase CLI 運用ガイド

本プロジェクトの Supabase CLI 操作手順をまとめる。詳細な設計は [docs/design/data-foundation/architecture.md](../design/data-foundation/architecture.md) を参照。

## 前提

- Supabase CLI v1.x 以降
- `supabase login` 済み
- dev プロジェクト (`badkichi-dev`) / prd プロジェクト (`badkichi-prd`) は TASK-0001 で作成済

## 平時の運用

**dev プロジェクトに link した状態を維持する** ことが原則。

```bash
# 初回または別開発者の clone 後
supabase link --project-ref {DEV_REF}

# 現在の link 先確認
supabase status --linked

# スキーマ差分確認 / 適用
supabase migration list
supabase db push  # dev に適用 (Phase 1 後半でスクリプト化予定)
```

> link 状態は `supabase/.temp/project-ref` に保存される (git ignored)。クローン直後やマシン移行後は再 link が必要。

## prd への link 切替手順 (限定的シーンのみ)

prd 接続が必要になるのは以下のような限定的シーンに限る。

- 初回 prd スキーマ適用 (GitHub Actions が動かない / 緊急時)
- prd の DB 状態確認 (`supabase migration list`)
- prd の型生成 (通常は dev で生成可)

### dev → prd に切り替え

```bash
supabase link --project-ref {PRD_REF}
supabase migration list  # 何が適用済みかを必ず確認
```

### prd での作業終了後、必ず dev に戻す

```bash
supabase link --project-ref {DEV_REF}
supabase status --linked  # dev に戻ったことを確認
```

## ⚠️ 禁止事項

- `supabase db push` / `supabase db reset` の **ローカル実行は原則禁止** — CI (`migrate-dev.yml` / `migrate-prd.yml`) 経由で実行する。ローカルから直接叩くと DB password の取り扱いリスクが発生する
- `supabase start` (ローカル Docker Supabase 起動) は **使わない** (REQ-403)
- secret key (`sb_secret_*`) を `.env.*` に書かない ([feedback_strict_secret_policy](../../README.md) 参照)
- DB password (`SUPABASE_DB_PASSWORD`) を `.env.*` / shell history に書かない — `migrate-*.yml` の Environment Secret 経由のみで使う

## 認知負荷対策

- 同一 CLI で dev/prd を扱うため「prd link 状態のまま破壊操作」リスクがある
- 技術的防御は REQ-009 のガードスクリプトで実装する (Phase 1 後半)
- 手順としては「prd 作業後は **必ず dev に戻す**」を徹底
