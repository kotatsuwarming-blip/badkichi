<script setup lang="ts">
/**
 * StatsShotMixScatter.vue — D 使用割合 × 球種別得点率 散布図（REQ-010, 設計2026-08-04）
 *
 * x = 使用割合%、y = その球種を打ったラリーの得点率%、点 = 球種。
 * 「よく使うのに勝てていない球種」が右下に見える。
 */
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { useChartTextColor } from '~/composables/useChartTextColor'
import type { ShotTypeStatRow } from '~/types/shot-stats'
import type { ShotType } from '~/types/shot-annotation'

const props = defineProps<{ rows: ShotTypeStatRow[] }>()

const { t } = useI18n()
const chartText = useChartTextColor()

interface Point { type: ShotType, share: number, rate: number | null, rallies: number }

const points = computed<Point[]>(() => {
  const map = new Map<ShotType, { shots: number, rallies: number, won: number }>()
  let total = 0
  for (const r of props.rows) {
    if (r.shot_type === null) continue
    total += r.shots
    let agg = map.get(r.shot_type)
    if (!agg) {
      agg = { shots: 0, rallies: 0, won: 0 }
      map.set(r.shot_type, agg)
    }
    agg.shots += r.shots
    agg.rallies += r.rallies
    agg.won += r.rallies_won
  }
  if (total === 0) return []
  return [...map.entries()].map(([type, a]) => ({
    type,
    share: (a.shots / total) * 100,
    rate: a.rallies > 0 ? (a.won / a.rallies) * 100 : null,
    rallies: a.rallies
  }))
})

const option = computed(() => ({
  tooltip: {
    trigger: 'item',
    formatter: (p: { dataIndex: number }) => {
      const pt = points.value.filter(x => x.rate !== null)[p.dataIndex]
      if (!pt) return ''
      return `${t(`annotation.shotType.${pt.type}`)}<br/>`
        + `${t('shotStats.mix.share')}: ${pt.share.toFixed(1)}%<br/>`
        + `${t('shotStats.mix.rallyRate')}: ${pt.rate!.toFixed(0)}% (n=${pt.rallies})`
    }
  },
  textStyle: { color: chartText.value, fontSize: 13 },
  grid: { left: 48, right: 24, top: 20, bottom: 44 },
  xAxis: {
    type: 'value',
    name: t('shotStats.mix.share'),
    nameLocation: 'middle',
    nameGap: 26,
    axisLabel: { color: chartText.value, fontSize: 12 },
    nameTextStyle: { color: chartText.value, fontSize: 12 }
  },
  yAxis: {
    type: 'value',
    name: t('shotStats.mix.rallyRate'),
    min: 0,
    max: 100,
    axisLabel: { color: chartText.value, fontSize: 12 },
    nameTextStyle: { color: chartText.value, fontSize: 12 }
  },
  series: [{
    type: 'scatter',
    labelLayout: { hideOverlap: true },
    symbolSize: 14,
    data: points.value.filter(p => p.rate !== null).map(p => [
      Math.round(p.share * 10) / 10, Math.round(p.rate! * 10) / 10
    ]),
    label: {
      show: true,
      position: 'top',
      fontSize: 10,
      color: chartText.value,
      formatter: (p: { dataIndex: number }) => {
        const pt = points.value.filter(x => x.rate !== null)[p.dataIndex]
        return pt ? t(`annotation.shotType.${pt.type}`) : ''
      }
    }
  }]
}))
</script>

<template>
  <div class="scatter-chart">
    <h3 class="chart-title">
      {{ $t('shotStats.mix.scatterTitle') }}
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
.scatter-chart { display: flex; flex-direction: column; gap: 0.25rem; }
.chart-title { font-size: 0.875rem; font-weight: 600; }
.chart { width: 100%; height: 300px; }
</style>
