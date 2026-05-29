<!-- app/pages/confirm.vue
     data-foundation 単位の最小スタブ。auth-onboarding 単位で本実装（オンボーディング画面・エラー
     ハンドリング・初回 Group 参加導線）に置換する。
     現状の責務: Google OAuth callback 後の認証成立を待ってホームへリダイレクトするだけ。 -->
<script setup lang="ts">
const user = useSupabaseUser()

watch(
  user,
  (u) => {
    if (u) {
      navigateTo('/')
    }
  },
  { immediate: true }
)
</script>

<template>
  <div>Signing in...</div>
</template>
