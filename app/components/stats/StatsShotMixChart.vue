<script setup lang="ts">
/**
 * StatsShotMixChart.vue — D 球種構成比 + 球種別成果（REQ-009/010, TASK-0012）
 *
 * x = 球種、棒 = 構成比%（分母 = 注釈済み総打数）。
 * 第 2 系列で決定率・ミス率（分母 = その球種の総打数, ヒアリング2026-08-03 確定）を重ねる。
 */
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { useChartTextColor } from '~/composables/useChartTextColor'
import type { ShotTypeStatRow } from '~/types/shot-stats'
import type { ShotType } from '~/types/shot-annotation'

const props = defineProps<{ rows: ShotTypeStatRow[] }>()

const { t } = useI18n()
const chartText = useChartTextColor()

interface TypeAgg { type: ShotType, shots: number, decisive: number, miss: number }

const aggregated = computed<TypeAgg[]>(() => {
  const map = new Map<ShotType, TypeAgg>()
  for (const r of props.rows) {
    if (r.shot_type === null) continue
    let agg = map.get(r.shot_type)
    if (!agg) {
      agg = { type: r.shot_type, shots: 0, decisive: 0, miss: 0 }
      map.set(r.shot_type, agg)
    }
    agg.shots += r.shots
    agg.decisive += r.decisive_won
    agg.miss += r.miss_lost
  }
  return [...map.values()].sort((a, b) => b.shots - a.shots)
})

const totalShots = computed(() => aggregated.value.reduce((s, a) => s + a.shots, 0))
const unannotated = computed(() =>
  props.rows.filter(r => r.shot_type === null).reduce((s, r) => s + r.shots, 0)
)

const option = computed(() => ({
  tooltip: { trigger: 'axis' },
  textStyle: { color: chartText.value, fontSize: 13 },
  legend: { top: 0, type: 'scroll', textStyle: { color: chartText.value, fontSize: 12 } },
  grid: { left: 48, right: 16, top: 36, bottom: 76 },
  xAxis: {
    type: 'category',
    data: aggregated.value.map(a => t(`annotation.shotType.${a.type}`)),
    axisLabel: { color: chartText.value, fontSize: 11, rotate: 45 }
  },
  yAxis: {
    type: 'value', name: '%', min: 0, nameGap: 12,
    axisLabel: { color: chartText.value, fontSize: 13 },
    nameTextStyle: { color: chartText.value, fontSize: 12 }
  },
  series: [
    {
      name: t('shotStats.mix.share'),
      type: 'bar',
      data: aggregated.value.map(a =>
        totalShots.value === 0 ? null : Math.round((a.shots / totalShots.value) * 1000) / 10
      )
    },
    {
      name: t('shotStats.mix.decisiveRate'),
      type: 'bar',
      data: aggregated.value.map(a => (a.shots === 0 ? null : Math.round((a.decisive / a.shots) * 1000) / 10))
    },
    {
      name: t('shotStats.mix.missRate'),
      type: 'bar',
      data: aggregated.value.map(a => (a.shots === 0 ? null : Math.round((a.miss / a.shots) * 1000) / 10))
    }
  ]
}))
</script>

<template>
  <div class="mix-chart">
    <h3 class="chart-title">
      {{ $t('shotStats.mix.title') }}
    </h3>
    <p
      class="denominator"
      data-testid="mix-denominator"
    >
      {{ $t('shotStats.denominator', { n: totalShots, total: totalShots + unannotated }) }}
    </p>
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
.mix-chart { display: flex; flex-direction: column; gap: 0.25rem; }
.chart-title { font-size: 0.875rem; font-weight: 600; }
.denominator { font-size: 0.75rem; opacity: 0.7; }
.chart { width: 100%; height: 320px; }
</style>
