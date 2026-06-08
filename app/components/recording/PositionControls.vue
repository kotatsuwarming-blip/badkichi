<script setup lang="ts">
/**
 * PositionControls.vue — 左右入れ替わり (A入替/B入替) + 次のセットへ (決着時のみ活性)。
 * 関連: TASK-0014 / REQ-105 / REQ-107 / ui-design.md
 */
import type { Team } from '~/utils/rule-engine/types'

defineProps<{
  disabled?: boolean
  canAdvance?: boolean // セット決着時のみ「次のセットへ」を活性
}>()

const emit = defineEmits<{
  override: [team: Team]
  nextSet: []
}>()
</script>

<template>
  <div
    class="position-controls"
    data-testid="position-controls"
  >
    <div class="override-row">
      <UButton
        block
        variant="outline"
        color="neutral"
        data-testid="override-a"
        :disabled="disabled"
        @click="emit('override', 'A')"
      >
        {{ $t('record.buttons.overrideA') }}
      </UButton>
      <UButton
        block
        variant="outline"
        color="neutral"
        data-testid="override-b"
        :disabled="disabled"
        @click="emit('override', 'B')"
      >
        {{ $t('record.buttons.overrideB') }}
      </UButton>
    </div>
    <UButton
      block
      color="primary"
      variant="subtle"
      data-testid="next-set"
      :disabled="!canAdvance"
      @click="emit('nextSet')"
    >
      {{ $t('record.buttons.nextSet') }}
    </UButton>
  </div>
</template>

<style scoped>
.position-controls { display: flex; flex-direction: column; gap: 0.5rem; }
.override-row { display: grid; grid-template-columns: 1fr 1fr; gap: 0.5rem; }
</style>
