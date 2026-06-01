# TDD Red フェーズ記録: auth-pages (TASK-0015)

**機能名**: 認証前ページ (auth-pages: `/login` + `/confirm`)
**タスクID**: TASK-0015
**要件名**: auth-onboarding
**実施日**: 2026-06-01

---

## 結論

**新規失敗テストは作成しない。** 🔵

---

## チェックリスト照合結果

testcases §5「テスト不要の最終確認チェックリスト」と実コードを突き合わせた結果、全項目クリア。

| # | チェック項目 | 結果 | 根拠 |
|---|---|---|---|
| 1 | `confirm.vue` 本実装が新規ドメインロジックを持ち込まないか | ✅ | `watch(user)` + `route.query.redirect ?? '/'` + `useLogin.notice` 参照のみ。バリデーション・状態計算・独自条件分岐なし |
| 2 | `login.vue` が `useLogin().login()` 呼び出し以外の副作用を持たないか | ✅ | `definePageMeta({ layout: 'auth' })` + template バインドのみ。pending disabled は NFR-301 除外の見た目結線 |
| 3 | redirect 解決が `route.query.redirect ?? '/'` の単純結線にとどまるか | ✅ | nullish 合体のみ。追加の正規化・検証なし |
| 4 | EDGE-002 のエラー表示が `useLogin.notice` の `<UAlert>` バインドにとどまるか | ✅ | page 独自エラー判定なし。`useNoticeErrors` チャネル委譲 |
| 5 | 依存層テスト（useLogin TC1〜TC3 / middleware TC1〜TC7）が緑か | ✅ | `pnpm test --run` で 18 files 61 tests passed 確認済 |

---

## 新規テストが不要な理由

### page の振る舞いと依存層カバレッジの対応

| page が担う振る舞い | テスト責務の所在 | 確認した実テスト |
|---|---|---|
| Google ログインボタン押下 → `useLogin().login(redirect)` 呼び出し | TASK-0008 | `useLogin.test.ts` TC1（signInWithOAuth・redirectTo 検証） |
| redirect 運搬（`/confirm?redirect=` 組み立て） | TASK-0008 | `useLogin.test.ts` TC1（toContain 検証） |
| Auth エラー → `notice` セット・リダイレクトなし (EDGE-002) | TASK-0008 | `useLogin.test.ts` TC3 |
| セッション確立後の Group 有無による二次振り分け | TASK-0013 | `auth.test.ts` TC1〜TC7（7 分岐網羅） |
| 所属済ユーザの `/login` アクセス → `/` へ振り分け | TASK-0013 | `auth.test.ts` TC5 |
| `<USkeleton>` ローディング表示（REQ-203） | NFR-301 除外 | 見た目テストは書かない |
| `<UAlert>` + 「ログイン画面に戻る」表示（EDGE-002） | NFR-301 除外 | 見た目テストは書かない |
| redirect チェーン全体通し（EDGE-001） | TASK-0020 委譲 | Playwright E2E（NFR-302） |

### NFR-301 の適用

要件定義 §5.2 に「UI 全体の見た目テストは書かない」「ボタンクリック → composable 呼び出しの結線の単体テストも、依存層検証済かつ見た目領域のため新規作成しない」と明示されている。

### `route.query.redirect ?? '/'` の自明性

nullish 合体演算子による単純デフォルトは分岐ロジックとしての複雑さを持たない。「境界値 + 分岐カバレッジのみ」の粒度基準に照らして追加テストの価値がない。redirect チェーン全体の通し検証は TASK-0020（E2E）が担う。

---

## Green フェーズで実装すべき内容

新規テストの作成は不要だが、以下の実装完了と既存テスト緑維持で TASK-0015 完了とする。

1. `app/pages/login.vue` の新規作成
   - `definePageMeta({ layout: 'auth' })`
   - Google ログインボタン（`useLogin().login(route.query.redirect)`）
   - pending 中はボタン disabled / loading
   - Auth エラー (`useLogin().notice`) を `<UAlert>` で表示
   - 文言は `locales/ja.json` 経由

2. `app/pages/confirm.vue` のスタブ置換（差分 commit）
   - Before: `watch(user, (u) => { if (u) navigateTo('/') }, { immediate: true })`
   - After: `<USkeleton>` 確立待ち + `navigateTo(route.query.redirect ?? '/')` + `useLogin.notice` の `<UAlert>` + 「ログイン画面に戻る」ボタン
   - `definePageMeta({ layout: 'auth' })` 追加

3. 完了確認（verify-complete 代替）
   - `pnpm typecheck` — 型エラーなし
   - `pnpm lint` — ESLint エラーなし
   - `pnpm test --run` — 既存 61 tests 緑維持

---

## 品質評価

| 観点 | 判定 |
|---|---|
| 新規テスト不要の根拠 | 実テストファイル（TC 番号レベル）で突き合わせ済 ✅ |
| 依存層テスト緑確認 | `pnpm test --run` 61 passed 確認済 ✅ |
| チェックリスト | 全 5 項目クリア ✅ |
| 信頼性レベル | 🔵 が全量（要件定義 §5 明示 + 実テスト実物突き合わせ） |

**総合**: ✅ 高品質（新規テスト不要の判定を、実テスト突き合わせで根拠づけ済）
