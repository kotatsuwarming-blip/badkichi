# TASK-0005 実装記録 (DIRECT: Sentry + error.vue)

## 作業概要

- **タスクID**: TASK-0005
- **作業内容**: `app/error.vue` グローバルフォールバック + Sentry 報告ポリシー確立
- **実行日時**: 2026-06-01
- **実行者**: Claude (kairo-loop)

## 実行した作業

### 1. app/error.vue 作成

- `defineProps<{ error: NuxtError }>()` で受け取り、`onMounted` で `Sentry.captureException(props.error)`。
- 報告ポリシー (NFR-304) をコメントで明記: 想定外例外のみ報告。想定エラー (INVITATION_* / NOT_A_MEMBER / ALREADY_IN_GROUP) は domain composable がチャネル表示済で error.vue には到達しない。unmapped 識別子報告は useErrorMessage (TASK-0007)。
- `clearError({ redirect: '/' })` による復帰動線 (「トップに戻る」ボタン)。
- 文言は locale 経由 (`t('errors.generic')` / `t('common.backToHome')`)、コード直書きなし (NFR-204)。Nuxt UI (UApp/UContainer/UCard/UButton/UIcon) で構成。
- Sentry runtime 設定 (dsn/environment/sampleRate) は TASK-0001 の `sentry.client.config.ts` で確立済を踏襲。dsn 空なら no-op。

### 2. locale キー追加

`common.backToHome` を ja/en に追加 (i18n parity は CLI が担保)。

## 検証 (direct-verify: dev 起動 + error.vue レンダリング)

`pnpm dev` 起動し、存在しないルート (`/__nope__`) に `Accept: text/html` でアクセスして error.vue の SSR レンダリングを確認。

| 項目 | 結果 |
|---|---|
| error.vue レンダリング | ✅ UCard + triangle-alert アイコン + ボタン表示 |
| `t('errors.generic')` | ✅ 「予期しないエラーが発生しました」表示 |
| `t('common.backToHome')` | ✅ 「トップに戻る」表示 |
| typecheck / test(28) / i18n:check | ✅ all green |

> Sentry 実送信は DSN 設定が前提のため未確認 (DSN 空で no-op)。実送信確認はデプロイ環境で DSN 設定後に手動で行う (TASK-0005.md / error-handling.md §8.4 の方針)。

## ⚠️ 重大バグの発見と修正 (TASK-0004 の回帰、本タスクの verify で発覚)

### 事象
error.vue の最初のレンダリングで `t('errors.generic')` が**生キー `errors.generic` のまま**出力された。プローブページで確認した結果、**通常ページでも全 i18n メッセージが未ロード** (locale=ja は正しいが messages 空) であることが判明。

### 根本原因
`i18n:debug` を有効化して dev ログを確認したところ:
```
ERROR [unplugin-vue-i18n] Invalid linked format (error code: 10) in i18n/locales/ja.json
WARN  [intlify] Not found 'errors.generic' key in 'ja' locale messages.
```
TASK-0004 で定義した `login.emailPlaceholder: "you@example.com"` の **`@` が vue-i18n の linked message 記法 (`@:key`) と誤認**され、`ja.json` **全体のメッセージコンパイルが失敗 → ja の全メッセージがロードされない**状態だった。`t()` は未ロード時にキー文字列をそのまま返すため、アプリ全体で文言が表示されない (実害大)。

なぜ TASK-0004 で見逃したか: `pnpm i18n:check` は JSON キー構造の一致のみ検証し、**vue-i18n のメッセージ書式コンパイルを検証していなかった**。typecheck/unit test も JSON parse は通るため検出できなかった。

### 是正
1. `i18n/locales/ja.json`: `"you@example.com"` → `"you{'@'}example.com"` (vue-i18n リテラル補間でエスケープ)。dev で `you@example.com` として正しく表示されることを確認。
2. **check 強化 (回帰防止)**: `scripts/i18n-keys.mjs` に `findMessageFormatIssues` を追加し、`{'...'}` リテラル外の未エスケープ `@` / `|` (linked / 複数形デリミタ) を検出。`pnpm i18n:check` に組込み、unit test 4本を追加 (生`@`検出 / エスケープ済許容 / `|`検出 / 通常文言)。生`@`注入で exit 1 になることを実証。

これにより、本クラスのバグ (ロケールファイル全体のコンパイル破壊) は今後 pre-commit / CI で検出される。

## 結論

TASK-0005 完了。error.vue がローカライズ文言で正しくレンダリングされることを実機確認。併せて TASK-0004 由来の i18n コンパイル破壊バグを根本修正し、i18n:check に書式検証を追加して再発防止。
