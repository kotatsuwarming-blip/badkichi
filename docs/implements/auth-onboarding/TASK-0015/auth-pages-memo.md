# auth-pages TDD開発完了記録 (TASK-0015)

## 確認すべきドキュメント

- `docs/tasks/auth-onboarding/TASK-0015.md`
- `docs/implements/auth-onboarding/TASK-0015/auth-pages-requirements.md`
- `docs/implements/auth-onboarding/TASK-0015/auth-pages-testcases.md`

## 🎯 最終結果 (2026-06-01)
- **実装率**: 100%（新規テストケース 0 件 / 予定 0 件 — NFR-301 により page 単体テストなし）
- **品質判定**: 合格
- **TODO更新**: ✅完了マーク追加
- **pnpm typecheck**: PASS（エラーなし）
- **pnpm test --run**: PASS（18 files / 61 tests 全 passed）
- **pnpm lint (スコープ内)**: PASS（app/pages/login.vue, app/pages/confirm.vue, app/utils/query.ts — エラーなし）
- **pnpm lint (全体)**: スコープ外エラー 1 件（`docs/design/video-playback/interfaces.ts:66` — 本タスクとは無関係の既存問題）

## 💡 重要な技術学習

### 実装パターン
- `route.query` の値は `string | string[] | null | undefined` になりうる。`Array.isArray` ガードを utils に抽出（`app/utils/query.ts`）して DRY を達成する
- `/confirm` は `watch(user, { immediate: true })` パターンで OAuth コールバック着地後のセッション確立を検知する
- エラー状態（`useLogin().notice`）と非エラー状態（`<USkeleton>`）の template 分岐は `v-if="notice"` / `v-else` でシンプルに表現できる

### テスト設計
- NFR-301 適用: page の振る舞いがすべて依存層（useLogin TC1〜TC3 / middleware TC1〜TC7）で検証済の場合、page 単体テストは作成しない
- 依存テスト確認チェックリスト（testcases §5）を prior phase で明示しておくと verify-complete が高速化する

### 品質保証
- page lint は `pnpm exec eslint app/` で docs/ を除外して確認すると既存問題と分離できる
- overkill な open-redirect・XSS 対策は不要。Supabase Auth の redirectTo ホワイトリストと middleware に委譲するのが正解

## スコープ外問題（記録のみ）

### 既存 lint エラー
- **ファイル**: `docs/design/video-playback/interfaces.ts:66`
- **内容**: `@stylistic/operator-linebreak` エラー（`=` の行頭配置）
- **発生時期**: TASK-0015 以前から存在する既存問題
- **対応**: 本タスクとは無関係。video-playback 設計フェーズで対応する

---
*概要*

- 機能名: 認証前ページ (auth-pages: `/login` + `/confirm`)
- 開発開始: 2026-06-01
- 現在のフェーズ: Verify Complete（完了）

## 関連ファイル

- 元タスクファイル: `docs/tasks/auth-onboarding/TASK-0015.md`
- 要件定義: `docs/implements/auth-onboarding/TASK-0015/auth-pages-requirements.md`
- テストケース定義: `docs/implements/auth-onboarding/TASK-0015/auth-pages-testcases.md`
- Red フェーズ記録: `docs/implements/auth-onboarding/TASK-0015/auth-pages-red-phase.md`
- 実装ファイル（予定）:
  - `app/pages/login.vue`（新規作成）
  - `app/pages/confirm.vue`（スタブ置換）

---

## Redフェーズ（失敗するテスト作成）

### 作成日時

2026-06-01

### テストケース

**新規失敗テストは作成しない。** 🔵

testcases §5「テスト不要の最終確認チェックリスト」全 5 項目クリア。

### テストコード

なし（作成不要と確認済）

### 期待される失敗

該当なし

### 新規テストが不要な根拠

- `/login` `/confirm` の振る舞いを構成するすべての要素が依存層で検証済:
  - `useLogin.test.ts` TC1〜TC3 — OAuth 開始・redirect 運搬・Auth エラー処理
  - `auth.test.ts` TC1〜TC7 — 全 7 分岐（未認証リダイレクト・未所属オンボーディング・所属済通過 等）
