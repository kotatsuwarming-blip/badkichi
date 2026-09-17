<script setup lang="ts">
/**
 * StatsTempoChart.vue — K 展開スピード 2 軸散布図（REQ-015/016/106/107 + 改修2026-08-12）
 *
 * x = ラリー全体の平均ショット間隔 / y = 終盤 4 打の平均間隔（いずれも秒/打・小さいほど速い）。
 * 対象 = 4 打以上・全打点時刻ありのラリー。得点 = 青丸 / 失点 = 赤バツ（色+形の二重符号化）。
 * y=x の対角補助線より下 = 終盤に加速したラリー。点タップで動画ジャンプ（select emit）。
 * 押下時刻ベースの近似である旨を常設表示（REQ-107）。
 */
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { useChartTextColor } from '~/composables/useChartTextColor'
import type { TempoSample } from '~/types/shot-stats'

const props = defineProps<{
  samples: TempoSample[]
  /** 対象外になった確定ラリー数（母数併記, REQ-106） */
  excluded: number
}>()

const emit = defineEmits<{ select: [rallyId: string] }>()

const { t } = useI18n()
const chartText = useChartTextColor()

const WON_COLOR = '#3b82f6'
const LOST_COLOR = '#ef4444'
/** バツ印（塗りつぶし X 形。色だけに頼らない二重符号化） */
const CROSS_SYMBOL = 'path://M50,35 L85,0 L100,15 L65,50 L100,85 L85,100 L50,65 L15,100 L0,85 L35,50 L0,15 L15,0 Z'

/** 視点なし（entity=all）は won=null の単一系列 */
const neutral = computed(() => props.samples.every(s => s.won === null))

/** 精密（注釈時刻）/ 近似（ライブ押下時刻）の内訳（注記用, 2026-08-12） */
const preciseCount = computed(() => props.samples.filter(s => s.precise).length)

/** data = [x(全体平均), y(終盤4打), rallyId] */
function pointsOf(kind: 'won' | 'lost' | 'all'): [number, number, string][] {
  return props.samples
    .filter(s => (kind === 'all' ? true : kind === 'won' ? s.won === true : s.won === false))
    .map(s => [s.avgIntervalSec, s.last4IntervalSec, s.rallyId] as [number, number, string])
}

/** 両軸を同一スケールにして y=x 対角線を成立させる（0.5 秒刻みで切り上げ） */
const axisMax = computed(() => {
  const vals = props.samples.flatMap(s => [s.avgIntervalSec, s.last4IntervalSec])
  const max = Math.max(...vals, 0.5)
  return Math.ceil(max / 0.5) * 0.5
})

const option = computed(() => {
  const scatter = neutral.value
    ? [{
        name: t('shotStats.tempo.all'), type: 'scatter', symbolSize: 10,
        itemStyle: { color: WON_COLOR }, data: pointsOf('all')
      }]
    : [
        {
          name: t('shotStats.tempo.won'), type: 'scatter', symbolSize: 10,
          itemStyle: { color: WON_COLOR }, data: pointsOf('won')
        },
        {
          name: t('shotStats.tempo.lost'), type: 'scatter', symbol: CROSS_SYMBOL, symbolSize: 11,
          itemStyle: { color: LOST_COLOR }, data: pointsOf('lost')
        }
      ]
  return {
    tooltip: {
      trigger: 'item',
      formatter: (p: { value: [number, number, string], seriesName: string }) =>
        `${p.seriesName}<br/>${t('shotStats.tempo.axisAvg')}: ${p.value[0].toFixed(2)}<br/>`
        + `${t('shotStats.tempo.axisLast4')}: ${p.value[1].toFixed(2)}`
    },
    textStyle: { color: chartText.value, fontSize: 13 },
    legend: { top: 0, right: 0, textStyle: { color: chartText.value, fontSize: 12 } },
    grid: { left: 56, right: 16, top: 28, bottom: 48 },
    xAxis: {
      type: 'value',
      name: t('shotStats.tempo.axisAvg'),
      min: 0,
      max: axisMax.value,
      nameGap: 28,
      nameLocation: 'middle',
      axisLabel: { color: chartText.value, fontSize: 12 },
      nameTextStyle: { color: chartText.value, fontSize: 12 }
    },
    yAxis: {
      type: 'value',
      name: t('shotStats.tempo.axisLast4'),
      min: 0,
      max: axisMax.value,
      nameGap: 38,
      nameLocation: 'middle',
      axisLabel: { color: chartText.value, fontSize: 12 },
      nameTextStyle: { color: chartText.value, fontSize: 12 }
    },
    series: [
      ...scatter,
      {
        // y=x 対角補助線: 下 = 終盤に加速 / 上 = 減速
        type: 'line', silent: true, showSymbol: false, animation: false,
        lineStyle: { type: 'dashed', width: 1, opacity: 0.5 },
        itemStyle: { color: chartText.value },
        tooltip: { show: false },
        data: [[0, 0], [axisMax.value, axisMax.value]]
      }
    ]
  }
})

/** 点タップ → ラリー ID を emit（動画ジャンプはページ側, REQ-019 準拠） */
function onPointClick(params: { seriesType?: string, data?: [number, number, string] }): void {
  if (params.seriesType !== 'scatter' || !params.data) return
  emit('select', params.data[2])
}

defineExpose({ onPointClick })
</script>

<template>
  <div class="tempo-chart">
    <h3 class="chart-title">
      {{ $t('shotStats.tempo.title') }}
    </h3>
    <ClientOnly>
      <VChart
        class="chart"
        :option="option"
        autoresize
        @click="onPointClick"
      />
    </ClientOnly>
    <p
      class="tempo-note"
      data-testid="tempo-note"
    >
      {{ $t('shotStats.tempo.note', { precise: preciseCount, approx: samples.length - preciseCount, excluded }) }}
    </p>
  </div>
</template>

<style scoped>
.tempo-chart { display: flex; flex-direction: column; gap: 0.25rem; }
.chart-title { font-size: 0.875rem; font-weight: 600; }
.chart { width: 100%; height: 320px; }
.tempo-note { font-size: 0.75rem; opacity: 0.7; }
</style>
