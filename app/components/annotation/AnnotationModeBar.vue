<script setup lang="ts">
/**
 * 【機能概要】: モード切替タブ + モード別進捗チップ + 「続きから」導線 (REQ-003 / REQ-013)。
 * TASK-0011 / ui-design.md AnnotationModeBar
 */
import { computed } from 'vue'
import type { AnnotationMode, AnnotationProgress } from '~/types/shot-annotation'

const props = defineProps<{
  mode: AnnotationMode
  progress: AnnotationProgress[]
}>()

const emit = defineEmits<{
  change: [mode: AnnotationMode]
  resume: [mode: AnnotationMode]
}>()

const { t } = useI18n()

const MODES: AnnotationMode[] = ['quick', 'type', 'position']

const byMode = computed(() => {
  const map = new Map(props.progress.map(p => [p.mode, p]))
  return MODES.map((mode) => {
    const p = map.get(mode)
    const total = p?.total ?? 0
    const done = p?.done ?? 0
    return {
      mode,
      done,
      total,
      percent: total === 0 ? 0 : Math.round((done / total) * 100),
      hasNext: p?.nextCursor != null
    }
  })
})
</script>

<template>
  <div class="flex flex-wrap items-center gap-2">
    <UButton
      v-for="item in byMode"
      :key="item.mode"
      :variant="item.mode === props.mode ? 'solid' : 'soft'"
      color="primary"
      size="sm"
      @click="emit('change', item.mode)"
    >
      {{ t(`annotation.mode.${item.mode}`) }}
      <UBadge
        :color="item.percent === 100 ? 'success' : 'neutral'"
        variant="subtle"
        size="sm"
      >
        {{ item.percent }}%
      </UBadge>
    </UButton>
    <UButton
      v-if="byMode.find(i => i.mode === props.mode)?.hasNext"
      variant="ghost"
      size="sm"
      icon="i-lucide-skip-forward"
      @click="emit('resume', props.mode)"
    >
      {{ t('annotation.resume') }}
    </UButton>
  </div>
</template>
