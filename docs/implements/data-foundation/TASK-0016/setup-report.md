# TASK-0016 direct-setup レポート

**TaskID**: TASK-0016
**タイプ**: DIRECT
**フェーズ**: direct-setup
**実施日**: 2026-05-30

---

## 作業概要

data-foundation 単位の検証目的で、Google OAuth callback のランディング先となる最小スタブ
`app/pages/confirm.vue` を作成した。本ページは認証成立を待ってホーム (`/`) へリダイレクトするだけの
責務を持ち、本格的なオンボーディング画面・エラーハンドリング・初回 Group 参加導線は auth-onboarding
単位で本実装に置換される（その旨をファイル冒頭コメントに明記）。

本フェーズ（direct-setup）ではファイル作成までを行い、`pnpm dev` 起動による手動スモークテスト・
typecheck / lint は後続の direct-verify フェーズで実施する。

---

## 参照文書

- `docs/tasks/data-foundation/TASK-0016.md`（実装詳細 1 のコードをそのまま採用）
- `nuxt.config.ts`（`supabase.redirectOptions.callback: '/confirm'` を確認。本スタブの配置先パスが
  callback 設定と一致していることを検証）
- `app/pages/index.vue`（既存ページのインデント規約 = 2 スペースを確認し合わせた）

---

## 実行した作業

1. `app/pages/confirm.vue` の既存有無を確認 → 未存在を確認。
2. `nuxt.config.ts` の Supabase `redirectOptions.callback` が `/confirm` であることを確認し、
   配置先パスの妥当性を検証。
3. `app/pages/index.vue` を参照し、インデント規約（2 スペース）を確認。
4. TASK-0016 実装詳細 1 のコードどおりに `app/pages/confirm.vue` を新規作成。
   - 冒頭コメントに「auth-onboarding 単位で本実装に置換」「最小スタブ」「責務はリダイレクトのみ」を明記。
   - `useSupabaseUser()` を購読し、user 確定時に `navigateTo('/')`。
   - `{ immediate: true }` でログイン済み状態の直接アクセスにも対応。
   - テンプレートは `Signing in...` のみの最小表示。
5. ESLint 規約（1tbs brace style / no comma dangle）に準拠していることを目視確認。
   `watch` のオプション `{ immediate: true }` 末尾にカンマなし。

---

## 作成ファイル一覧

- `app/pages/confirm.vue`（新規作成）
- `docs/implements/data-foundation/TASK-0016/setup-report.md`（本レポート、新規作成）

---

## 遭遇した問題

なし。`app/pages/confirm.vue` は未存在で衝突なし。`nuxt.config.ts` の callback 設定とパスが
一致しており、追加の設定変更は不要だった。

---

## 次のステップ（direct-verify）

1. `.env.development` に dev プロジェクトの `NUXT_PUBLIC_SUPABASE_URL` /
   `NUXT_PUBLIC_SUPABASE_KEY` が設定済みであることを確認。
2. `pnpm typecheck` / `pnpm lint` をクリーン確認。
3. `pnpm dev` 起動 → 一時ログインボタン or OAuth URL 経由で Google ログインを実行
   （一時ボタンを追加する場合はコミット前に削除）。
4. `/confirm` 着地 → `/` 自動遷移 → `useSupabaseUser()` の値持ちを確認。
5. Supabase Dashboard の Users 一覧に自分のレコードが追加されていることを確認。
6. 結果を `docs/implements/data-foundation/TASK-0016/verification-log.md` に記録。
