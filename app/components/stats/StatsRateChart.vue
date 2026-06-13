<script setup lang="ts">
/**
 * StatsRateChart.vue — サービス/レシーブ得点率チャート（選手別 / ペア別）
 *
 * 棒クリックで select を emit（クロスフィルタ起点）。母数併記（NFR-201）、母数0は「-」（EDGE-001）。
 * チーム A/B は軸にしない（選手 / ペア＝player_id, ヒアリング2026-06-09）。
 *
 * 関連設計: docs/design/stats-dashboard/{interfaces.ts,dataflow.md}
 * 関連要件: REQ-003 / REQ-004 / REQ-012 / NFR-201 / REQ-406
 */
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import type { PairRate, PlayerRate, StatsRole } from '~/types/stats-dashboard'

const props = defineProps<{
  entries: (PlayerRate | PairRate)[]
  mode: 'player' | 'pair'
  /** ドリルダウン中の役割。指定すると非選択系列を薄く表示（受け入れ2026-06-10） */
  selectedRole?: StatsRole | null
}>()

const emit = defineEmits<{
  select: [payload: { playerId?: string, pair?: { player1Id: string, player2Id: string }, role: StatsRole }]
}>()

const { t } = useI18n()

function labelOf(e: PlayerRate | PairRate): string {
  return props.mode === 'pair' ? (e as PairRate).pairLabel : (e as PlayerRate).playerName
}

function pct(rate: number | null): number | null {
  return rate === null ? null : Math.round(rate * 100)
}

const option = computed(() => {
  const labels = props.entries.map(labelOf)
  const serve = props.entries.map(e => pct(e.serve.rate))
  const receive = props.entries.map(e => pct(e.receive.rate))
  const serveDen = props.entries.map(e => e.serve.denominator)
  const receiveDen = props.entries.map(e => e.receive.denominator)

  return {
    tooltip: {
      trigger: 'item',
      formatter: (p: { seriesIndex: number, dataIndex: number, value: number | null, seriesName: string, name: string }) => {
        const den = (p.seriesIndex === 0 ? serveDen : receiveDen)[p.dataIndex]
        const rate = p.value === null || p.value === undefined
          ? t('stats.rate.noData')
          : t('stats.rate.withCount', { rate: p.value, n: den })
        return `${p.name}<br/>${p.seriesName}: ${rate}`
      }
    },
    legend: { data: [t('stats.rate.serve'), t('stats.rate.receive')] },
    grid: { left: 40, right: 16, top: 32, bottom: 24 },
    xAxis: { type: 'category', data: labels },
    yAxis: { type: 'value', min: 0, max: 100 },
    series: [
      { name: t('stats.rate.serve'), type: 'bar', data: serve, itemStyle: { opacity: roleOpacity('serve') } },
      { name: t('stats.rate.receive'), type: 'bar', data: receive, itemStyle: { opacity: roleOpacity('receive') } }
    ]
  }
})

// 選択中の役割は不透明、非選択は薄く（受け入れ2026-06-10）。未選択時は両方不透明。
function roleOpacity(role: StatsRole): number {
  if (!props.selectedRole) return 1
  return props.selectedRole === role ? 1 : 0.3
}

// 棒クリック → 選択（seriesIndex 0=serve / 1=receive、dataIndex=エンティティ）
function onChartClick(params: { seriesIndex: number, dataIndex: number }): void {
  const e = props.entries[params.dataIndex]
  if (!e) return
  const role: StatsRole = params.seriesIndex === 0 ? 'serve' : 'receive'
  if (props.mode === 'pair') {
    const pe = e as PairRate
    emit('select', { pair: { player1Id: pe.player1Id, player2Id: pe.player2Id }, role })
  } else {
    emit('select', { playerId: (e as PlayerRate).playerId, role })
  }
}

defineExpose({ onChartClick })
</script>

<template>
  <div
    class="stats-rate-chart"
    data-testid="stats-rate-chart"
  >
    <ClientOnly>
      <VChart
        class="chart"
        :option="option"
        autoresize
        @click="onChartClick"
      />
    </ClientOnly>
  </div>
</template>

<style scoped>
.stats-rate-chart { width: 100%; }
.chart { width: 100%; height: 280px; }
</style>
