# TASK-0015 TDD コンテキストノート

**作成日**: 2026-06-01  
**対象タスク**: TASK-0015 (/login + /confirm pages、TDD)  
**要件名**: auth-onboarding

---

## 1. 技術スタック

### フレームワーク・ライブラリ
- **Nuxt**: v4.4 (Vue 3 + TypeScript strict mode)、SSR デフォルト
- **Nuxt UI**: v4.5 (`<UButton>`, `<UForm>`, `<UFormField>`, `<UAlert>`, `<USkeleton>`, `useToast()`)
- **i18n**: `@nuxtjs/i18n` (ja ロケール、en はハコ、dev のみ `?locale=en` で切替)
- **認証**: `@nuxtjs/supabase` (isomorphic composable、publishable key のみ)
- **バリデーション**: Zod (auth-onboarding で初登場)
- **テストフレームワーク**: Vitest v4.1.4 + @nuxt/test-utils v4.0.2
- **エラー監視**: @sentry/nuxt (error-handling.md §8 に従う)

### アーキテクチャパターン
- **BaaS 直結 + レイヤード**: page/component → composable → Supabase (RPC/PostgREST)
- **Page から Supabase 直接呼び禁止** (REQ-406): 必ず domain composable 経由
- **状態管理**: useAsyncData / useState のみ (Pinia 不採用)
- **ルーティング**: ファイルベースルーティング (`app/pages/`)

**参照元**: architecture.md §コンポーネント構成 / ADR-010 + ADR-007 / package.json

---

## 2. 開発ルール

### 認証・エラーハンドリング規約
- **エラー識別子**: `app/types/error-codes.ts` で集約定数として宣言。生文字列の比較禁止
- **エラー伝搬**: Supabase が `{data, error}` を返す → composable で `{data, error}` 形を維持 → page は分岐のみ
- **エラー UI**: 以下の 3 チャネル composable に型強制
  - `useFormErrors`: フォームフィールド inline エラー (`<UFormField>` 直下)
  - `useNoticeErrors`: 画面通知エラー (`<UAlert>` banner)
  - `useToastErrors`: 一過性通知 (`useToast()`)
- **エラー文言**: `locales/ja.json` の `errors.*` から取得。TS コードに文字列リテラル禁止
- **エラー変換**: `useErrorMessage()` で統一 (error-handling.md §5)

### TDD 規約
- **テスト層分離**: mock unit (`tests/unit/`) / integration (`tests/**/*.integration.test.ts`)
  - mock unit は pre-commit + CI で自動実行
  - integration は CI 専用
- **テスト粒度**: 境界値 + 分岐カバレッジのみ。UI 見た目テストは書かない (NFR-301)
- **Mock 戦略**:
  - Vitest alias を活用 (vitest.config.ts で `#imports` / `#supabase-client` / `#async-data` / `#nuxt-router` 定義済)
  - vi.hoisted() でテスト変数を TDZ 回避で先行定義
  - vi.mock() で composable / Supabase client を差し替え
  - import 実物は importOriginal で取得 (ref / navigateTo 等 Nuxt 実物が必要なケース)

### レイアウト規約 (ADR-011)
- **auth.vue**: 認証前 (`/login`, `/confirm`) — 中央寄せ・ロゴのみ・ヘッダーなし
- **default.vue**: 認証後（全 page）— ヘッダー (ロゴ + ユーザアバター + ログアウト) + `<slot />`
- **ページ側指定**: `definePageMeta({ layout: 'auth' })` を `/login`, `/confirm` に付与 (TASK-0015 実装)
- **ログアウト集約**: `default.vue` 1 箇所のみで `useLogin().logout()` 実装。後続 page は自動継承

**参照元**: requirements.md (REQ-001/002/104/203/406) / error-handling.md §全体 / CLAUDE.md (Coding Conventions) / vitest.config.ts

---

## 3. 関連実装

### 依存 Composable（既実装、テスト済）

