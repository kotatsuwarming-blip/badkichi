# TDD Green フェーズ記録: auth-pages (TASK-0015)

**機能名**: 認証前ページ (auth-pages: `/login` + `/confirm`)
**タスクID**: TASK-0015
**要件名**: auth-onboarding
**実施日**: 2026-06-01

---

## 実装サマリー

Red フェーズの判定どおり「新規テストなし」。  
`login.vue` 新規作成 + `confirm.vue` スタブ置換の 2 ファイル実装で完了。

---

## 実装ファイル

### 1. `app/pages/login.vue`（新規作成）

```vue
<script setup lang="ts">
/**
 * 【機能概要】: Google OAuth ログイン起点ページ
 * 【実装方針】: page から supabase.auth を直叩きせず useLogin() 経由で OAuth を開始する (REQ-001 / REQ-406)
 *              pending で二重送信防止 (EDGE-003)、notice を <UAlert> で表示 (EDGE-002)
 * 🔵 REQ-001 / REQ-406 / EDGE-002 / EDGE-003 / ADR-011 D1 + auth-pages-requirements.md §2.1
 */

definePageMeta({ layout: 'auth' }) // 🔵 ADR-011 D1

const { t } = useI18n()
const route = useRoute()
const { login, pending, notice } = useLogin()

function handleLogin() {
  const redirect = Array.isArray(route.query.redirect)
    ? route.query.redirect[0] ?? undefined
    : route.query.redirect ?? undefined
  login(redirect)
}
</script>

<template>
  <div class="w-full flex flex-col gap-6">
    <h1 class="text-2xl font-bold text-center">{{ t('login.title') }}</h1>
    <UAlert v-if="notice" color="error" variant="soft" :description="notice" />
    <UButton
      block size="lg" color="neutral"
      :label="t('login.google')"
      :loading="pending" :disabled="pending"
      icon="i-simple-icons-google"
      @click="handleLogin"
    />
  </div>
</template>
```

**実装方針**:
- `definePageMeta({ layout: 'auth' })` でレイアウト指定 (ADR-011 D1) 🔵
- `useLogin().login(redirect)` 呼び出しのみ。Supabase 直叩き禁止 (REQ-406) 🔵
- `route.query.redirect` を `string` に正規化して `login()` に渡す (EDGE-001) 🟡
- `pending` で `disabled` / `loading` — 二重送信防止 (EDGE-003) 🔵
- `notice` を `<UAlert>` にバインド (EDGE-002) 🔵
- 全文言は `t()` 経由 (NFR-204) 🔵

---

### 2. `app/pages/confirm.vue`（スタブ置換）

#### Before (data-foundation TASK-0016 スタブ)
```vue
<script setup lang="ts">
const user = useSupabaseUser()
watch(user, (u) => { if (u) navigateTo('/') }, { immediate: true })
</script>
<template><div>Signing in...</div></template>
```

#### After (本実装)
```vue
<script setup lang="ts">
/**
 * 【機能概要】: OAuth コールバック着地ページ。セッション確立を待ち、確立後 redirect クエリへ遷移する
 * 🔵 REQ-002 / REQ-104 / REQ-203 / REQ-406 / EDGE-002 / ADR-011 D1
 */

definePageMeta({ layout: 'auth' })

const { t } = useI18n()
const route = useRoute()
const user = useSupabaseUser()
const { notice } = useLogin()

watch(user, (u) => {
  if (u) {
    const redirect = Array.isArray(route.query.redirect)
      ? route.query.redirect[0] ?? '/'
      : route.query.redirect ?? '/'
    navigateTo(redirect)
  }
}, { immediate: true })
</script>

<template>
  <div class="w-full flex flex-col gap-6">
    <template v-if="notice">
      <UAlert color="error" variant="soft" :description="notice" />
      <UButton block color="neutral" variant="outline" :label="t('common.backToHome')" to="/login" />
    </template>
    <template v-else>
      <p class="text-center text-sm text-muted">{{ t('confirm.processing') }}</p>
      <USkeleton class="h-10 w-full rounded-md" />
    </template>
  </div>
</template>
```

**実装方針**:
- `definePageMeta({ layout: 'auth' })` でレイアウト指定 (ADR-011 D1) 🔵
- スタブの `navigateTo('/')` 固定を `navigateTo(route.query.redirect ?? '/')` に置換 (REQ-104) 🔵
- セッション確立中は `<USkeleton>` 表示 (REQ-203 / NFR-202) 🔵
- Auth エラー (`useLogin().notice`) を `<UAlert>` + 「ログイン画面に戻る」ボタンで表示 (EDGE-002) 🔵
- 遷移先の Group 有無分岐は middleware に委譲。page 内追加判定なし 🔵
- Supabase 直叩き禁止 (REQ-406) 🔵

---

## テスト実行結果

```
pnpm typecheck  → エラーなし (nuxt typecheck 完了)
pnpm test --run → 18 files / 61 tests — 全 passed
pnpm lint (新規ファイル対象) → エラーなし
```

- 既存 lint エラー (`docs/design/video-playback/interfaces.ts`) は本タスクとは無関係の既存問題

---

## チェックリスト照合（新規ロジック獲得チェック）

| # | 項目 | 結果 |
|---|---|---|
| 1 | confirm.vue が新規ドメインロジック（バリデーション等）を持ち込まないか | ✅ 単純結線のみ |
| 2 | login.vue が `useLogin().login()` 呼び出し以外の副作用を持たないか | ✅ なし |
| 3 | redirect 解決が `route.query.redirect ?? '/'` の単純結線か | ✅ nullish 合体のみ |
| 4 | EDGE-002 が `useLogin.notice` の `<UAlert>` バインドにとどまるか | ✅ page 独自エラー判定なし |
| 5 | 依存層テストが緑か | ✅ 61 tests passed |

→ 新規ドメインロジックは獲得していない。新規テスト追加は不要。

---

## 品質評価

| 観点 | 判定 |
|---|---|
| テスト成功状況 | ✅ 既存 61 tests 全 passed |
| 実装のシンプルさ | ✅ 結線のみ。新規ロジックなし |
| リファクタリング箇所 | `route.query.redirect` 正規化ヘルパの共通化が候補 (Refactor フェーズ) |
| 機能的問題 | なし |
| コンパイルエラー | なし |
| ファイルサイズ | login.vue: 50 行 / confirm.vue: 65 行（制限以内） |
| モック使用 | 実装コードにモック・スタブなし |

**総合**: ✅ 高品質
