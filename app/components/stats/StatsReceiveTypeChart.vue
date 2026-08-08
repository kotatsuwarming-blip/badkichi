<script setup lang="ts">
/**
 * StatsReceiveTypeChart.vue — サーブレシーブ種別 × 得点率（2026-08-08 #5）
 *
 * サーブ種別チャートと対になる 2 打目専用の分析。レシーバー別・レシーブ種別
 * （receive_long / receive_drive / receive_short + 未注釈）ごとのレシーブ側得点率。
 * サーブ位置（右 = 偶数点 / 左 = 奇数点）で絞り込み。
 */
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useChartTextColor } from '~/composables/useChartTextColor'
import type { ServePosition } from '~/types/stats-dashboard'
import type { ReceiveTypeStatRow } from '~/types/shot-stats'

const props = defineProps<{
  rows: ReceiveTypeStatRow[]
  nameOf: (id: string) => string
}>()

const { t } = useI18n()
const chartText = useChartTextColor()

const position = ref<ServePosition | null>(null)

const RECEIVE_TYPES = ['receive_long', 'receive_drive', 'receive_short', null] as const

const filtered = computed(() =>
  props.rows.filter(r => position.value === null || r.server_position === position.value)
)

const receivers = computed(() =>
  [...new Set(filtered.value.map(r => r.receiver_player_id))]
    .sort((a, b) => props.nameOf(a).localeCompare(props.nameOf(b), 'ja'))
)

function cell(receiver: string, type: typeof RECEIVE_TYPES[number]): { total: number, won: number } {
  let total = 0
  let won = 0
  for (const r of filtered.value) {
    if (r.receiver_player_id !== receiver || r.shot_type !== type) continue
    total += r.total
    won += r.won
  }
  return { total, won }
}

function typeLabel(type: typeof RECEIVE_TYPES[number]): string {
  return type === null ? t('shotStats.endings.unannotated') : t(`annotation.shotType.${type}`)
}

const option = computed(() => ({
  tooltip: {
    trigger: 'axis',
    formatter: (params: { seriesName: string, dataIndex: number, marker: string, seriesIndex: number }[]) =>
      params.map((p) => {
        const c = cell(receivers.value[p.seriesIndex]!, RECEIVE_TYPES[p.dataIndex]!)
        const text = c.total === 0 ? '-' : `${Math.round((c.won / c.total) * 100)}% (${c.won}/${c.total})`
        return `${p.marker} ${p.seriesName}: ${text}`
      }).join('<br/>')
  },
  textStyle: { color: chartText.value, fontSize: 13 },
  legend: { bottom: 0, type: 'scroll', textStyle: { color: chartText.value, fontSize: 12 } },
  grid: { left: 48, right: 16, top: 20, bottom: 44 },
  xAxis: {
    type: 'category',
    data: RECEIVE_TYPES.map(typeLabel),
    axisLabel: { color: chartText.value, fontSize: 12 }
  },
  yAxis: {
    type: 'value', name: '%', min: 0, max: 100, nameGap: 12,
    axisLabel: { color: chartText.value, fontSize: 13 },
    nameTextStyle: { color: chartText.value, fontSize: 12 }
  },
  series: receivers.value.map(receiver => ({
    name: props.nameOf(receiver),
    type: 'bar',
    data: RECEIVE_TYPES.map((type) => {
      const c = cell(receiver, type)
      return c.total === 0 ? null : Math.round((c.won / c.total) * 1000) / 10
    })
  }))
}))
</script>

<template>
  <div class="receive-chart">
    <div class="receive-header">
      <h3 class="chart-title">
        {{ $t('shotStats.receive.title') }}
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
.receive-chart { display: flex; flex-direction: column; gap: 0.25rem; }
.receive-header { display: flex; align-items: center; justify-content: space-between; gap: 0.5rem; flex-wrap: wrap; }
.chart-title { font-size: 0.875rem; font-weight: 600; }
.chart { width: 100%; height: 280px; }
</style>
