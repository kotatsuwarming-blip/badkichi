<script setup lang="ts">
/**
 * StatsShotHeatmap.vue — F 配球ヒートマップ（REQ-011, TASK-0012）
 *
 * 選手視点固定・3×3 ゾーンの打点密度（ミラー・クランプは RPC 側で適用済み）。
 * 打者・球種の絞り込みは親（useShotStatsView）のクライアントフィルタに連動。
 */
import type { ZoneCell } from '~/types/shot-stats'

defineProps<{
  cells: ZoneCell[]
  /** 表示中の打点総数（母数併記, NFR-201） */
  total: number
  /** スコープ全体の打点注釈数（分母） */
  pointedTotal: number
}>()
</script>

<template>
  <div class="heatmap">
    <h3 class="chart-title">
      {{ $t('shotStats.heatmap.title') }}
    </h3>
    <p
      class="denominator"
      data-testid="heatmap-denominator"
    >
      {{ $t('shotStats.denominator', { n: total, total: pointedTotal }) }}
    </p>
    <StatsCourtZones :cells="cells" />
    <p class="hint">
      {{ $t('shotStats.heatmap.hint') }}
    </p>
  </div>
</template>

<style scoped>
.heatmap { display: flex; flex-direction: column; gap: 0.5rem; }
.chart-title { font-size: 0.875rem; font-weight: 600; }
.denominator { font-size: 0.75rem; opacity: 0.7; }
.hint { font-size: 0.75rem; opacity: 0.6; }
</style>
