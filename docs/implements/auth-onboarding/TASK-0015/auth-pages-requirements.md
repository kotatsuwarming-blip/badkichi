# TASK-0015 TDD要件定義書: /login + /confirm pages

**機能名**: 認証前ページ (auth-pages: `/login` + `/confirm`)
**タスクID**: TASK-0015
**要件名**: auth-onboarding
**作成日**: 2026-06-01

---

## 信頼性レベル凡例

- 🔵 **青信号**: EARS要件定義書・設計文書を参照し、ほぼ推測していない
- 🟡 **黄信号**: EARS要件定義書・設計文書からの妥当な推測
- 🔴 **赤信号**: 元資料にない推測

---

## 1. 機能の概要

- **何をする機能か** 🔵
  認証フロー前後の 2 ページを実装する。
  - `/login`: Google OAuth ログインボタンを表示し、押下で `useLogin().login(redirect)` を呼び OAuth フローを開始する (REQ-001)。
  - `/confirm`: OAuth コールバック着地ページ。Supabase Auth のセッション確立を待機し (`<USkeleton>` 表示)、確立後 `navigateTo(route.query.redirect ?? '/')` で遷移する (REQ-002 / REQ-104 / REQ-203)。Auth エラー時は `<UAlert>` でエラー通知 + 「ログイン画面に戻る」ボタンを提示する (EDGE-002)。
  - 既存の `/confirm` 最小スタブ (data-foundation TASK-0016) を本実装に置換する (差分 commit)。

- **どのような問題を解決するか** 🔵
  チーム利用の前提となる「認証されたユーザだけがアプリを使える」状態を成立させる。未認証ユーザに OAuth 起点 (`/login`) を、OAuth 復帰の着地点 (`/confirm`) を提供し、redirect クエリ運搬チェーン (EDGE-001) を完成させる。

- **想定されるユーザー** 🔵
  バドミントンチームのメンバー (未ログイン → ログイン遷移中のユーザ)。

- **システム内での位置づけ** 🔵
  Phase 3 (UI層)。`page → composable → Supabase` のレイヤード構成における page 層。page から `supabase.auth` / `supabase.from` / `supabase.rpc` を直接叩かず、必ず `useLogin` / `useCurrentGroup` 経由 (REQ-406)。レイアウトは `auth`(ADR-011 D1)。`/login` `/confirm` はいずれも public path で、最終的な遷移振り分けは `auth.global.ts` middleware に委譲する。

- **参照したEARS要件**: REQ-001, REQ-002, REQ-104, REQ-203, REQ-406
- **参照した設計文書**: dataflow.md §2 (ログイン + OAuth コールバック)、architecture.md §レイアウト戦略 / §画面構成、ADR-011 D1 (layout 指定)

---

## 2. 入力・出力の仕様

### 2.1 `/login` ページ

- **入力** 🔵
  - URL クエリ `redirect?: string` — 保護ページへ未認証アクセスした際に middleware が付与する遷移元 (`/login?redirect=/join/[code]` 等、EDGE-001)。`route.query.redirect` で読む。
  - ユーザ操作: Google ログインボタンの押下。
- **出力 / 副作用** 🔵
  - ボタン押下 → `useLogin().login(route.query.redirect)` を呼ぶ。`useLogin` 内で `redirectTo: /confirm?redirect=${encodeURIComponent(redirect ?? '/')}` を組み立て `signInWithOAuth({ provider: 'google', options: { redirectTo } })` を実行する (REQ-001 / dataflow.md §2)。
  - 送信中は `useLogin().pending` でボタンを `disabled` / `loading` にし二重送信を防止する (EDGE-003 相当)。
  - 表示文言は locales 経由 (`login.google` 等、NFR-204)。
  - redirect を引数で渡すか `useLogin` 内部で `useRoute()` を読むかは interfaces.ts `UseLoginReturn` の注記に従い実装判断 (どちらでも redirect 運搬は成立する) 🟡。