#### useLogin (TASK-0008)
- **責務**: Google OAuth ログイン・ログアウト
- **戻り値**: `{ login(redirect?: string), logout(), pending, notice }`
- **実装**:
  - `login(redirect)`: redirectTo に `/confirm?redirect=${encodeURIComponent(redirect ?? '/')}` を組み立て
  - `signInWithOAuth({ provider: 'google', options: { redirectTo } })` を呼び出し
  - Auth エラーは `useNoticeErrors()` チャネルに流す (EDGE-002)
  - pending で二重送信防止 (EDGE-003)
- **ファイル**: `app/composables/useLogin.ts`

#### useCurrentGroup (TASK-0009)
- **責務**: ログイン中ユーザが所属する Group を読み取る (Read 専用)
- **戻り値**: `AsyncData<CurrentGroup | null>` (data / pending / error / refresh)
- **実装**:
  - `useAsyncData('current-group', handler)` で固定キー 'current-group' ラップ
  - middleware と page が同一キー共有 → 1 ナビゲーション 1 クエリ (NFR-002)
  - `from('group_members').select('group_id, groups(id, name)').eq('user_id', uid).maybeSingle()`
  - 所属なし (0 行) は null を正常値として返す
  - クエリエラーは throw → error.vue グローバルフォールバック
- **ファイル**: `app/composables/useCurrentGroup.ts`

### チャネル Composable（既実装、テスト済）

#### useNoticeErrors
- **責務**: 画面通知エラー管理 (`<UAlert>` banner)
- **戻り値**: `{ notice, setNotice(error, pgContext?), clear() }`
- **実装**: `useErrorMessage()` の薄いラッパ。errorToMessage で変換した文言を state に反映
- **ファイル**: `app/composables/useNoticeErrors.ts`

#### useFormErrors
- **責務**: フォームフィールド単位エラー (`<UFormField>` inline)
- **戻り値**: `{ fieldErrors, setFieldError(field, error, pgContext?), clear(field?) }`
- **実装**: 同上
- **ファイル**: `app/composables/useFormErrors.ts`

#### useErrorMessage
- **責務**: エラーを i18n 文言に変換
- **関数**: `errorToMessage(error, pgContext?): string`
- **実装**: error-handling.md §5 のロジック採用
- **ファイル**: `app/composables/useErrorMessage.ts`

### 既存ページ・レイアウト

#### confirm.vue (現在のスタブ)
```vue
<script setup lang="ts">
const user = useSupabaseUser()
watch(user, (u) => { if (u) navigateTo('/') }, { immediate: true })
</script>
<template><div>Signing in...</div></template>
```
- **現状**: data-foundation 単位の最小スタブ
- **TASK-0015 で**: スタブを本実装に置換 (差分 commit で区別)
- **本実装**: セッション確立待ち (`<USkeleton>`) → redirect クエリ遷移 / エラー表示

#### auth.vue (TASK-0014 完了)
```vue
<script setup lang="ts">
const { t } = useI18n()
</script>
<template>
  <UApp>
    <UMain class="flex min-h-screen items-center justify-center">
      <div class="flex flex-col items-center gap-8 w-full max-w-sm px-4">
        <NuxtLink to="/" :aria-label="t('app.name')">
          <AppLogo class="h-10 w-auto" />
        </NuxtLink>
        <slot />
      </div>
    </UMain>
  </UApp>
</template>
```

#### default.vue (TASK-0014 完了)
```vue
<script setup lang="ts">
const { t } = useI18n()
const { logout, pending } = useLogin()
const user = useSupabaseUser()
// ... userDisplayName / userAvatarUrl / userAvatarAlt computed
</script>
<template>
  <UApp>
    <UHeader>
      <template #left>
        <NuxtLink to="/" :aria-label="t('app.name')">
          <AppLogo class="h-8 w-auto shrink-0" />
        </NuxtLink>
      </template>
      <template #right>
        <UAvatar :src="userAvatarUrl" :alt="userAvatarAlt" size="sm" />
        <UButton
          color="neutral" variant="ghost"
          :label="t('layout.default.logout')"
          :loading="pending" :disabled="pending"
          @click="logout()"
        />
      </template>
    </UHeader>
    <UMain><slot /></UMain>
  </UApp>
</template>
```

