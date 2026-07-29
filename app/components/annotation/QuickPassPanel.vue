<script setup lang="ts">
/**
 * 【機能概要】: クイックパスの入力パネル。end_reason → 落下点 → 決定打種別のステップ UI。
 * TASK-0011 / REQ-004 / REQ-005 / REQ-006 / REQ-102 / ui-design.md モード1
 */
import { QUICK_REASON_KEYS } from '~/composables/useQuickPass'
import type { UseQuickPassReturn } from '~/composables/useQuickPass'

const props = defineProps<{
  quick: UseQuickPassReturn
}>()

const emit = defineEmits<{
  replay: []
}>()

const { t } = useI18n()
const OUT_DIRECTIONS = ['side', 'back', 'both'] as const
</script>

<template>
  <div class="space-y-3">
    <UAlert
      v-if="props.quick.consistencyWarning.value"
      color="warning"
      variant="subtle"
      icon="i-lucide-triangle-alert"
      :title="t('annotation.quick.consistencyWarning')"
    />
    <UAlert
      v-if="props.quick.landingWarning.value"
      color="warning"
      variant="subtle"
      icon="i-lucide-triangle-alert"
      :title="t('annotation.quick.landingWarning')"
    />

    <div
      v-if="props.quick.isDone.value"
      class="text-sm text-neutral-500"
    >
      {{ t('annotation.modeDone') }}
    </div>

    <template v-else-if="props.quick.step.value === 'reason'">
      <div class="flex items-center gap-2">
        <p class="text-sm font-medium">
          {{ t('annotation.quick.prompt') }}
        </p>
        <UButton
          variant="ghost"
          size="xs"
          icon="i-lucide-rotate-cw"
          @click="emit('replay')"
        >
          {{ t('annotation.quick.replay') }}
        </UButton>
      </div>
      <!-- PC は縦一列 + キー表示 (数字キーで直接入力可)、スマホは2列グリッド -->
      <div class="grid grid-cols-2 gap-2 lg:grid-cols-1 lg:max-w-xs">
        <UButton
          v-for="[key, reason] in QUICK_REASON_KEYS"
          :key="reason"
          variant="soft"
          color="neutral"
          class="justify-start"
          @click="props.quick.selectEndReason(reason)"
        >
          <UKbd class="hidden lg:inline-flex">
            {{ key }}
          </UKbd>
          {{ t(`annotation.quick.reason.${reason}`) }}
        </UButton>
      </div>
    </template>

    <template v-else-if="props.quick.step.value === 'landing'">
      <p class="text-sm font-medium">
        {{ t('annotation.quick.landingPrompt') }}
      </p>
      <AnnotationCourtDiagramInput
        :marker="props.quick.currentRally.value && props.quick.currentRally.value.landX !== null
          ? { x: props.quick.currentRally.value.landX, y: props.quick.currentRally.value.landY ?? 0 }
          : null"
        @select="props.quick.setLanding($event)"
      />
      <UButton
        variant="ghost"
        size="sm"
        @click="props.quick.skipLanding()"
      >
        {{ t('annotation.quick.skipLanding') }}
      </UButton>
    </template>

    <template v-else-if="props.quick.step.value === 'outDirection'">
      <p class="text-sm font-medium">
        {{ t('annotation.quick.outDirectionPrompt') }}
      </p>
      <div class="flex gap-2">
        <UButton
          v-for="direction in OUT_DIRECTIONS"
          :key="direction"
          variant="soft"
          color="neutral"
          @click="props.quick.selectOutDirection(direction)"
        >
          {{ t(`annotation.quick.outDirection.${direction}`) }}
        </UButton>
      </div>
    </template>
  </div>
</template>
