# TASK-0008: useLogin（Auth）- TDD tasknote

**作成日**: 2026-06-01  
**タスク**: TASK-0008 useLogin Auth composable  
**要件名**: auth-onboarding  
**フェーズ**: Phase 2 - ドメインロジック層  

---

## 1. 技術スタック

### フレームワーク・ライブラリ
- **Nuxt 4** (Vue 3 + TypeScript strict mode) - SSR デフォルト
- **@nuxtjs/supabase** - `useSupabaseClient<Database>()` / `useSupabaseUser()` で JWT 認証管理
- **Composition API** - `<script setup lang="ts">` のみ（Options API 不採用）
- **Vue ref/reactive** - state 管理（Pinia は MVP では不採用）

### エラーハンドリング・i18n
- **@nuxtjs/i18n** - ja のみ、en はハコ。i18n キー `errors.*` で文言変換
- **@sentry/nuxt** v10 - 想定外エラーの自動報告（@ 記号エスケープ必須）
- **useErrorMessage** composable (TASK-0007 実装済) - エラー識別子 → i18n 文言変換
- **useNoticeErrors** composable (TASK-0007 実装済) - Auth エラーを `<UAlert>` チャネルへ流す

### テスト環境
- **Vitest** + Vue Test Utils - 単体テスト (tests/unit/ に集約)
- **vi.mock()** でモック戦略（差し替え対象: `useSupabaseClient`, `navigateTo`, `useNoticeErrors`）
- **fileParallelism: false** 不要（単体テストは独立、RDB 不要）

### 型定義・バリデーション
- **TypeScript strict mode** - 全 composable で strict 必須
- **Zod** - form validation（本単位では Group 名入力時）
- **Supabase 生成型** `app/types/supabase.ts` - `Database['public']['Tables'][...]` で型安全

---

## 2. 開発ルール

### コーディング規約
- **ファイル名**: ケバブケース (`use*.ts`)
- **Composition API のみ** - `defineComponent` / Options API 禁止
- **明確な責務分離**:
  - page が直接 `supabase.auth.signInWithOAuth` を呼ばない (REQ-406 / ADR-007 D9)
  - ドメインロジックは composable (`app/composables/useLogin.ts`) に集約
  - page は composable の戻り値のみを消費（`login / logout / pending / notice`）
- **エラー時チャネル指定** - Auth エラー → EDGE-002 のため `useNoticeErrors` 実行（`<UAlert>` 永続表示）
- **二重送信防止** - EDGE-003 のため `pending` state を expose、page は button disabled に使用

### テスト規約（memory: feedback_test_coverage）
- **境界値テスト + branch coverage のみ** - 冗長ケース不要
- **mock は vi.hoisted + vi.mock で厳密に** - TDZ エラー回避（useNoticeErrors.test.ts 参照）
- **afterEach で vi.clearAllMocks()** 必須

### i18n・Sentry
- **i18n キーは @ 記号でエスケープ必須** (TASK-0004 & TASK-0005 確定)
  - 例: `t('errors.@sentry/nuxt')` の @ は `t('errors.\\@sentry...')` か `t` 関数引数で処理
- **Sentry v10 採用** - `@sentry/nuxt@10.x`（legacy JWT など古い記述は不採用）

---

## 3. 関連実装

### 参考: useNoticeErrors（TASK-0007 実装済）
**ファイル**: `app/composables/useNoticeErrors.ts`
- 目的: Auth エラーを `<UAlert>` に流す薄いラッパー
- 戻り値: `{ notice, setNotice, clear }`
- 内部: `useErrorMessage.errorToMessage(error, pgContext)` で変換してから `notice.value` に載せる
- **useLogin の error は `setNotice(error)` で notice チャネルへ**

### 参考: useErrorMessage（TASK-0007 実装済）
**ファイル**: `app/composables/useErrorMessage.ts`
- 目的: エラー識別子 → i18n 文言の 1:1 変換
- API: `errorToMessage(error, pgContext?: ErrorContext): string`
- 戻り値: ローカライズ済み文言（存在しなければ `errors.generic` + Sentry 報告）
- **useLogin は error をそのまま setNotice に渡す（errorToMessage は useNoticeErrors が呼ぶ）**

### データフロー図（docs/design/auth-onboarding/dataflow.md §2 より）
```
sequenceDiagram
    U->>L: 「Google でログイン」クリック
    L->>SB: signInWithOAuth({ provider:'google', options:{ redirectTo:'/confirm?redirect=...' } })
    SB-->>G: OAuth 認可画面へリダイレクト
    G-->>C: /confirm?redirect=... へ戻る (JWT cookie 確立)
    Note over C: Auth エラー時は useLogin.notice → <UAlert>
```

