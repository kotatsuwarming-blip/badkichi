# TASK-0001 検証記録 (direct-verify)

## 検証概要

- **タスクID**: TASK-0001
- **検証内容**: 依存パッケージ・nuxt.config 設定の動作確認 (`pnpm typecheck` / `pnpm dev`)
- **実行日時**: 2026-06-01
- **実行者**: Claude (tsumiki:direct-verify 相当 / kairo-loop 再開)
- **前提**: `setup-report.md` の setup 作業 + ユーザ手動 `pnpm add @nuxtjs/i18n@10.4.0 @sentry/nuxt@10.55.0`

## 検証結果

| 項目 | 結果 |
|---|---|
| `pnpm typecheck` | ✅ pass (TS エラー 0) |
| `pnpm dev` 起動 | ✅ Nuxt 4.4.2 / Nitro 2.13.1 / Vite 7.3.1 で ready、`http://localhost:3000/` 応答 200 |
| i18n ロケール解決 | ✅ `i18n/locales/{ja,en}.json` を解決 (起動ログに locale 未検出警告なし) |
| @sentry/nuxt モジュール読込 | ✅ エラー・警告なし |

完了条件 (TASK-0001.md) はすべて充足。ただし setup 段階の実装に **2 件の設計齟齬**があり、verify 段階で是正した (下記)。

---

## 是正した設計齟齬

### 齟齬 1: i18n ロケールの配置先 (`app/locales/` → `i18n/locales/`)

- **事象**: setup 時に `app/locales/{ja,en}.json` へスタブを作成したが、`langDir: 'locales/'` 設定下では i18n がこのパスを参照しない。
- **根本原因**: 設計 (error-handling.md §7.2) は `langDir: 'locales/'` のみ規定し配置基準を明記していなかった。**@nuxtjs/i18n v9 の restructure 変更**により、v10 は `restructureDir` (既定 `'i18n'`) を導入し `langDir` を `<rootDir>/i18n/` 基準で解決する (`dist/module.mjs`: `langDir = resolve(rootDir/i18n, langDir ?? 'locales')`、`i18nDir = resolve(rootDir, restructureDir ?? 'i18n')`)。すなわち `langDir: 'locales/'` の実体は `<rootDir>/i18n/locales/`。setup 時に旧バージョンの慣習 (`<srcDir>/locales`) を前提に `app/locales/` へ置いたのが原因。
- **是正**: `app/locales/*.json` → `i18n/locales/*.json` へ移動。`nuxt.config` の `langDir: 'locales/'` は v10 では正しいため据え置き。
- **再発防止**: error-handling.md §7.2 に v10 の langDir 解決基準を注記済 (本表記の `locales/...` は `i18n/locales/...` を指すと明記)。ロケール本体定義は TASK-0004 で `i18n/locales/` に対して行う。

### 齟齬 2: Sentry runtime 設定の置き場所 (nuxt.config `sentry` キー → `sentry.client.config.ts`)

- **事象**: setup 時に `nuxt.config` の `sentry` キーへ `dsn` / `environment` / `*SampleRate` を記述したが、`pnpm typecheck` が `TS2353: 'dsn' does not exist in type 'Partial<SentryNuxtModuleOptions>'` と `TS2591: Cannot find name 'process'` で失敗した。
- **根本原因**: 設計 (error-handling.md §8.2) は旧 `@sentry/nuxt` API を前提にしていた。**v10 では nuxt.config の `sentry` キーは build-time 専用** (`SentryNuxtModuleOptions` = source maps 等) で、`dsn` / `environment` / sampleRate は **runtime init オプション**に分離された。これらはプロジェクトルートの `sentry.client.config.ts` (module が `defineNuxtPlugin` でラップし `useRuntimeConfig()` を呼べる: `dist/esm/module.js` のクライアント設定ラップ) に置く必要がある。`process` 未解決は nuxt.config の typecheck コンテキストに node 型が無いため (これも runtime 設定を config から追い出すことで解消)。
- **是正**:
  - `nuxt.config` から `sentry` runtime キーを削除。代わりに `runtimeConfig.public.sentry.dsn` (← `NUXT_PUBLIC_SENTRY_DSN`) / `runtimeConfig.public.env` (← `NUXT_PUBLIC_ENV`) を宣言。
  - `sentry.client.config.ts` を新規作成し、`useRuntimeConfig()` 経由で dsn / environment を注入、sampleRate=0 を設定。
  - server config (`sentry.server.config.ts`) は本 unit が CSR 中心で独自 Nitro ルートを持たないため未配置。将来 server ルート追加時に `process.env` から init する方針。
- **再発防止**: error-handling.md §8.2 を v10 構成 (nuxt.config + sentry.client.config.ts の 2 段構え) に更新済。

---

## 最終成果物

- `nuxt.config.ts` — modules に i18n/sentry、i18n 設定、`runtimeConfig.public.sentry.dsn`/`env`、supabase redirect/exclude、prerender 削除
- `sentry.client.config.ts` (新規・ルート) — `Sentry.init` runtime 設定
- `i18n/locales/ja.json` / `i18n/locales/en.json` — スタブ (本体は TASK-0004)
- `.env.example` — `NUXT_PUBLIC_SENTRY_DSN=` / `NUXT_PUBLIC_ENV=development`

## 結論

TASK-0001 完了。typecheck / dev 起動の双方が green。設計齟齬 2 件は根本原因を特定のうえ是正し、設計文書 (error-handling.md §7.2 / §8.2) へ反映済。