- **page meta** 🔵: `definePageMeta({ layout: 'auth' })`。

### 2.2 `/confirm` ページ

- **入力** 🔵
  - セッション状態: `useSupabaseUser()` (OAuth 復帰で JWT cookie が確立されると値が入る)。
  - URL クエリ `redirect?: string` — `/confirm?redirect=...`。`route.query.redirect` で読む。
  - エラー状態: `useLogin().notice`(`useNoticeErrors` チャネル)。
- **出力 / 副作用** 🔵
  - セッション確立中: `<USkeleton>` を表示 (REQ-203 / NFR-202)。
  - セッション確立後: `navigateTo(route.query.redirect ?? '/')`(REQ-104)。遷移先で middleware §1 が Group 有無に応じ `/onboarding` or 目的地へ二次振り分け。
  - Auth エラー時: `<UAlert>` で `useLogin().notice` を表示し、「ログイン画面に戻る」ボタン (`navigateTo('/login')`) を提示 (EDGE-002)。文言は locales 経由 (`confirm.processing` / `common.backToHome` 等、NFR-204)。
- **page meta** 🔵: `definePageMeta({ layout: 'auth' })`。
- **置換対象スタブ** 🔵:
  - Before: `watch(user, (u) => { if (u) navigateTo('/') }, { immediate: true })` のみ。
  - After: `<USkeleton>` 確立待ち + `route.query.redirect` 遷移 + エラー表示。

### 2.3 入出力の関係性 / データフロー 🔵

```
/login (ボタン押下)
  → useLogin.login(redirect)
  → signInWithOAuth(redirectTo=/confirm?redirect=...)
  → Google 認可
  → /confirm?redirect=... 着地 (JWT cookie 確立)
  → <USkeleton> 確立待ち
  → navigateTo(route.query.redirect ?? '/')
  → middleware §1 で Group 有無により /onboarding or 目的地
```

- **参照したEARS要件**: REQ-001, REQ-002, REQ-104, REQ-203, REQ-406, NFR-202, NFR-204, EDGE-002, EDGE-003
- **参照した設計文書**: dataflow.md §2、interfaces.ts `UseLoginReturn` (`{ login(redirect?), logout(), pending, notice }`) / `UseCurrentGroupReturn`、note.md §3 (依存 composable 仕様)、i18n/locales/ja.json (`login.*` / `confirm.*` / `common.backToHome`)

---

## 3. 制約条件

- **アーキテクチャ制約** 🔵
  - page から `supabase.auth` / `supabase.from` / `supabase.rpc` を直接呼ばない。必ず `useLogin` / `useCurrentGroup` 経由 (REQ-406 / ADR-005 D1)。
  - 状態管理は useAsyncData / useState のみ (Pinia 不採用)。
  - ファイルベースルーティング: `app/pages/login.vue` / `app/pages/confirm.vue`。

- **レイアウト制約** 🔵
  - `/login` `/confirm` ともに `definePageMeta({ layout: 'auth' })`。auth.vue は中央寄せ・ロゴのみ・ヘッダーなし (ADR-011 D1)。
  - ログアウトは default.vue 集約のため、本ページにはログアウト UI を持たない。

- **public path / middleware 制約** 🔵
  - `/login` `/confirm` は `auth.global.ts` の `PUBLIC_PATHS` に含まれ middleware の認証ガード対象外。
  - `/login` で Group 所属済ユーザは middleware の public path 側ロジックが `/` へ振り分けるため、page 側で所属判定は不要。
  - `/confirm` は遷移判断を page 内で行い、最終振り分けは遷移先で middleware §1 に委譲する。

- **i18n 制約** 🔵: UI 文言・エラー文言は `locales/ja.json` キーから取得。コードに文字列リテラルを直書きしない (NFR-204)。

- **エラーハンドリング制約** 🔵: Auth エラーは `useNoticeErrors`(`useLogin.notice`) チャネルで取得し `<UAlert>` 表示。文言変換は `useErrorMessage` 経由 (error-handling.md §5 / §6.4)。

