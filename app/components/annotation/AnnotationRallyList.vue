<script setup lang="ts">
/**
 * 【機能概要】: ラリー一覧。モード別の注釈済みマークを表示し、クリックで任意位置へ
 *             戻って上書きできる (訂正の主手段、REQ-108)。
 * TASK-0011 / ui-design.md AnnotationRallyList
 */
import type { AnnotationRally, AnnotationShot } from '~/types/shot-annotation'

const props = defineProps<{
  rallies: AnnotationRally[]
  shotsOf: (rallyId: string) => AnnotationShot[]
  activeRallyId: string | null
}>()

const emit = defineEmits<{
  jump: [rally: AnnotationRally]
}>()

const { t } = useI18n()

function marks(rally: AnnotationRally): string {
  const shots = props.shotsOf(rally.id)
  const quick = rally.endReason !== null
  const type = shots.length > 0 && shots.every(s => s.shotType !== null)
  const position = shots.length > 0 && shots.every(s => s.hitX !== null)
  return [quick, type, position].map(done => (done ? '●' : '○')).join('')
}
</script>

<template>
  <div class="space-y-1">
    <p class="text-xs font-medium text-neutral-500">
      {{ t('annotation.rallyList.title') }}
    </p>
    <div class="flex flex-wrap gap-1.5">
      <UButton
        v-for="rally in props.rallies"
        :key="rally.id"
        :variant="rally.id === props.activeRallyId ? 'solid' : 'soft'"
        color="neutral"
        size="xs"
        @click="emit('jump', rally)"
      >
        {{ t('annotation.rallyList.rally', { set: rally.setNumber, n: rally.rallyNumber }) }}
        <span class="font-mono text-[10px]">{{ marks(rally) }}</span>
      </UButton>
    </div>
  </div>
</template>
