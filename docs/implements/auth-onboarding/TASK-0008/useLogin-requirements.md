# TASK-0008: useLogin（Auth）— TDD要件定義書

**機能名**: useLogin（Auth composable）
**タスクID**: TASK-0008
**要件名**: auth-onboarding
**フェーズ**: Phase 2 - ドメインロジック層
**作成日**: 2026-06-01
**実装ファイル**: `app/composables/useLogin.ts`
**テストファイル**: `tests/unit/composables/useLogin.test.ts`

---

## 信頼性レベル凡例

- 🔵 **青信号**: EARS要件定義書・設計文書を参考にしてほぼ推測していない
- 🟡 **黄信号**: EARS要件定義書・設計文書から妥当な推測
- 🔴 **赤信号**: EARS要件定義書・設計文書にない推測

---

## 1. 機能の概要（EARS要件定義書・設計文書ベース）

🔵 **何をする機能か**
Google OAuth による **ログイン** と **ログアウト** を内包する Write (Auth) 系 composable。page から `supabase.auth` を直接叩かせず、認証フローを 1 箇所に集約する。
（`docs/tasks/auth-onboarding/TASK-0008.md` タスク概要 / dataflow.md §2）

🔵 **どのような問題を解決するか**
- page が `supabase.auth.signInWithOAuth` / `signOut` を直叩きすると認証ロジックが分散し、保護漏れ・二重送信・エラー表示の不統一が起きる。これを composable 経由に強制して防ぐ（REQ-406 / ADR-007 D9）。
- OAuth コールバック後の最終遷移先を保持するため、目的地を `/confirm` の `redirect` クエリに運搬する（A2）。

🔵 **想定されるユーザー**
- 直接利用者: `login.vue`（TASK-0014）の「Google でログイン」ボタン、`default.vue`（TASK-0015）ヘッダーのログアウトボタン。
- エンドユーザー: チームでバドミントン分析アプリを使う認証済みメンバー。

🔵 **システム内での位置づけ**
- Phase 2 ドメインロジック層の Write (Auth) composable。
- 基盤に TASK-0007 の `useNoticeErrors` / `useErrorMessage` を持つ。
- 認証 UI（TASK-0014 / TASK-0015）と Supabase Auth の間の抽象境界。

- **参照したEARS要件**: REQ-001, REQ-008, REQ-406
- **参照した設計文書**: `dataflow.md` §2（ログイン + OAuth コールバック）, `interfaces.ts` §5 `UseLoginReturn`, `docs/decisions/007-composable-naming-conventions.md`（§補遺）

---

## 2. 入力・出力の仕様（EARS機能要件・TypeScript型定義ベース）

### 戻り値型契約（interfaces.ts `UseLoginReturn`）🔵

```ts
export interface UseLoginReturn {
  login: (redirect?: string) => Promise<void>
  logout: () => Promise<void>
  pending: Ref<boolean>
  notice: Ref<string | null>
}
```

### 2.1 `login(redirect?: string): Promise<void>` 🔵

- **入力**: `redirect`（省略可、`string`）— OAuth ラウンドトリップ後に到達したい最終遷移先パス。未指定時は `'/'` を既定とする。
- **処理**:
  1. （任意）前回 notice を `clear()` する。
  2. `pending` を `true` にする。
  3. `redirectTo = '/confirm?redirect=' + encodeURIComponent(redirect ?? '/')` を組み立てる（A2 redirect クエリ運搬）。
  4. `supabase.auth.signInWithOAuth({ provider: 'google', options: { redirectTo } })` を呼ぶ。
  5. `error` があれば `setNotice(error)`（EDGE-002）。`error` が無ければ Supabase がブラウザを OAuth 認可画面へリダイレクトする。
  6. `pending` を `false` に戻す。
- **出力**: `Promise<void>`（戻り値で結果は返さず、副作用＝リダイレクト or notice セット）。

### 2.2 `logout(): Promise<void>` 🔵

- **入力**: なし。
- **処理**:
  1. `pending` を `true` にする。
  2. `supabase.auth.signOut()` を呼ぶ。
  3. `error` があれば `setNotice(error)`（EDGE-002）、`navigateTo` は呼ばない。
  4. 成功時は `await navigateTo('/login')`（REQ-008）。
  5. `pending` を `false` に戻す。
- **出力**: `Promise<void>`。

### 2.3 `pending: Ref<boolean>` 🔵

- 初期値 `false`。`login` / `logout` 実行中に `true`、完了（成功・失敗いずれも）で `false`（EDGE-003 二重送信防止）。page がボタン `disabled` に使用する。

### 2.4 `notice: Ref<string | null>` 🔵

- `useNoticeErrors()` から取得した notice ref。Auth エラー時に非 null となり `<UAlert>`（永続表示・toast ではない）チャネルへ流れる（EDGE-002）。初期値 `null`。

### 入出力の関係性 🔵

