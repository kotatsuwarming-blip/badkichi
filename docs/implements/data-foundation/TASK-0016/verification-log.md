# TASK-0016 手動スモークテスト 検証ログ

OAuth ログインフローが dev 環境で成立することを手動で確認した記録。
（自動検証結果は同ディレクトリの `verify-report.md` を参照）

## 実施環境

- **実施日時**: 2026-05-30
- **使用ブラウザ**: ユーザー環境（Mac）
- **対象環境**: dev（Supabase dev プロジェクト `fjfuurlxgijuqpoebtbg`）
- **dev サーバ**: http://localhost:3000

## 手順と結果

| # | ステップ | 期待結果 | 結果 | 備考 |
|---|---------|---------|:---:|------|
| 1 | `pnpm dev` 起動 | エラーなく起動、`/login` 表示 | ✅ | 後述の事前ブロッカー解消後に成立 |
| 2 | 「Google でログイン」ボタン押下 | Google 認可画面へ遷移 | ✅ | |
| 3 | Google アカウントで認可 | callback → `/confirm` にリダイレクト | ✅ | |
| 4 | `/confirm` 着地 | `Signing in...` 表示 | ✅ | |
| 5 | ホーム自動遷移 | `/confirm` から `/` へ自動遷移 | ✅ | `watch(user)` の `navigateTo('/')` が発火 |
| 6 | user 確定確認 | `useSupabaseUser()` が値を持つ | ✅ | JWT クレーム取得（下記） |
| 7 | Supabase Dashboard | dev の Users に自分のレコード | ✅ | signup 一時 ON で新規作成 |

凡例: ✅ 成功 / ❌ 失敗 / ⬜ 未実施

## 確認した user 情報（`useSupabaseUser()` 戻り値 = JWT クレーム）

- **uid（`sub`）末尾**: `...c495`（プライバシー配慮で末尾のみ記録）
- **email**: 取得確認済み（Google アカウント）
- **provider**: `google`（`app_metadata.provider`）
- **session_id**: 取得確認済み
- **is_anonymous**: false

> ⚠️ **重要（auth-onboarding 引き継ぎ）**: `@nuxtjs/supabase` v2 の `useSupabaseUser()` は **JWT クレーム**を返す。ユーザー ID は `user.id` ではなく **`user.sub`** に入る。本実装で uid を参照する際は `sub` を使うこと。現スタブ（`confirm.vue`）は truthy 判定のみのため影響なし。

## 総合判定

- ✅ **経路成立を確認（全ステップ成功）**。REQ-002（Google OAuth 有効化の動作確認）を dev で実証。

## 発生した事象と対応（トラブルシュート記録）

### 事象1: 全ルートで 500 / SSR が空（`Cannot read properties of null (reading 'ce')`）

- **原因**: Vue の二重インストール（Nuxt コア `3.5.30` / `@nuxt/ui`+`reka-ui` `3.5.32`）。レンダラと Nuxt UI で Vue インスタンスが異なり、`<ConfigProvider>` 配下の SSR が破綻 → `#__nuxt` 空 → クライアントでハイドレーションクラッシュ。
- **切り分け**: `confirm.vue`/`login.vue` は typecheck/lint/構文 pass、全ルートで同症状、`.nuxt` 削除でも再現 → 依存問題と特定。
- **対応**: `package.json` に `pnpm.overrides` を追加し `@vue/*` 系全体を `3.5.32` に固定 → `pnpm install`。結果、警告 0・`/login` が `data-ssr="true"` でフル SSR・typecheck/lint pass。
- **位置づけ**: TASK-0016 とは独立の既存プロジェクト依存問題。`confirm.vue` のコード起因ではないため step-a への戻りは行わず環境修正で対応。

### 事象2: OAuth が `signup_disabled` で拒否

- **現象**: callback URL に `error=access_denied&error_code=signup_disabled&error_description=Signups+not+allowed+for+this+instance`。
- **原因**: ログインした Google アカウントが dev に未登録、かつ signup OFF（ADR-009 のポリシー通り）。
- **副次的収穫**: OAuth 往復（認可→callback→エラー受領）が正常に機能していること、および signup OFF が想定通り効いていることを確認。
- **対応**: スモークテスト完走のため Supabase dev で signup を一時 ON → ユーザー作成 → テスト成立 → **テスト後に signup を OFF に戻す**（ADR-009 維持）。

## 備考

- 確認用に一時追加した `app/pages/login.vue` とデバッグ計装（`confirm.vue` / `index.vue`）は、本検証完了後に削除し最小スタブへ戻した。
- SSR 関連の懸念（`useSupabaseUser` の SSR 挙動）は本件では問題なし。`/confirm` はコールバック仕様上クライアント描画（`data-ssr="false"`）で正常。