### Middleware (TASK-0013 完了)

#### auth.global.ts
```ts
const PUBLIC_PATHS = ['/login', '/confirm']
const GROUP_OPTIONAL_PATHS = ['/onboarding', '/groups/new']

export default defineNuxtRouteMiddleware(async (to) => {
  const isPublicPath = PUBLIC_PATHS.includes(to.path) || to.path.startsWith('/join/')
  const user = useSupabaseUser()
  
  if (isPublicPath) {
    if (to.path === '/login' && user.value) {
      const { data: currentGroup } = await useCurrentGroup()
      if (currentGroup.value) return navigateTo('/')
    }
    return
  }
  
  if (!user.value) {
    return navigateTo(`/login?redirect=${encodeURIComponent(to.fullPath)}`)
  }
  
  const { data: currentGroup } = await useCurrentGroup()
  
  if (!currentGroup.value && !GROUP_OPTIONAL_PATHS.includes(to.path)) {
    return navigateTo('/onboarding')
  }
  
  if (currentGroup.value && to.path === '/onboarding') {
    return navigateTo('/')
  }
})
```

**参照元**: app/composables/useLogin.ts / app/composables/useCurrentGroup.ts / app/composables/useNoticeErrors.ts / app/composables/useFormErrors.ts / app/layouts/auth.vue / app/layouts/default.vue / app/middleware/auth.global.ts

---

## 4. 設計文書

### 要件定義
- **全要件**: docs/spec/auth-onboarding/requirements.md
  - **TASK-0015 関連**: REQ-001/002/104/203 (機能要件) / REQ-406 (制約) / NFR-202/204 (非機能) / EDGE-001/002 (エッジケース)
  - **重要**: REQ-001 (ログインボタン + useLogin.login(redirect) 呼び出し) / REQ-104 (redirect クエリ遷移) / REQ-203 (USkeleton ローディング表示) / EDGE-002 (Auth エラー + 戻るボタン)

### アーキテクチャ設計
- **全体**: docs/design/auth-onboarding/architecture.md
  - **レイアウト戦略**: auth.vue (未ログイン) / default.vue (ログイン後)、ログアウト集約
  - **既存 API マッピング**: Supabase RPC / PostgREST をどう消費するか
  - **認証前後の分岐**: middleware でどこまで判定し、page で何を確認するか

### データフロー設計
- **全体**: docs/design/auth-onboarding/dataflow.md
  - **§1 middleware 判定フロー**: public path / 未認証 / Group 未所属の判定ツリー
  - **§2 ログイン + OAuth コールバック**: useLogin.login → OAuth → /confirm → useCurrentGroup → middleware → 遷移先
  - **redirect チェーン**: `/join/[code]?redirect=...` → `/login?redirect=...` → OAuth → `/confirm?redirect=...` → 元の page
  - **§確立待ち + エラー表示**: <USkeleton> / <UAlert>

### 型定義
- **interface.ts**: docs/design/auth-onboarding/interfaces.ts
  - UseLoginReturn: `{ login(redirect?), logout(), pending, notice }`
  - UseCurrentGroupReturn: `AsyncState<CurrentGroup>`
  - CurrentGroup: `{ group_id, groups: Pick<groups, 'id' | 'name'> | null }`

### エラーハンドリング
- **全体**: docs/design/cross-cutting/error-handling.md
  - **§4.1 識別子**: APP_ERROR_CODES に auth-onboarding で ALREADY_IN_GROUP を追加
  - **§5 変換**: useErrorMessage で error → i18n 文言に変換
  - **§6.4 チャネル**: useFormErrors / useNoticeErrors / useToastErrors で型強制
  - **§7 i18n**: locales/ja.json でキー管理 (en は構造のみ)

**参照元**: docs/spec/auth-onboarding/requirements.md / docs/design/auth-onboarding/architecture.md / docs/design/auth-onboarding/dataflow.md / docs/design/auth-onboarding/interfaces.ts / docs/design/cross-cutting/error-handling.md

