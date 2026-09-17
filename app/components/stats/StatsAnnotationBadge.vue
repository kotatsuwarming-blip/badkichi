<script setup lang="ts">
/**
 * StatsAnnotationBadge — 注釈率バッジ（REQ-003, TASK-0004）
 *
 * スコープ合計の注釈率（決着/種別/打点/F・B/時刻）をチップで並べる。
 * 部分注釈が正常状態のため、どのパスがどれだけ埋まっているかを常に明示する（NFR-201）。
 */
import { computed } from 'vue'
import type { AnnotationCoverageRow } from '~/types/shot-stats'
import { coverageRate } from '~/utils/shot-stats/coverage'

const props = defineProps<{ summary: AnnotationCoverageRow }>()

function pct(numerator: number, denominator: number): string {
  const rate = coverageRate(numerator, denominator)
  return rate === null ? '-' : `${Math.round(rate * 100)}%`
}

const items = computed(() => [
  { key: 'ended', label: 'shotStats.badge.ended', value: pct(props.summary.rallies_ended, props.summary.rallies_total) },
  { key: 'typed', label: 'shotStats.badge.typed', value: pct(props.summary.shots_typed, props.summary.shots_total) },
  { key: 'pointed', label: 'shotStats.badge.pointed', value: pct(props.summary.shots_pointed, props.summary.shots_total) },
  { key: 'handed', label: 'shotStats.badge.handed', value: pct(props.summary.shots_handed, props.summary.shots_total) },
  { key: 'timed', label: 'shotStats.badge.timed', value: pct(props.summary.rallies_fully_timed, props.summary.rallies_total) }
])
</script>

<template>
  <div
    class="annotation-badges"
    data-testid="annotation-badges"
  >
    <span
      v-for="item in items"
      :key="item.key"
      class="badge"
      :data-testid="`badge-${item.key}`"
    >
      {{ $t(item.label) }} {{ item.value }}
    </span>
  </div>
</template>

<style scoped>
.annotation-badges { display: flex; flex-wrap: wrap; gap: 0.375rem; }
.badge {
  font-size: 0.75rem;
  padding: 0.125rem 0.5rem;
  border-radius: 9999px;
  background: var(--ui-bg-elevated, rgba(128, 128, 128, 0.12));
  color: var(--ui-text-muted, inherit);
  white-space: nowrap;
}
</style>
