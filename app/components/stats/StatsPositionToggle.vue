<script setup lang="ts">
/**
 * StatsPositionToggle.vue — サービスポジション選択（両方 / 右(偶) / 左(奇)）
 *
 * 選手/ペアの得点率グラフに残す唯一のドリルダウン軸（受け入れ2026-06-10）。
 */
import type { ServePosition } from '~/types/stats-dashboard'

defineProps<{ position: ServePosition | null }>()
const emit = defineEmits<{ change: [position: ServePosition | null] }>()

const OPTIONS: { value: ServePosition | null, key: string }[] = [
  { value: null, key: 'stats.position.all' },
  { value: 'right', key: 'stats.position.right' },
  { value: 'left', key: 'stats.position.left' }
]
</script>

<template>
  <div
    class="position-toggle"
    data-testid="position-toggle"
  >
    <button
      v-for="opt in OPTIONS"
      :key="opt.value ?? 'all'"
      type="button"
      class="toggle"
      :class="{ 'is-selected': position === opt.value }"
      :data-testid="`pos-${opt.value ?? 'all'}`"
      @click="emit('change', opt.value)"
    >
      {{ $t(opt.key) }}
    </button>
  </div>
</template>

<style scoped>
.position-toggle { display: flex; gap: 0.5rem; }
.toggle {
  padding: 0.25rem 0.75rem;
  border: 1px solid var(--ui-border, #d1d5db);
  border-radius: 9999px;
  font-size: 0.875rem;
  background: transparent;
  cursor: pointer;
}
.toggle.is-selected { background: var(--ui-primary, #3b82f6); color: #fff; border-color: transparent; }
</style>
