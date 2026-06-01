<script setup lang="ts">
/**
 * 【機能概要】: 認証前レイアウト — 中央寄せ・ロゴのみ・ヘッダーなし
 * 【適用ページ】: /login, /confirm (各 page 側で definePageMeta({ layout: 'auth' }) を指定)
 * 【実装方針】: ADR-011 D1 — 未ログイン画面のためユーザアバター/ログアウトは存在しない
 * 🔵 ADR-011 D1 + architecture.md §レイアウト戦略
 */
const { t } = useI18n()
</script>

<template>
  <UApp>
    <UMain class="flex min-h-screen items-center justify-center">
      <div class="flex flex-col items-center gap-8 w-full max-w-sm px-4">
        <!-- ロゴ -->
        <NuxtLink
          to="/"
          :aria-label="t('app.name')"
        >
          <AppLogo class="h-10 w-auto" />
        </NuxtLink>

        <!-- ページコンテンツ -->
        <slot />
      </div>
    </UMain>
  </UApp>
</template>
