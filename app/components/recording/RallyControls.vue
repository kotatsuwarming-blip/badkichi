<script setup lang="ts">
/**
 * RallyControls.vue — ラリー終了の入力 (得点A/得点B/レット/スキップ)。
 * 関連: TASK-0014 / REQ-006 / REQ-102 / REQ-103 / ui-design.md
 */
import type { Team } from '~/utils/rule-engine/types'

defineProps<{
  disabled?: boolean
}>()

const emit = defineEmits<{
  point: [team: Team]
  let: []
  skip: []
}>()
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
        {{ $t('record.buttons.pointA') }}
      </UButton>
      <UButton
        block
        color="primary"
        data-testid="point-b"
        :disabled="disabled"
        @click="emit('point', 'B')"
      >
        {{ $t('record.buttons.pointB') }}
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
        {{ $t('record.buttons.let') }}
      </UButton>
      <UButton
        block
        variant="soft"
        color="neutral"
        data-testid="skip"
        :disabled="disabled"
        @click="emit('skip')"
      >
        {{ $t('record.buttons.skip') }}
      </UButton>
    </div>
  </div>
</template>

<style scoped>
.rally-controls { display: flex; flex-direction: column; gap: 0.5rem; }
.point-row, .sub-row { display: grid; grid-template-columns: 1fr 1fr; gap: 0.5rem; }
</style>
