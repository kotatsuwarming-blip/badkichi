<script setup lang="ts">
/**
 * 【機能概要】: アプリのルート。<NuxtLayout> でレイアウト (auth / default) を適用し <NuxtPage> を描画する
 * 【実装方針】: ヘッダー/フッター等の画面外枠は layouts に委譲する (ADR-011)。
 *              <UApp> はルート 1 箇所に集約し、Toast/Overlay の portal を全画面で共有する (Nuxt UI v4 規約)。
 * 🔵 ADR-011 + architecture.md §レイアウト戦略
 */
const { t } = useI18n()

useHead({
  meta: [
    { name: 'viewport', content: 'width=device-width, initial-scale=1' }
  ],
  link: [
    { rel: 'icon', href: '/favicon.ico' }
  ]
})

useSeoMeta({
  title: () => t('app.name')
})
</script>

<template>
  <UApp>
    <NuxtLayout>
      <NuxtPage />
    </NuxtLayout>
  </UApp>
</template>
