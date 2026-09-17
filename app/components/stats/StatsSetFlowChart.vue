<script setup lang="ts">
/**
 * StatsSetFlowChart.vue — L セット推移（スコアワーム, REQ-017/018/019, TASK-0008）
 *
 * x = ラリー順、y = 視点チームの得点差の階段折れ線。3 連続以上の連取/連失は markArea 帯、
 * 11 点インターバル明けの位置に markLine。点タップで select を emit（動画ジャンプは親が担当）。
 */
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { useChartTextColor } from '~/composables/useChartTextColor'
import { detectRuns, intervalMarkIndex, maxRunLength } from '~/utils/shot-stats/momentum'
import type { WormPoint } from '~/types/shot-stats'

const props = defineProps<{ points: WormPoint[] }>()

const emit = defineEmits<{ select: [point: WormPoint] }>()

const { t } = useI18n()
const chartText = useChartTextColor()

const runs = computed(() => detectRuns(props.points))
const intervalIndex = computed(() => intervalMarkIndex(props.points))
const maxWon = computed(() => maxRunLength(props.points, 'won'))
const maxLost = computed(() => maxRunLength(props.points, 'lost'))

const option = computed(() => ({
  tooltip: {
    trigger: 'axis',
    // タップ/ホバーでその時点のスコアを表示（REQ-019）
    formatter: (params: { dataIndex: number }[]) => {
      const p = props.points[params[0]!.dataIndex]
      if (!p) return ''
      return `#${p.rallyNumber} ${p.scoreA}-${p.scoreB}（${t('shotStats.flow.diff')}: ${p.diff > 0 ? '+' : ''}${p.diff}）`
    }
  },
  textStyle: { color: chartText.value, fontSize: 13 },
  grid: { left: 40, right: 16, top: 20, bottom: 32 },
  xAxis: {
    type: 'category',
    data: props.points.map(p => `${p.rallyNumber}`),
    axisLabel: { color: chartText.value, fontSize: 12 }
  },
  yAxis: {
    type: 'value',
    name: t('shotStats.flow.diff'),
    nameGap: 12,
    axisLabel: { color: chartText.value, fontSize: 13 },
    nameTextStyle: { color: chartText.value, fontSize: 12 },
    splitLine: { show: true }
  },
  series: [{
    name: t('shotStats.flow.title'),
    type: 'line',
    step: 'end',
    symbolSize: 7,
    data: props.points.map(p => p.diff),
    // 連取/連失帯（REQ-018）: won=薄緑 / lost=薄赤
    markArea: {
      silent: true,
      data: runs.value.map(r => ([
        { xAxis: `${props.points[r.startIndex]!.rallyNumber}`, itemStyle: { color: r.kind === 'won' ? 'rgba(34,197,94,0.14)' : 'rgba(239,68,68,0.14)' } },
        { xAxis: `${props.points[r.endIndex]!.rallyNumber}` }
      ]))
    },
    // 11 点インターバル目印（REQ-018）
    markLine: intervalIndex.value === null
      ? undefined
      : {
          silent: true,
          symbol: 'none',
          label: { formatter: t('shotStats.flow.interval'), color: chartText.value, fontSize: 11 },
          data: [{ xAxis: `${props.points[intervalIndex.value]!.rallyNumber}` }]
        }
  }]
}))

/** チャートクリック → 該当ラリーを emit（動画ジャンプ + テーブル連動は親, REQ-019） */
function onChartClick(params: { dataIndex?: number }): void {
  if (typeof params.dataIndex !== 'number') return
  const p = props.points[params.dataIndex]
  if (p) emit('select', p)
}

defineExpose({ onChartClick })
</script>

<template>
  <div class="set-flow-chart">
    <div class="flow-header">
      <h3 class="chart-title">
        {{ $t('shotStats.flow.title') }}
      </h3>
      <span
        class="run-note"
        data-testid="run-note"
      >
        {{ $t('shotStats.flow.maxRuns', { won: maxWon, lost: maxLost }) }}
      </span>
    </div>
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
.set-flow-chart { display: flex; flex-direction: column; gap: 0.25rem; }
.flow-header { display: flex; align-items: center; justify-content: space-between; gap: 0.5rem; flex-wrap: wrap; }
.chart-title { font-size: 0.875rem; font-weight: 600; }
.run-note { font-size: 0.75rem; opacity: 0.7; }
.chart { width: 100%; height: 280px; }
</style>
