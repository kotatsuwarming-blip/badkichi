<script setup lang="ts">
/**
 * RallyControls.vue — ラリー終了の入力 (得点A/得点B/レット/スキップ)。
 * キーボード (スペース周辺): 得点A=V / 得点B=N / レット=C / スキップ=M。
 * 関連: TASK-0014 / REQ-006 / REQ-102 / REQ-103 / NFR-201 / ui-design.md
 */
import { onBeforeUnmount, onMounted } from 'vue'
import type { Team } from '~/utils/rule-engine/types'

const props = defineProps<{
  disabled?: boolean
}>()

const emit = defineEmits<{
  point: [team: Team]
  let: []
  skip: []
}>()

function onKeydown(e: KeyboardEvent) {
  if (props.disabled) return
  const target = e.target as HTMLElement | null
  if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) return
  const map: Record<string, () => void> = {
    KeyV: () => emit('point', 'A'),
    KeyN: () => emit('point', 'B'),
    KeyC: () => emit('let'),
    KeyM: () => emit('skip')
  }
  const action = map[e.code]
  if (action) {
    e.preventDefault()
    e.stopPropagation()
    action()
  }
}

onMounted(() => window.addEventListener('keydown', onKeydown, true))
onBeforeUnmount(() => window.removeEventListener('keydown', onKeydown, true))
</script>

<template>
  <div
    class="rally-controls"
    data-testid="rally-controls"
  >
    <div class="point-row">
      <UButton
        block
        color="primary"
        data-testid="point-a"
        :disabled="disabled"
        @click="emit('point', 'A')"
      >
        {{ $t('record.buttons.pointA') }} (V)
      </UButton>
      <UButton
        block
        color="primary"
        data-testid="point-b"
        :disabled="disabled"
        @click="emit('point', 'B')"
      >
        {{ $t('record.buttons.pointB') }} (N)
      </UButton>
    </div>
    <div class="sub-row">
      <UButton
        block
        variant="soft"
        color="neutral"
        data-testid="let"
        :disabled="disabled"
        @click="emit('let')"
      >
        {{ $t('record.buttons.let') }} (C)
      </UButton>
      <UButton
        block
        variant="soft"
        color="neutral"
        data-testid="skip"
        :disabled="disabled"
        @click="emit('skip')"
      >
        {{ $t('record.buttons.skip') }} (M)
      </UButton>
    </div>
  </div>
</template>

<style scoped>
.rally-controls { display: flex; flex-direction: column; gap: 0.5rem; }
.point-row, .sub-row { display: grid; grid-template-columns: 1fr 1fr; gap: 0.5rem; }
</style>