- **テスト制約** 🔵: UI 全体の見た目テストは書かない (NFR-301)。page 固有ロジックは依存層 (useLogin / useCurrentGroup / middleware) で検証済のため、本タスクで page 単体テストは原則新規作成しない。

- **セキュリティ制約** 🔵: Supabase publishable key のみ使用 (service_role 不使用)。secret は `.env.*` に書かず env / CI Secrets で注入。

- **パフォーマンス / UX 制約** 🟡: 処理中状態は `<USkeleton>` / spinner で共通化し進行中を明示 (NFR-202)。

- **参照したEARS要件**: REQ-406, NFR-202, NFR-204, NFR-301
- **参照した設計文書**: architecture.md §レイアウト戦略 / §画面構成、ADR-005 / ADR-007 / ADR-011、error-handling.md §3 / §5 / §6.4、note.md §2 (開発ルール) / §7 (注意事項)

---

## 4. 想定される使用例

### 4.1 基本的な使用パターン 🔵

- **UC-1 (REQ-001)**: 未ログインユーザが `/login` を開き「Google でログイン」を押下 → OAuth 開始。
- **UC-2 (REQ-002 / REQ-104)**: OAuth 承認後 `/confirm` に着地 → セッション確立待ち (`<USkeleton>`) → `redirect` クエリ無し → `navigateTo('/')`。
- **UC-3 (REQ-104 / EDGE-001)**: `redirect` クエリ有り (`/confirm?redirect=/join/abc12345`) → セッション確立後 `navigateTo('/join/abc12345')`。

### 4.2 データフロー 🔵

dataflow.md §2 のシーケンス (ユーザ → /login → Supabase Auth → Google → /confirm → middleware) に準拠。redirect チェーン: `/join/[code]?...` → `/login?redirect=...` → OAuth → `/confirm?redirect=...` → 元 page (EDGE-001)。

### 4.3 エッジ・エラーケース

- **EDGE-001 (redirect チェーン)** 🔵: 招待リンク `/join/[code]` を未ログインでクリック → `/login?redirect=/join/[code]` → OAuth → `/confirm?redirect=/join/[code]` → `/join/[code]` 復帰。`/confirm` は `route.query.redirect` を読んで遷移する。
- **EDGE-002 (Auth エラー)** 🟡: OAuth コールバック中のネットワークエラー等 → `useLogin.notice` を `<UAlert>` で表示 + 「ログイン画面に戻る」ボタン (`/login`)。
- **EDGE-003 (二重送信防止)** 🟡: `/login` ボタンを `useLogin.pending` で disabled にし連打を防止。`/confirm` はボタンが無くセッション確立を待つのみのため pending 不要。
- **Group 所属済ユーザの `/login` アクセス** 🔵: middleware public path 側ロジックが `/` へ振り分け。page 側追加判定不要。

- **参照したEARS要件**: REQ-001, REQ-002, REQ-104, EDGE-001, EDGE-002, EDGE-003
- **参照した設計文書**: dataflow.md §2、note.md §7 (redirect チェーン / Auth エラー / 二重送信)

---

## 5. テスト対象範囲 (NFR-301 適用)

### 5.1 本タスクでテストする (新規) もの

🔵 原則として **page 単体テストは新規作成しない**。
理由: `/login` `/confirm` の振る舞いを構成する要素 (`useLogin.login` の `signInWithOAuth` 呼び出しと redirect 運搬 / `navigateTo` / `route.query` / セッション確立後の Group 有無分岐) は、すべて依存層で検証済。

- `useLogin.login` の `signInWithOAuth` 呼び出し・redirect 運搬 → **TASK-0008 useLogin テストで検証済**。
- セッション確立後の遷移分岐 (Group 有無 → `/onboarding` or 目的地) → **TASK-0013 auth.global.ts middleware テストで検証済**。
- redirect クエリの境界 (あり / なし) → middleware / useLogin 側で担保済。

