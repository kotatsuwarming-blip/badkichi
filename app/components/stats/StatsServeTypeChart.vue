<script setup lang="ts">
/**
 * StatsServeTypeChart.vue — C サーブ種別 × 得点率（REQ-008, TASK-0011）
 *
 * serve 3 種（+ 未注釈）ごとのサーブ側得点率をサーバー別の棒で表示。
 * サービスポジション（右=偶数点/左=奇数点）で絞り込み（StatsPositionToggle 再利用）。
 */
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useChartTextColor } from '~/composables/useChartTextColor'
import type { ServePosition } from '~/types/stats-dashboard'
import type { ServeTypeStatRow } from '~/types/shot-stats'

const props = defineProps<{
  rows: ServeTypeStatRow[]
  nameOf: (id: string) => string
}>()

const { t } = useI18n()
const chartText = useChartTextColor()

const position = ref<ServePosition | null>(null)

const SERVE_TYPES = ['serve_short', 'serve_long', 'serve_drive', null] as const

const filtered = computed(() =>
  props.rows.filter(r => position.value === null || r.server_position === position.value)
)

const servers = computed(() =>
  [...new Set(filtered.value.map(r => r.server_player_id))]
    .sort((a, b) => props.nameOf(a).localeCompare(props.nameOf(b), 'ja'))
)

function cell(server: string, type: typeof SERVE_TYPES[number]): { total: number, won: number } {
  let total = 0
  let won = 0
  for (const r of filtered.value) {
    if (r.server_player_id !== server || r.shot_type !== type) continue
    total += r.total
    won += r.won
  }
  return { total, won }
}

function typeLabel(type: typeof SERVE_TYPES[number]): string {
  return type === null ? t('shotStats.endings.unannotated') : t(`annotation.shotType.${type}`)
}

const option = computed(() => ({
  tooltip: {
    trigger: 'axis',
    formatter: (params: { seriesName: string, dataIndex: number, marker: string, seriesIndex: number }[]) =>
      params.map((p) => {
        const c = cell(servers.value[p.seriesIndex]!, SERVE_TYPES[p.dataIndex]!)
        const text = c.total === 0 ? '-' : `${Math.round((c.won / c.total) * 100)}% (${c.won}/${c.total})`
        return `${p.marker} ${p.seriesName}: ${text}`
      }).join('<br/>')
  },
  textStyle: { color: chartText.value, fontSize: 13 },
  legend: { bottom: 0, textStyle: { color: chartText.value, fontSize: 12 } },
  grid: { left: 48, right: 16, top: 20, bottom: 44 },
  xAxis: {
    type: 'category',
    data: SERVE_TYPES.map(typeLabel),
    axisLabel: { color: chartText.value, fontSize: 12 }
  },
  yAxis: {
    type: 'value', name: '%', min: 0, max: 100, nameGap: 12,
    axisLabel: { color: chartText.value, fontSize: 13 },
    nameTextStyle: { color: chartText.value, fontSize: 12 }
  },
  series: servers.value.map(server => ({
    name: props.nameOf(server),
    type: 'bar',
    data: SERVE_TYPES.map((type) => {
      const c = cell(server, type)
      return c.total === 0 ? null : Math.round((c.won / c.total) * 1000) / 10
    })
  }))
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
