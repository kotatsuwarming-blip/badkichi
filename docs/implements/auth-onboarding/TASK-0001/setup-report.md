> **⚠️ 後続の verify で 2 点是正済**: 本 setup の `sentry` 設定 (nuxt.config 直書き) と
> ロケール配置 (`app/locales/`) は @nuxtjs/i18n v10 / @sentry/nuxt v10 の API と齟齬があり、
> verify 段階で `sentry.client.config.ts` + `runtimeConfig` 化 / `i18n/locales/` 移動に是正した。
> 根本原因と最終構成は [`verify-report.md`](verify-report.md) を参照。

# TASK-0001 設定作業実行記録

## 作業概要

- **タスクID**: TASK-0001
- **作業内容**: 依存パッケージ追加と nuxt.config 設定変更
- **実行日時**: 2026-06-01
- **実行者**: Claude (tsumiki:direct-setup)

## 設計文書参照

- `docs/tasks/auth-onboarding/TASK-0001.md`
- `docs/design/cross-cutting/error-handling.md` (§7.2 i18n 設定 / §8.2 Sentry 設定 / §8.3 環境変数)
- `docs/decisions/` (ADR-008 D3, ADR-010 D5/D6)

## 実行した作業

### 1. パッケージ追加（要手動実行）

```bash
pnpm add @nuxtjs/i18n @sentry/nuxt
```

> ⚠️ Claude Code セッション内でパーミッションエラーが発生し、自動実行できませんでした。
> ターミナルで手動実行が必要です。

### 2. nuxt.config.ts 変更

**変更ファイル**: `nuxt.config.ts`

変更点:
- `modules` に `'@nuxtjs/i18n'` と `'@sentry/nuxt/module'` を追加
- `routeRules: { '/': { prerender: true } }` を削除 (ADR-010 D6)
- `supabase` に `redirect: false` を追加 (ADR-008 D3)
- `supabase.redirectOptions` に `exclude: []` を追加 (ADR-010 D5)
- `i18n` セクションを追加 (`locales: [ja/en]`, `strategy: 'no_prefix'`, `detectBrowserLanguage: false`, `langDir: 'locales/'`)
- `sentry` セクションを追加 (DSN / environment / sampleRate=0 すべて)

### 3. .env.example 追記

**変更ファイル**: `.env.example`

追記内容:
- `NUXT_PUBLIC_SENTRY_DSN=` (空値。値は Sentry Dashboard から取得)
- `NUXT_PUBLIC_ENV=development`

### 4. locales ディレクトリとスタブファイル作成

**作成ファイル**:
- `app/locales/ja.json` — 最小スタブ（実際のキーは TASK-0004 で定義）
- `app/locales/en.json` — 最小スタブ（実際のキーは TASK-0004 で定義）

## 作業結果

- [x] `nuxt.config.ts` 変更完了
  - [x] `routeRules` の `'/'` prerender 削除
  - [x] `supabase.redirect: false` 追加
  - [x] `supabase.redirectOptions.exclude: []` 追加
  - [x] `i18n` モジュール設定追加
  - [x] `sentry` モジュール設定追加
- [x] `.env.example` に Sentry 環境変数追記
- [x] `app/locales/ja.json` スタブ作成
- [x] `app/locales/en.json` スタブ作成
- [ ] `pnpm add @nuxtjs/i18n @sentry/nuxt` — **手動実行が必要**

## 遭遇した問題

### 問題: pnpm add の実行権限

- **発生状況**: `Bash(pnpm add *)` は `.claude/settings.json` の allow リストに含まれているが、実行時に Deny が選択された
- **解決方法**: ターミナルで手動実行 `pnpm add @nuxtjs/i18n @sentry/nuxt`

## 次のステップ

1. ターミナルで `pnpm add @nuxtjs/i18n @sentry/nuxt` を実行してパッケージをインストール
2. `/tsumiki:direct-verify` を実行して設定を検証 (`pnpm typecheck` / `pnpm dev` 起動確認)