---

## 5. テスト関連情報

### テストフレームワーク・設定

#### Vitest 設定
- **ファイル**: vitest.config.ts
- **テスト範囲**: `tests/unit/**/*.test.ts` (mock unit のみ)
- **除外**: `**/*.integration.test.ts` (別 config で管理)
- **Alias** (重要):
  - `#imports`: Nuxt auto-import (@nuxtjs/supabase の auto-import)
  - `#supabase-client`: useSupabaseClient の安定パス
  - `#supabase-user`: useSupabaseUser の安定パス
  - `#async-data`: useAsyncData の安定パス
  - `#nuxt-router`: navigateTo の安定パス

#### テスト層分離
- **Mock unit** (`tests/unit/`):
  - vi.mock() で依存を差し替え
  - 実行時期: pre-commit (lint-staged) + CI
  - **TASK-0015 では page 単体テストを書かない** (NFR-301)
  - composable の依存テスト (useLogin, useCurrentGroup) は既に TASK-0008/0009 で完了
- **Integration test** (`tests/**/*.integration.test.ts`):
  - Supabase テストプロジェクトに実接続
  - 実行時期: CI 専用
  - fileParallelism: false 必須 (共有 DB 干渉対策)
  - Setup helper: tests/setup/create-test-users.ts (Admin API)

### 既存テストパターン

#### Mock 戦略 (useCreateGroup.test.ts より)
```ts
const { rpcMock, refreshMock, ... } = vi.hoisted(() => {
  return {
    rpcMock: vi.fn(),
    refreshMock: vi.fn().mockResolvedValue(undefined),
    ...
  }
})

// Nuxt auto-import (#imports) を丸ごと差し替え
vi.mock('#imports', async (importOriginal) => {
  const vue = await importOriginal<typeof import('vue')>()
  return {
    ref: vue.ref,  // 実物を取得（Ref<T> として機能）
    useSupabaseClient: () => ({ rpc: rpcMock }),
    useCurrentGroup: () => ({ refresh: refreshMock }),
    useFormErrors: () => ({ fieldErrors: fieldErrorsRef, ... })
  }
})

// Nuxt Vite transform 対応の保険
vi.mock('#supabase-client', () => ({
  useSupabaseClient: () => ({ rpc: rpcMock })
}))

vi.mock('~/composables/useCurrentGroup', () => ({
  useCurrentGroup: () => ({ refresh: refreshMock })
}))

beforeEach(() => {
  vi.clearAllMocks()
  fieldErrorsRef.value = {}
})
```

#### テストケース例 (middleware/auth.test.ts より)
- TC1: 未認証 + 非 public → `/login?redirect=...`
- TC2: ログイン済・未所属・非 public → `/onboarding`
- TC3: ログイン済・所属済・通常 page → 通過
- etc.

### Vitest 実行
```bash
pnpm test              # mock unit テスト実行（watch mode）
pnpm test:integration # integration テスト実行（CI 用）
```

**参照元**: vitest.config.ts / tests/unit/composables/useCreateGroup.test.ts / tests/unit/middleware/auth.test.ts / tests/unit/composables/useLogin.test.ts

---

## 6. ローカライズ・定数

### locales/ja.json (確定済)
```json
{
  "errors": {
    "not_authenticated": "ログインが必要です",
    "generic": "予期しないエラーが発生しました"
  },
  "login": {
    "title": "ログイン",
    "google": "Google でログイン",
    "submit": "ログイン"
  },
  "confirm": {
    "processing": "ログイン処理中です…"
  },
  "common": {
    "backToHome": "トップに戻る"
  },
  "layout": {
    "default": {
      "logout": "ログアウト",
      "avatar": { "alt": "ユーザアバター" }
    }
  }
}
```

### Error Codes (app/types/error-codes.ts)
- **実装時に追加**: ALREADY_IN_GROUP: 'already_in_group' (interfaces.ts §1 より)

**参照元**: i18n/locales/ja.json

---

## 7. 注意事項・トラブルシューティング

