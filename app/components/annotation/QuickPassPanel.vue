<script setup lang="ts">
/**
 * 【機能概要】: クイックパスの入力パネル。end_reason → 落下点 → 決定打種別のステップ UI。
 * TASK-0011 / REQ-004 / REQ-005 / REQ-006 / REQ-102 / ui-design.md モード1
 */
import type { UseQuickPassReturn } from '~/composables/useQuickPass'
import { END_REASONS, SHOT_TYPES } from '~/types/shot-annotation'

const props = defineProps<{
  quick: UseQuickPassReturn
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
      <p class="text-sm font-medium">
        {{ t('annotation.quick.prompt') }}
      </p>
      <div class="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <UButton
          v-for="reason in END_REASONS"
          :key="reason"
          variant="soft"
          color="neutral"
          block
          @click="props.quick.selectEndReason(reason)"
        >
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

    <template v-else-if="props.quick.step.value === 'decisive'">
      <p class="text-sm font-medium">
        {{ t('annotation.quick.decisivePrompt') }}
      </p>
      <div class="grid grid-cols-2 gap-1.5 sm:grid-cols-4">
        <UButton
          v-for="type in SHOT_TYPES"
          :key="type"
          variant="soft"
          color="neutral"
          size="xs"
          block
          @click="props.quick.setDecisiveType(type)"
        >
          {{ t(`annotation.shotType.${type}`) }}
        </UButton>
      </div>
      <UButton
        variant="ghost"
        size="sm"
        @click="props.quick.skipDecisive()"
      >
        {{ t('annotation.quick.skipDecisive') }}
      </UButton>
    </template>
  </div>
</template>