---

## 4. 設計文書・型契約

### UseLoginReturn 型（interfaces.ts より）
```ts
export interface UseLoginReturn {
  login: (redirect?: string) => Promise<void>
  logout: () => Promise<void>
  pending: Ref<boolean>
  notice: Ref<string | null>
}
```
- **login(redirect?)**: redirectTo に `/confirm?redirect=encodeURIComponent(redirect ?? '/')` を組み立てて OAuth 開始
- **logout()**: signOut() → navigateTo('/login')
- **pending**: Ref<boolean> - 両関数の try/finally で制御（初期値 false）
- **notice**: Ref<string | null> - useNoticeErrors から取得した notice（エラー時の永続表示用）

### 完了条件（TASK-0008.md より）
- [ ] `login(redirect?)` が `signInWithOAuth({ provider: 'google', options: { redirectTo: '/confirm?redirect=...' } })` を呼ぶ
- [ ] `redirect` 引数を `/confirm` の `redirect` クエリに運搬する（A2）
- [ ] `logout()` が `signOut()` 後に `navigateTo('/login')` を呼ぶ
- [ ] Auth エラー時に `useNoticeErrors.setNotice` で notice をセット（EDGE-002）
- [ ] `login` / `logout` 実行中は `pending === true`、完了で `false`（EDGE-003）
- [ ] 戻り値が `UseLoginReturn` と一致

---

## 5. テスト関連情報

### テスト構成
- **テストファイル**: `tests/unit/composables/useLogin.test.ts` (新規作成)
- **テストフレームワーク**: Vitest + Vue Test Utils
- **Config**: `vitest.config.ts` - `include: ['tests/unit/**/*.test.ts']` (`.integration.test.ts` は除外)

### Mock 戦略（ADR-012 D4 + useNoticeErrors.test.ts より）
```ts
const { signInWithOAuthMock, signOutMock, navigateToMock } = vi.hoisted(() => ({
  signInWithOAuthMock: vi.fn().mockResolvedValue({ error: null }),
  signOutMock: vi.fn().mockResolvedValue({ error: null }),
  navigateToMock: vi.fn()
}))

vi.mock('#imports', async (importOriginal) => {
  const vue = await importOriginal<typeof import('vue')>()
  return {
    ref: vue.ref,
    useSupabaseClient: () => ({
      auth: { signInWithOAuth: signInWithOAuthMock, signOut: signOutMock }
    }),
    navigateTo: navigateToMock,
    useNoticeErrors: () => ({ notice: ref(null), setNotice: vi.fn(), clear: vi.fn() })
  }
})
```

### テストケース要件（TASK-0008.md より）

**TC1: login が provider:'google' で signInWithOAuth を呼ぶ** (🔵)
- Given: `signInWithOAuth` が `{ error: null }` を返す mock
- When: `login('/groups/new')` を呼ぶ
- Then: `signInWithOAuth` が `provider: 'google'` かつ `options.redirectTo` に `/confirm?redirect=` を含む引数で 1 回呼ばれる

**TC2: logout が signOut → navigateTo('/login') する** (🔵)
- Given: `signOut` が `{ error: null }` を返す mock
- When: `logout()` を呼ぶ
- Then: `signOut` が呼ばれた後に `navigateTo('/login')` が呼ばれる

**TC3: Auth エラー時に notice をセットする** (🔵)
- Given: `signInWithOAuth` が `{ error: <Auth エラー> }` を返す mock
- When: `login()` を呼ぶ
- Then: `setNotice` が呼ばれ `notice.value` が非 null になる（EDGE-002）。`navigateTo` は呼ばれない

### 既存テストパターン参照
- **ファイル**: `tests/unit/composables/useNoticeErrors.test.ts` (TASK-0007 実装済)
- **パターン**:
  - `vi.hoisted()` で mock 変数を先に定義
  - `vi.mock('#imports')` で Vue の ref を実際の ref に差し替え
  - `beforeEach(() => vi.clearAllMocks())`
  - `expect().toHaveBeenCalledWith()` で引数検証

---

## 6. 注意事項

### セキュリティ・アーキテクチャ
- **page から supabase.auth 直叩き禁止** (REQ-406 / ADR-007 D9)
  - ❌ page: `supabase.auth.signInWithOAuth(...)`
  - ✅ page: `useLogin().login(redirect)` → composable が auth API を管理
- **redirect クエリ運搬** (A2)
  - login 時: `redirectTo: '/confirm?redirect=' + encodeURIComponent(redirect ?? '/')`
  - confirm 側 (TASK-0016): `route.query.redirect ?? '/'` で最終遷移先を解決
  - middleware (auth.global.ts): さらに Group 所属チェックで目的地を調整

