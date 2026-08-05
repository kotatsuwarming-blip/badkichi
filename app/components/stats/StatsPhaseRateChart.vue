<script setup lang="ts">
/**
 * StatsPhaseRateChart.vue — J 局面別得点率（REQ-013/014, TASK-0006）
 *
 * x 軸 = 序盤/中盤/終盤/接戦、series = 対象（選手/ペア）。得点率 % 棒グラフ。
 * ツールチップに母数（n）を併記（NFR-201）。
 */
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { useChartTextColor } from '~/composables/useChartTextColor'
import type { PhaseRateEntry } from '~/types/shot-stats'

const props = defineProps<{ entries: PhaseRateEntry[] }>()

const { t } = useI18n()
const chartText = useChartTextColor()

interface Cell { rate: number | null, total: number, won: number }

function cellsOf(entry: PhaseRateEntry): Cell[] {
  const base = entry.rates.map(r => ({
    rate: r.total > 0 ? r.won / r.total : null,
    total: r.total,
    won: r.won
  }))
  const clutchTotal = entry.rates.reduce((s, r) => s + r.clutchTotal, 0)
  const clutchWon = entry.rates.reduce((s, r) => s + r.clutchWon, 0)
  return [...base, { rate: clutchTotal > 0 ? clutchWon / clutchTotal : null, total: clutchTotal, won: clutchWon }]
}

const option = computed(() => {
  const labels = [
    t('shotStats.phase.early'), t('shotStats.phase.mid'),
    t('shotStats.phase.late'), t('shotStats.phase.clutch')
  ]
  return {
    tooltip: {
      trigger: 'axis',
      // 母数併記（NFR-201）: 50% (n=12)
      valueFormatter: undefined,
      formatter: (params: { seriesIndex: number, dataIndex: number, seriesName: string, marker: string }[]) =>
        params.map((p) => {
          const cell = cellsOf(props.entries[p.seriesIndex]!)[p.dataIndex]!
          const pctText = cell.rate === null ? '-' : `${Math.round(cell.rate * 100)}% (${cell.won}/${cell.total})`
          return `${p.marker} ${p.seriesName}: ${pctText}`
        }).join('<br/>')
    },
    textStyle: { color: chartText.value, fontSize: 13 },
    legend: { bottom: 0, textStyle: { color: chartText.value, fontSize: 13 } },
    grid: { left: 48, right: 16, top: 28, bottom: 44 },
    xAxis: { type: 'category', data: labels, axisLabel: { color: chartText.value, fontSize: 13, fontWeight: 500 } },
    yAxis: {
      type: 'value', name: '%', min: 0, max: 100, nameGap: 12,
      axisLabel: { color: chartText.value, fontSize: 13 },
      nameTextStyle: { color: chartText.value, fontSize: 12 }
    },
    series: props.entries.map(entry => ({
      name: entry.label,
      type: 'bar',
      data: cellsOf(entry).map(c => (c.rate === null ? null : Math.round(c.rate * 1000) / 10))
    }))
  }
})
</script>

<template>
  <div class="phase-chart">
    <h3 class="chart-title">
      {{ $t('shotStats.phase.title') }}
    </h3>
    <ClientOnly>
      <VChart
        class="chart"
        :option="option"
        autoresize
      />
    </ClientOnly>
  </div>
</template>

<style scoped>
.phase-chart { display: flex; flex-direction: column; gap: 0.25rem; }
.chart-title { font-size: 0.875rem; font-weight: 600; }
.chart { width: 100%; height: 300px; }
</style>
