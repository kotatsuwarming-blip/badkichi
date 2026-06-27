<script setup lang="ts">
/**
 * Guide.vue — 記録画面の「記録のしかた」初回ガイド (モーダル)。
 *
 * 背景: usability-test-01 (U-01)。記録モデル (1打ごとに【打った】→結果で確定) が
 *       伝わらず詰まった。初回だけ自動表示し、以降はヘッダの [?] から再表示する。
 * 方針: presentational。開閉は親が v-model:open で制御 (「見た」印の永続化は親 record.vue)。
 *       文言は record.guide.* に集約 (川島の詰まりに 1:1 対応)。
 */
import { useI18n } from 'vue-i18n'

defineProps<{ open: boolean }>()
const emit = defineEmits<{ 'update:open': [value: boolean] }>()

const { t } = useI18n()
</script>

<template>
  <UModal
    :open="open"
    :title="t('record.guide.title')"
    @update:open="emit('update:open', $event)"
  >
    <template #content>
      <div
        class="guide"
        data-testid="record-guide"
      >
        <h2 class="guide-title">
          {{ t('record.guide.title') }}
        </h2>
        <p class="guide-intro">
          {{ t('record.guide.intro') }}
        </p>

        <section class="guide-step">
          <h3>{{ t('record.guide.step1Title') }}</h3>
          <p>{{ t('record.guide.step1Body') }}</p>
          <p class="guide-tip">
            👉 {{ t('record.guide.step1Tempo') }}
          </p>
        </section>

        <section class="guide-step">
          <h3>{{ t('record.guide.step2Title') }}</h3>
          <ul>
            <li>{{ t('record.guide.step2Point') }}</li>
            <li>{{ t('record.guide.step2Let') }}</li>
            <li>{{ t('record.guide.step2Skip') }}</li>
          </ul>
          <p>{{ t('record.guide.step2Next') }}</p>
        </section>

        <section class="guide-step">
          <h3>{{ t('record.guide.step3') }}</h3>
        </section>

        <section class="guide-step">
          <h3>{{ t('record.guide.step4Title') }}</h3>
          <p>{{ t('record.guide.step4Body') }}</p>
        </section>

        <p class="guide-legend">
          {{ t('record.guide.legend') }}
        </p>

        <div class="guide-actions">
          <UButton
            color="primary"
            data-testid="record-guide-start"
            @click="emit('update:open', false)"
          >
            {{ t('record.guide.start') }}
          </UButton>
        </div>
      </div>
    </template>
  </UModal>
</template>

<style scoped>
.guide { display: flex; flex-direction: column; gap: 0.75rem; padding: 1.25rem; max-height: 80vh; overflow-y: auto; }
.guide-title { font-size: 1.125rem; font-weight: 700; }
.guide-intro { font-size: 0.875rem; color: var(--ui-text-muted); }
.guide-step { display: flex; flex-direction: column; gap: 0.25rem; }
.guide-step h3 { font-weight: 700; font-size: 0.9375rem; }
.guide-step ul { margin: 0; padding-left: 1.1rem; display: flex; flex-direction: column; gap: 0.125rem; }
.guide-step li { font-size: 0.875rem; }
.guide-step p { font-size: 0.875rem; }
.guide-tip { color: var(--ui-text-muted); }
.guide-legend { font-size: 0.8125rem; color: var(--ui-text-muted); border-top: 1px solid var(--ui-border); padding-top: 0.5rem; }
.guide-actions { display: flex; justify-content: flex-end; margin-top: 0.25rem; }
</style>