- `confirm.vue` 本実装に新規ドメインロジックなし（`route.query.redirect ?? '/'` は自明な nullish 合体）
- NFR-301 により UI 見た目テストおよび結線単体テストは対象外
- redirect チェーン全体の通し検証は TASK-0020 E2E（Playwright）に委譲
- `pnpm test --run` で 18 files 61 tests passed を確認済（依存層は緑）

### 次のフェーズへの要求事項

1. `app/pages/login.vue` を新規作成
   - `definePageMeta({ layout: 'auth' })` 付与
   - Google ログインボタン（`useLogin().login(route.query.redirect)`）
   - pending 中はボタン disabled / loading（EDGE-003）
   - Auth エラー (`useLogin().notice`) を `<UAlert>` で表示（EDGE-002）
   - 文言は `locales/ja.json` 経由（NFR-204）

2. `app/pages/confirm.vue` のスタブを本実装に置換（差分 commit）
   - `<USkeleton>` 確立待ち（REQ-203 / NFR-202）
   - `navigateTo(route.query.redirect ?? '/')` 確立後遷移（REQ-104）
   - `useLogin.notice` の `<UAlert>` + 「ログイン画面に戻る」ボタン（EDGE-002）
   - `definePageMeta({ layout: 'auth' })` 追加（ADR-011 D1）

3. 完了確認
   - `pnpm typecheck` — 型エラーなし
   - `pnpm lint` — ESLint エラーなし
   - `pnpm test --run` — 既存 61 tests 緑維持

---

## Greenフェーズ（最小実装）

### 実装日時

2026-06-01

### 実装方針

- Red フェーズの判定どおり新規テストなし。2 ファイルの実装のみで完了。
- `login.vue` 新規作成: `definePageMeta({ layout: 'auth' })` + `useLogin().login(redirect)` 呼び出し + pending disabled + notice UAlert
- `confirm.vue` スタブ置換: `watch(user)` + `navigateTo(route.query.redirect ?? '/')` + USkeleton + EDGE-002 UAlert
- Supabase 直叩き禁止 (REQ-406) を遵守。全文言は `t()` 経由 (NFR-204)
- `route.query.redirect` を `string | undefined` に正規化して渡す（配列ガード付き）

### 実装コード

- `app/pages/login.vue`（新規作成）
- `app/pages/confirm.vue`（スタブ置換）

詳細コードは `auth-pages-green-phase.md` 参照。

### テスト結果

```
pnpm typecheck  → エラーなし
pnpm test --run → 18 files / 61 tests — 全 passed
pnpm lint (新規ファイル対象) → エラーなし
```

既存 lint エラー (`docs/design/video-playback/interfaces.ts`) は本タスクとは無関係の既存問題。

### 課題・改善点

- `route.query.redirect` の配列ガード正規化ロジックが `login.vue` / `confirm.vue` に重複 → Refactor フェーズでヘルパ関数に抽出候補

---

## Refactorフェーズ（品質改善）

### リファクタ日時

2026-06-01

### 改善内容

- `route.query.redirect` 配列ガード正規化ロジックの重複を解消
  - `app/utils/query.ts` に `resolveQueryParam` ユーティリティ関数を新規作成
  - `login.vue` / `confirm.vue` の各 `Array.isArray` ガード記述を関数呼び出しに置換
  - `LocationQueryValue[]` = `(string | null)[]` を正しく扱うオーバーロードシグネチャ定義

### セキュリティレビュー

- open redirect: Supabase Auth の redirectTo URL ホワイトリストと middleware 判定で対策済み
- XSS: `navigateTo()` の第一引数としてのみ使用。DOM 直接挿入なし
- CSRF: OAuth フローは Supabase Auth が管理
- REQ-406 (Supabase 直叩き禁止): 遵守継続
- 重大な脆弱性なし ✅

### パフォーマンスレビュー

- `resolveQueryParam`: O(1) の純粋関数。パフォーマンス問題なし ✅
- watch / navigateTo: 変更なし ✅

### 最終コード

- `app/utils/query.ts` — 新規作成
- `app/pages/login.vue` — 更新 (resolveQueryParam 使用)
- `app/pages/confirm.vue` — 更新 (resolveQueryParam 使用)

詳細は `auth-pages-refactor-phase.md` 参照。

### 品質評価

```
pnpm typecheck  → エラーなし ✅
pnpm test --run → 18 files / 61 tests — 全 passed ✅
pnpm lint (変更ファイル対象) → エラーなし ✅
```

**総合**: ✅ 高品質