### エラーハンドリング
- **Auth エラー = EDGE-002** - `useNoticeErrors.setNotice` で notice チャネルへ
  - `<UAlert>` で永続表示（toast ではない）
  - サンプル: OAuth キャンセル時のエラー、セッション中断時など
- **未マッピングエラー**: useErrorMessage が `Sentry.captureException` で自動報告

### 二重送信防止（EDGE-003）
- **pending state**: login / logout 前は `true`、完了 or error で `false`
- **page が button disabled に使う**
  - HTML: `<UButton @click="login" :disabled="pending">` で連続クリック防止
  - compose: `finally` で確実に `pending=false` にする

### Nuxt 特有の注意
- **navigateTo は Nuxt 4 Composition API**
  - `import { navigateTo } from '#app'`（auto-import 有効）
  - SSR 環境では server/client 両方で動く
- **useRoute は middleware/page で共有可**
  - composable 内で `useRoute()` を読むか、page から引数で渡すか（実装判断）
  - 本タスクでは **引数 `redirect` で明示的に受け取る** (interfaces.ts comment)

---

## 7. 次フェーズへの注意点

### tdd-requirements フェーズへ
- **テストケース数**: 3 本（TC1 / TC2 / TC3）
- **前置条件**: useNoticeErrors, useErrorMessage, error-codes.ts が完成状態
- **後続デペンデンシー**: login.vue (TASK-0014), default.vue ログアウト (TASK-0015) が useLogin を消費

### tdd-testcases フェーズへ
- **redirect パラメータ**: 引数 vs useRoute().query での選択が確定していることを確認
  - 現在設計では「引数優先」(interfaces.ts comment)、実装で判断可能

### tdd-red → tdd-green → tdd-refactor フェーズへ
- **mock 厳密性**: useNoticeErrors.test.ts の hoisted パターンを踏襲
- **型安全性**: Supabase Database 型を正確に使う（DB スキーマ変更時は型再生成）
- **error.ts の classify**: TASK-0003 で `isAppError / isPgError` が完成状態であることを確認

---

## 8. 参考ファイル一覧

### 要件・設計
- `docs/spec/auth-onboarding/note.md` - 単位スコープ・技術スタック
- `docs/spec/auth-onboarding/requirements.md` - 統合機能要件（REQ-001 / REQ-008 等）
- `docs/design/auth-onboarding/architecture.md` - コンポーネント構成・API マッピング
- `docs/design/auth-onboarding/dataflow.md` - ログイン + OAuth フロー図
- `docs/design/auth-onboarding/interfaces.ts` - UseLoginReturn 型契約
- `docs/design/cross-cutting/error-handling.md` - エラーチャネル設計（§6.2 決定木）

### 実装参照
- `app/composables/useNoticeErrors.ts` - notice チャネル実装（TASK-0007）
- `app/composables/useErrorMessage.ts` - エラー変換実装（TASK-0007）
- `app/types/error-codes.ts` - エラー識別子定数（TASK-0003）
- `tests/unit/composables/useNoticeErrors.test.ts` - mock パターン参考

### 設定ファイル
- `vitest.config.ts` - テスト設定
- `nuxt.config.ts` - Supabase, i18n, Sentry 設定
- `package.json` - Nuxt 4.4 / Vue 3 / Supabase JS v2 等

### ADR / 決定記録
- `docs/decisions/005-error-handling-strategy.md` - チャネル設計の根拠
- `docs/decisions/007-composable-naming-conventions.md` - composable 設計規約（§補遺）
- `docs/decisions/008-middleware-strategy.md` - 認証 middleware（auth.global.ts）
- `docs/decisions/009-auth-provider-policy.md` - Google OAuth のみ（dev は Email+Google）

### 先行タスク
- `docs/tasks/auth-onboarding/TASK-0003.md` - error-codes.ts（完了）
- `docs/tasks/auth-onboarding/TASK-0004.md` - i18n/locales/ja.json（完了）
- `docs/tasks/auth-onboarding/TASK-0005.md` - Sentry v10（完了）
- `docs/tasks/auth-onboarding/TASK-0007.md` - useErrorMessage / useNoticeErrors（完了）

---

## 概要

**TASK-0008: useLogin（Auth）** は、Google OAuth ログイン・ログアウト、エラーハンドリング、二重送信防止を担う Auth composable。  
TASK-0007 の useNoticeErrors / useErrorMessage を基盤として、page から direct な `supabase.auth` 呼び出しを遮断し、composable を経由した認証フローを実装する。  
TDD で 3 テストケース（OAuth 呼び出し / ログアウト遷移 / エラー通知）をカバーし、Phase 2 ドメインロジック層の基礎を確立する。
