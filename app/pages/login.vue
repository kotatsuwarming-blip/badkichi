<script setup lang="ts">
/**
 * 【機能概要】: Google OAuth ログイン起点ページ
 * 【実装方針】: page から supabase.auth を直叩きせず useLogin() 経由で OAuth を開始する (REQ-001 / REQ-406)
 *              pending で二重送信防止 (EDGE-003)、notice を <UAlert> で表示 (EDGE-002)
 * 🔵 REQ-001 / REQ-406 / EDGE-002 / EDGE-003 / ADR-011 D1 + auth-pages-requirements.md §2.1
 */

// 【レイアウト指定】: 認証前ページは auth レイアウト（中央寄せ・ロゴのみ・ヘッダーなし）🔵 ADR-011 D1
definePageMeta({ layout: 'auth' })

// 【i18n 初期化】: 文言は locales/ja.json 経由。コードに文字列リテラルを直書きしない (NFR-204) 🔵
const { t } = useI18n()

// 【ルート取得】: redirect クエリを読み出すために useRoute() を使用 🔵
const route = useRoute()

// 【login composable 取得】: Google OAuth ログイン・ログアウト composable (TASK-0008 実装済) 🔵
const { login, pending, notice } = useLogin()

/**
 * 【機能概要】: Google ログインボタン押下ハンドラ
 * 【実装方針】: route.query.redirect を引数で渡す。useLogin.login が redirectTo 組み立てを行う (REQ-001)
 * 【テスト対応】: useLogin.test.ts TC1 (signInWithOAuth 呼び出し・redirect 運搬) が対応
 * 🔵 REQ-001 / dataflow.md §2 + auth-pages-requirements.md §2.1
 */
function handleLogin() {
  // 【redirect 取得】: middleware が付与した redirect クエリを取り出す (EDGE-001 redirect チェーン) 🔵
  // route.query.redirect は string | string[] | undefined になりうるため resolveQueryParam で正規化する
  const redirect = resolveQueryParam(route.query.redirect)

  // 【OAuth 開始】: useLogin().login(redirect) を呼ぶ。Supabase 直叩き禁止 (REQ-406) 🔵
  login(redirect)
}
</script>

<template>
  <!-- 【ページルート】: auth レイアウトの <slot /> に差し込まれる -->
  <div class="w-full flex flex-col gap-6">
    <!-- 【タイトル】: locales/ja.json login.title (NFR-204) 🔵 -->
    <h1 class="text-2xl font-bold text-center">
      {{ t('login.title') }}
    </h1>

    <!-- 【エラー通知】: Auth エラー時に useLogin.notice を <UAlert> で表示 (EDGE-002) 🔵 -->
    <UAlert
      v-if="notice"
      color="error"
      variant="soft"
      :description="notice"
    />

    <!-- 【Google ログインボタン】: pending 中は disabled + loading で二重送信防止 (EDGE-003) 🔵 -->
    <UButton
      block
      size="lg"
      color="neutral"
      :label="t('login.google')"
      :loading="pending"
      :disabled="pending"
      icon="i-simple-icons-google"
      @click="handleLogin"
    />
  </div>
</template>