→ tdd-red で不足が判明した場合のみ依存層に最小テストを追加する (基本は TASK-0008/0009/0013 で充足)。

### 5.2 本タスクでテストしないもの 🔵

- `/login.vue` / `/confirm.vue` の **UI 見た目テスト** (DOM レンダリング・要素存在確認・スタイル) は書かない (NFR-301: UI 全体の見た目テストは書かない)。
- ボタンクリック → composable 呼び出しの「結線」自体の単体テストも、依存層検証済かつ見た目領域のため新規作成しない。

### 5.3 委譲先 🔵

- ログイン後の画面遷移の通し検証 (OAuth フロー全体・redirect チェーンの E2E) → **TASK-0020 (E2E / Playwright, NFR-302)** に委譲。本タスク単位の統合テストは該当なし。

---

## 6. EARS要件・設計文書との対応関係

- **参照したユーザストーリー**: 「チームメンバーが Google アカウントでログインし、アプリを利用開始する」(PRD §3 / dataflow.md §2)
- **参照した機能要件**: REQ-001 (ログインボタン + OAuth), REQ-002 (`/confirm` コールバック + セッション待機), REQ-104 (redirect クエリ遷移), REQ-203 (ローディング UI)
- **参照した非機能要件**: NFR-202 (処理中 `<USkeleton>` 共通化), NFR-204 (文言 locales 化), NFR-301 (UI 見た目テスト除外), NFR-302 (E2E 委譲)
- **参照した制約要件**: REQ-406 (page から Supabase 直接呼び禁止)
- **参照したEdgeケース**: EDGE-001 (redirect チェーン), EDGE-002 (Auth エラー + 戻るボタン), EDGE-003 (二重送信防止)
- **参照した受け入れ基準** (TASK-0015 完了条件):
  - `/login` Google ボタン押下で `useLogin().login(redirect)` 呼び出し (REQ-001)
  - `/login` / `/confirm` に `definePageMeta({ layout: 'auth' })`(ADR-011 D1)
  - `/confirm` スタブを本実装に置換 (差分 commit)
  - `/confirm` 確立中 `<USkeleton>`(REQ-203 / NFR-202)
  - `/confirm` 確立後 `navigateTo(route.query.redirect ?? '/')`(REQ-104)
  - `/confirm` Auth エラー時 `<UAlert>` + 「ログイン画面に戻る」(EDGE-002)
  - 文言は locales 経由 (NFR-204)
- **参照した設計文書**:
  - **アーキテクチャ**: architecture.md §レイアウト戦略 / §画面構成、ADR-005 / ADR-007 / ADR-011
  - **データフロー**: dataflow.md §2 (ログイン + OAuth コールバック)
  - **型定義**: interfaces.ts `UseLoginReturn`(`{ login(redirect?), logout(), pending, notice }`) / `UseCurrentGroupReturn`
  - **エラーハンドリング**: error-handling.md §3 / §5 / §6.4
  - **コンテキストノート**: docs/implements/auth-onboarding/TASK-0015/note.md
  - **既存実装**: app/composables/useLogin.ts / app/composables/useCurrentGroup.ts / app/composables/useNoticeErrors.ts / app/layouts/auth.vue / app/middleware/auth.global.ts / i18n/locales/ja.json

---

## 7. 品質判定

| 観点 | 判定 |
|---|---|
| 要件の曖昧さ | なし (redirect の引数 vs `useRoute()` 実装判断のみ interfaces.ts 注記で許容) |
| 入出力定義 | 完全 (`/login` `/confirm` の入力・副作用・page meta を明記) |
| 制約条件 | 明確 (アーキテクチャ / レイアウト / public path / i18n / テスト) |
| 実装可能性 | 確実 (依存 composable・layout・middleware すべて実装済) |
| 信頼性レベル | 🔵 多数 (機能要件・制約はほぼ 🔵、EDGE-002 / EDGE-003 / NFR-202 のみ 🟡) |

**総合品質評価**: ✅ 高品質