### NFR-301: Page 単体テストは書かない
- TASK-0015 では `/login.vue` / `/confirm.vue` の「見た目テスト」は書かない
- 理由: ロジックはすべて依存 composable (useLogin / useCurrentGroup) で検証済
- テスト対象: useLogin / useCurrentGroup / middleware の分岐ロジック
- page は「結線確認」のみ (tdd-testcases で明示)

### /confirm はスタブ置換 (差分表示)
- data-foundation TASK-0016 時点で最小スタブが存在
- **TASK-0015 で本実装に置換する際、差分 commit を作成**
  - Before: `watch(user, (u) => { if (u) navigateTo('/') })`
  - After: `<USkeleton>` + redirect クエリ遷移 + エラー表示
- commit メッセージに「diff」と記載して、元の stub との境界を明確化

### Redirect チェーン全体の動作検証
- EDGE-001: `/join/[code]?redirect=...` → `/login?redirect=...` → OAuth → `/confirm?redirect=...` → 元の page
- `/confirm` は `route.query.redirect` を **読み取って遷移**
- middleware §1 判定は **遷移先で二次判定** (Group 有無に応じて /onboarding or 目的地)
- page 側では追加判定不要 (middleware に委譲)

### Auth エラー (EDGE-002)
- OAuth 中のネットワークエラー → `useLogin.notice` チャネルで拾う
- page: `<UAlert>` で `useLogin.notice` を表示
- 「ログイン画面に戻る」ボタン: `navigateTo('/login')`

### 二重送信防止 (EDGE-003)
- useLogin.pending で `/login` のボタンを disabled
- `/confirm` では pending 状態がない (ボタンなし、セッション確立を待つだけ)

### env / Secret 管理
- Supabase publishable key のみ使用 (service_role は不使用)
- Environment Secrets (GitHub) で管理、`.env.*` に書かない
- .env.development は ローカル開発用 (CI 実行時は CI Secrets から注入)

### Pre-commit hooks
```bash
pnpm lint-staged  # ESLint + prettier
pnpm typecheck    # TypeScript 型チェック
pnpm test         # mock unit テスト
pnpm i18n:check   # locales キー構造チェック
./scripts/check-migration-integrity.sh pre-commit
```

**参照元**: TASK-0015.md §単体テスト要件 / requirements.md (EDGE-001/002/003) / CLAUDE.md (Commands)

---

## まとめ

### TASK-0015 実装要点
1. **login.vue**: Google ボタン + `useLogin().login(route.query.redirect)` + `definePageMeta({ layout: 'auth' })`
2. **confirm.vue**: スタブ置換 → `<USkeleton>` 確立待ち → `navigateTo(route.query.redirect ?? '/')` + エラー表示 + `definePageMeta({ layout: 'auth' })`
3. **エラー**: `useLogin.notice` → `<UAlert>` + 「ログイン画面に戻る」ボタン (EDGE-002)
4. **ローディング**: `/confirm` で `<USkeleton>` 表示 (REQ-203 / NFR-202)
5. **文言**: locales/ja.json 経由 (NFR-204)
6. **テスト**: page 単体テストなし (NFR-301)。依存層 (useLogin / useCurrentGroup / middleware) は既に検証済

### 開発フロー (TDD 6 ステップ)
1. **tdd-requirements**: REQ-001/002/104/203 + EDGE-001/002 整理
2. **tdd-testcases**: page は依存層委譲、本 page では結線確認のみ
3. **tdd-red**: 不足テストがあれば赤で起こす (基本は TASK-0008/0009/0013 で充足)
4. **tdd-green**: login.vue / confirm.vue 実装 + スタブ置換
5. **tdd-refactor**: locales 化 / layout meta 確認
6. **tdd-verify-complete**: pnpm typecheck / pnpm lint / 依存テストが緑

---

**生成日**: 2026-06-01  
**対象要件**: auth-onboarding TASK-0015  
**信頼性レベル**: 🔵 (要件定義・設計・実装の 3 層すべて確定済、テストパターン確立済)
