<script setup lang="ts">
import * as Sentry from '@sentry/nuxt'
import type { NuxtError } from '#app'

const props = defineProps<{ error: NuxtError }>()

const { t } = useI18n()

onMounted(() => {
  // グローバルフォールバック (Nuxt UI チャネル #5)。想定外例外 (undefined 参照 / Hydration mismatch 等)
  // のみここに到達する。想定エラー (INVITATION_* / NOT_A_MEMBER / ALREADY_IN_GROUP 等) は
  // domain composable が form/notice/toast チャネルで表示済のため error.vue には来ない。
  // → ここでの captureException は「想定外例外のみ」報告する (NFR-304)。
  // ユーザ操作起因の想定エラーは送信しない。unmapped 識別子の報告は useErrorMessage (TASK-0007) 側で行う。
  Sentry.captureException(props.error)
})

// 全画面置換フォールバックからの復帰動線 (clearError でエラー状態を解除しトップへ)
function handleBackToHome() {
  clearError({ redirect: '/' })
}
</script>

<template>
  <UApp>
    <UContainer class="min-h-screen flex items-center justify-center py-12">
      <UCard class="w-full max-w-md">
        <template #header>
          <div class="flex items-center gap-3">
            <UIcon
              name="i-lucide-triangle-alert"
              class="text-error size-6 shrink-0"
            />
            <h1 class="text-lg font-semibold">
              {{ t('errors.generic') }}
            </h1>
          </div>
        </template>

        <p
          v-if="error.statusCode"
          class="text-sm text-muted"
        >
          {{ error.statusCode }}
        </p>

        <template #footer>
          <UButton
            color="primary"
            block
            @click="handleBackToHome"
          >
            {{ t('common.backToHome') }}
          </UButton>
        </template>
      </UCard>
    </UContainer>
  </UApp>
</template>