| 関数 | 成功時 | 失敗時 |
|---|---|---|
| `login` | Supabase が OAuth 画面へリダイレクト / `notice` 不変 | `notice` セット、リダイレクトなし |
| `logout` | `navigateTo('/login')` 実行 | `notice` セット、`navigateTo` 不実行 |
| 共通 | `pending` true → false | `pending` true → false |

- **参照したEARS要件**: REQ-001, REQ-008, EDGE-002, EDGE-003, A2
- **参照した設計文書**: `interfaces.ts` `UseLoginReturn` / `NoticeErrorsApi`, `dataflow.md` §2, `docs/tasks/auth-onboarding/TASK-0008.md` 実装詳細 §1

---

## 3. 制約条件（EARS非機能要件・アーキテクチャ設計ベース）

🔵 **アーキテクチャ制約**
- page から `supabase.auth.signInWithOAuth` / `signOut` を直叩きしてはならない。必ず `useLogin` 経由（REQ-406 / ADR-007 D9）。
- `useSupabaseClient<Database>()` から Auth API を取得する。新規 RLS / RPC は作らない（ADR-012 D2、本単位は data-foundation 側で検証済）。

🔵 **エラーハンドリング制約**
- Auth エラーは EDGE-002 のため `useNoticeErrors.setNotice` 経由で `notice`（`<UAlert>` チャネル）に流す。toast でも field error でもない（`dataflow.md` §6 / error-handling.md §6.4）。
- `useLogin` は `error` をそのまま `setNotice(error)` に渡す。識別子→i18n 文言変換は `useNoticeErrors` 内部の `useErrorMessage` が行う（責務分離、note.md §3）。

🟡 **二重送信防止制約（EDGE-003）**
- `pending` を try/finally 相当の確実な制御で `false` に戻し、連続クリックを防ぐ。EDGE-003 は文言上 Group 作成画面の例だが、本 composable では login/logout に同パターンを適用する妥当な推測。

🔵 **セキュリティ制約**
- publishable key（`sb_publishable_*`）のみを `useSupabaseClient()` 経由で使用。service_role キーをクライアントに含めない（NFR-102）。
- OAuth provider は Google のみ（ADR-009、dev は Email+Google だがアプリ実装としては Google）。

🟡 **パフォーマンス制約**
- ログイン押下→OAuth→`/confirm`→行き先表示完了までを dev 環境 5 秒以内（NFR-001、ユーザ操作時間除く）。本 composable 単体の責務は呼び出しまでで、ラウンドトリップ全体は受入テストで実測。

🟡 **redirectTo の絶対/相対 URL 扱い**
- `redirectTo` を相対パス `/confirm?...` で渡すか絶対 URL にするかは `@nuxtjs/supabase` / Supabase OAuth のリダイレクト許可リスト仕様に従い実装時確認（TASK-0008.md 注記）。要件としては「`/confirm?redirect=` を含む値」を必須とする。

🔵 **コーディング規約制約**
- ファイル名ケバブケース、`<script setup lang="ts">` / Composition API のみ、TypeScript strict、ESLint（1tbs / no comma dangle）。

- **参照したEARS要件**: REQ-406, NFR-001, NFR-102, EDGE-002, EDGE-003
- **参照した設計文書**: `architecture.md`（§既存 API マッピング）, `error-handling.md` §6.4, ADR-007 / ADR-009 / ADR-012, `interfaces.ts` §5 ヘッダコメント

---

## 4. 想定される使用例（EARS Edgeケース・データフローベース）

### 4.1 基本パターン: ログイン 🔵
```ts
const { login, pending, notice } = useLogin()
await login('/groups/new')
// → signInWithOAuth({ provider:'google', options:{ redirectTo:'/confirm?redirect=%2Fgroups%2Fnew' } })
```
`dataflow.md` §2 シーケンス: ユーザがボタン押下 → `signInWithOAuth` → Google 認可画面 → `/confirm?redirect=...` 着地（JWT cookie 確立）→ middleware が `route.query.redirect ?? '/'` で最終遷移。

### 4.2 基本パターン: ログアウト 🔵
```ts
const { logout } = useLogin()
await logout()
// → signOut() → 成功なら navigateTo('/login')
```

### 4.3 引数省略時のデフォルト 🟡
```ts
await login()
// → redirectTo: '/confirm?redirect=%2F'  (redirect ?? '/')
```

### 4.4 エッジ/エラーケース: Auth エラー（EDGE-002）🔵
- `signInWithOAuth` / `signOut` が `{ error }` を返す（OAuth キャンセル、ネットワークエラー、セッション中断）。
- → `setNotice(error)` で `notice.value` が非 null になり `<UAlert>` 永続表示。
- → `login` 失敗時はリダイレクトなし、`logout` 失敗時は `navigateTo('/login')` を呼ばない。

