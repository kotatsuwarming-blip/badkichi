<script setup lang="ts">
/**
 * StatsServeTypeChart.vue — C サーブ種別分析（REQ-008, 2026-08-08 #6 改訂）
 *
 * 棒 = サーブ本数 / 折れ線 = サーブ側得点率（%）のコンボ。
 * 選手は打者フィルタで絞る（親が rows を絞って渡す。未絞り込みは全員合算）。
 * サービスポジション（右 = 偶数点 / 左 = 奇数点）で絞り込み。
 */
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useChartTextColor } from '~/composables/useChartTextColor'
import type { ServePosition } from '~/types/stats-dashboard'
import type { ServeTypeStatRow } from '~/types/shot-stats'

const props = defineProps<{ rows: ServeTypeStatRow[] }>()

const { t } = useI18n()
const chartText = useChartTextColor()

const position = ref<ServePosition | null>(null)

const SERVE_TYPES = ['serve_short', 'serve_long', 'serve_drive', null] as const

const filtered = computed(() =>
  props.rows.filter(r => position.value === null || r.server_position === position.value)
)

const entries = computed(() => SERVE_TYPES.map((type) => {
  let total = 0
  let won = 0
  for (const r of filtered.value) {
    if (r.shot_type !== type) continue
    total += r.total
    won += r.won
  }
  return { type, total, won }
}))

function typeLabel(type: typeof SERVE_TYPES[number]): string {
  return type === null ? t('shotStats.endings.unannotated') : t(`annotation.shotType.${type}`)
}

const option = computed(() => ({
  tooltip: {
    trigger: 'axis',
    formatter: (params: { dataIndex: number }[]) => {
      const e = entries.value[params[0]!.dataIndex]!
      const rate = e.total === 0 ? '-' : `${Math.round((e.won / e.total) * 100)}% (${e.won}/${e.total})`
      return `${typeLabel(e.type)}<br/>${t('shotStats.combo.count')}: ${e.total}<br/>${t('shotStats.combo.rate')}: ${rate}`
    }
  },
  textStyle: { color: chartText.value, fontSize: 13 },
  legend: { bottom: 0, textStyle: { color: chartText.value, fontSize: 12 } },
  grid: { left: 48, right: 48, top: 20, bottom: 44 },
  xAxis: {
    type: 'category',
    data: SERVE_TYPES.map(typeLabel),
    axisLabel: { color: chartText.value, fontSize: 12 }
  },
  yAxis: [
    {
      type: 'value', name: t('shotStats.combo.count'), min: 0, nameGap: 12, minInterval: 1,
      axisLabel: { color: chartText.value, fontSize: 13 },
      nameTextStyle: { color: chartText.value, fontSize: 12 }
    },
    {
      type: 'value', name: '%', min: 0, max: 100, nameGap: 12,
      axisLabel: { color: chartText.value, fontSize: 13 },
      nameTextStyle: { color: chartText.value, fontSize: 12 }
    }
  ],
  series: [
    {
      name: t('shotStats.combo.count'),
      type: 'bar',
      yAxisIndex: 0,
      data: entries.value.map(e => e.total)
    },
    {
      name: t('shotStats.combo.rate'),
      type: 'line',
      yAxisIndex: 1,
      connectNulls: false,
      data: entries.value.map(e => (e.total === 0 ? null : Math.round((e.won / e.total) * 1000) / 10))
    }
  ]
}))
</script>

<template>
  <div class="serve-chart">
    <div class="serve-header">
      <h3 class="chart-title">
        {{ $t('shotStats.serve.title') }}
      </h3>
      <StatsPositionToggle
        :position="position"
        @change="position = $event"
      />
    </div>
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
.serve-chart { display: flex; flex-direction: column; gap: 0.25rem; }
.serve-header { display: flex; align-items: center; justify-content: space-between; gap: 0.5rem; flex-wrap: wrap; }
.chart-title { font-size: 0.875rem; font-weight: 600; }
.chart { width: 100%; height: 280px; }
</style>
