<script setup lang="ts">
/**
 * 【機能概要】: OAuth コールバック着地ページ。セッション確立を待ち、確立後 redirect クエリへ遷移する
 * 【実装方針】: スタブ (data-foundation TASK-0016) を本実装に置換。
 *              - useSupabaseUser() watch でセッション確立を検知 (REQ-002)
 *              - 確立中は <USkeleton> 表示 (REQ-203 / NFR-202)
 *              - 確立後 navigateTo(route.query.redirect ?? '/') で遷移 (REQ-104)
 *              - Auth エラーは useLogin().notice を <UAlert> で表示 + 「ログイン画面に戻る」ボタン (EDGE-002)
 *              - Supabase 直叩き禁止 (REQ-406)、文言は locales 経由 (NFR-204)
 * 🔵 REQ-002 / REQ-104 / REQ-203 / REQ-406 / EDGE-002 / ADR-011 D1 + auth-pages-requirements.md §2.2
 */

// 【レイアウト指定】: 認証前ページは auth レイアウト（中央寄せ・ロゴのみ・ヘッダーなし）🔵 ADR-011 D1
definePageMeta({ layout: 'auth' })

// 【i18n 初期化】: 文言は locales/ja.json 経由 (NFR-204) 🔵
const { t } = useI18n()

// 【ルート取得】: redirect クエリを読み出すために useRoute() を使用 🔵
const route = useRoute()

// 【ユーザセッション監視】: OAuth コールバックで JWT cookie が確立されると値が入る 🔵
const user = useSupabaseUser()

// 【notice チャネル取得】: Auth エラーを <UAlert> に表示する (EDGE-002) 🔵
// useLogin().notice は useNoticeErrors() の ref を expose したもの。
// /confirm では login() を呼ばないため、直接 useLogin() の notice のみ取得する
const { notice } = useLogin()

/**
 * 【機能概要】: セッション確立検知 + redirect クエリへの遷移
 * 【実装方針】: watch + immediate:true で /confirm 着地時点から監視開始。
 *              user が truthy になった瞬間に navigateTo を呼ぶ (REQ-002 / REQ-104)
 * 【テスト対応】: 遷移先の二次振り分け (Group 有無 → /onboarding or 目的地) は middleware TC1〜TC7 で検証済
 * 🔵 REQ-002 / REQ-104 / auth-pages-requirements.md §2.2 / note.md §7 (redirect チェーン)
 */
watch(
  user,
  (u) => {
    if (u) {
      // 【redirect 解決】: route.query.redirect を読み、未指定時は '/' をデフォルトにする 🔵
      // route.query.redirect は string | string[] | undefined。resolveQueryParam で string に正規化する
      const redirect = resolveQueryParam(route.query.redirect, '/')

      // 【遷移実行】: 遷移先での Group 有無分岐は middleware に委譲。page 側では追加判定しない 🔵
      navigateTo(redirect)
    }
  },
  { immediate: true }
)
</script>

<template>
  <!-- 【ページルート】: auth レイアウトの <slot /> に差し込まれる -->
  <div class="w-full flex flex-col gap-6">
    <!-- 【エラー通知】: Auth エラー時に useLogin.notice を <UAlert> で表示 (EDGE-002) 🔵 -->
    <template v-if="notice">
      <UAlert
        color="error"
        variant="soft"
        :description="notice"
      />

      <!-- 【ログイン画面に戻るボタン】: EDGE-002 — エラー時の再試行導線 🔵 -->
      <UButton
        block
        color="neutral"
        variant="outline"
        :label="t('common.backToHome')"
        to="/login"
      />
    </template>

    <!-- 【ローディング表示】: セッション確立中かつエラーなしの間 <USkeleton> を表示 (REQ-203 / NFR-202) 🔵 -->
    <template v-else>
      <!-- 【処理中テキスト】: confirm.processing (NFR-204) 🔵 -->
      <p class="text-center text-sm text-muted">
        {{ t('confirm.processing') }}
      </p>
      <!-- 【スケルトン表示】: セッション確立待ちのローディング UI (REQ-203) 🔵 -->
      <USkeleton class="h-10 w-full rounded-md" />
    </template>
  </div>
</template>