### 4.5 エッジケース: 二重送信（EDGE-003）🟡
- ボタン連打。`pending` true 中は page 側でボタン `disabled` のため 2 回目の呼び出しは抑止される（page 責務）。composable は `pending` の確実な true/false 遷移を保証する。

- **参照したEARS要件**: REQ-001, REQ-008, EDGE-002, EDGE-003, A2
- **参照した設計文書**: `dataflow.md` §2 シーケンス図, §6（エラーチャネル）

---

## 5. EARS要件・設計文書との対応関係

- **参照したユーザストーリー**: チームメンバーが Google アカウントでログイン/ログアウトする（PRD §3 認証）
- **参照した機能要件**:
  - REQ-001（`/login` で Google OAuth、`signInWithOAuth({ provider: 'google' })`）
  - REQ-008（ログアウト → `signOut()` → `/login` 遷移）
  - REQ-406（page から `supabase` 直叩き禁止、domain composable 経由）
- **参照した非機能要件**: NFR-001（合計 5 秒以内）, NFR-102（publishable key のみ）, NFR-301（単体テスト範囲：mock 検証）, NFR-302（OAuth は mock 検証）
- **参照した Edgeケース**: EDGE-002（OAuth コールバック中エラー → `<UAlert>`）, EDGE-003（二重送信 → ボタン disabled）
- **参照した受け入れ基準 / 完了条件**（TASK-0008.md）:
  1. `login(redirect?)` が `signInWithOAuth({ provider:'google', options:{ redirectTo:'/confirm?redirect=...' } })` を呼ぶ
  2. `redirect` を `/confirm` の `redirect` クエリに運搬（A2）
  3. `logout()` が `signOut()` 後 `navigateTo('/login')`
  4. Auth エラー時に `setNotice` で `notice` セット（EDGE-002）
  5. 実行中 `pending === true`、完了で `false`（EDGE-003）
  6. 戻り値が `UseLoginReturn` と一致
- **参照した設計文書**:
  - **アーキテクチャ**: `architecture.md`（composable 構成 / 既存 API マッピング）
  - **データフロー**: `dataflow.md` §2（ログイン + OAuth コールバック）, §6（エラーチャネル）
  - **型定義**: `interfaces.ts` §5 `UseLoginReturn`, §4 `NoticeErrorsApi`
  - **API仕様**: Supabase Auth（`signInWithOAuth` / `signOut`）。新規 API エンドポイントなし。
  - **ADR**: ADR-007（composable 命名・補遺）, ADR-009（Google OAuth）, ADR-011（ヘッダーログアウト）, ADR-012（テスト戦略）

---

## 6. 単体テスト要件（最小カバレッジ）

> mock 戦略（ADR-012 D4 / `tests/unit/composables/useNoticeErrors.test.ts` 踏襲）: `vi.hoisted` + `vi.mock('#imports')` で `useSupabaseClient` / `navigateTo` / `useNoticeErrors` を差し替え。`signInWithOAuth` / `signOut` / `setNotice` を `vi.fn()` でスパイ。`beforeEach(() => vi.clearAllMocks())`。memory `feedback_test_coverage` に従い境界値＋branch のみ、冗長ケースなし。

- **TC1**（🔵 REQ-001 / A2）: `login('/groups/new')` で `signInWithOAuth` が `provider:'google'` かつ `options.redirectTo` に `/confirm?redirect=` を含む引数で 1 回呼ばれる。
- **TC2**（🔵 REQ-008）: `logout()` で `signOut` が呼ばれた後に `navigateTo('/login')` が呼ばれる。
- **TC3**（🔵 EDGE-002）: `signInWithOAuth` が `{ error }` を返すとき `login()` で `setNotice` が呼ばれ `notice.value` が非 null、かつ `navigateTo` は呼ばれない。

統合テスト: 該当なし（新規 RLS/RPC なし、ADR-012 D2）。OAuth ラウンドトリップは受入テストで実測。

---

## 品質判定

✅ **高品質**
- 要件の曖昧さ: なし（戻り値型・各関数の入出力・エラーチャネルが確定）
- 入出力定義: 完全（`UseLoginReturn` 4 メンバー全定義）
- 制約条件: 明確（REQ-406 / EDGE-002 / EDGE-003 / NFR-102）
- 実装可能性: 確実（TASK-0008.md に実装サンプルあり、依存 TASK-0007 完了）
- 信頼性レベル分布: 🔵 多数（コア仕様は全 🔵）、🟡 少数（redirectTo URL 扱い・pending 適用・NFR レイテンシ・引数省略デフォルト）、🔴 なし

**残課題（次フェーズで確定）**:
- `redirectTo` を相対パス/絶対 URL どちらで渡すか（Supabase 許可リスト仕様、実装時確認）
- `login` 冒頭の `clear()` 呼び出し有無（TASK-0008.md サンプルは呼ぶ、テスト必須ではない）
- `redirect` を引数 vs `useRoute().query.redirect` から読むか（interfaces.ts は引数契約を採用）
