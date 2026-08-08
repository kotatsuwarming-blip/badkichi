<script setup lang="ts">
/**
 * StatsTempoChart.vue — K 展開スピード分布（REQ-015/016/106/107, TASK-0007）
 *
 * テンポを連続値のまま散布図（ストリッププロット）で表示し、得点/失点ラリーを
 * 縦位置と色で重ねて比較する（ビン分けしない, ヒアリング2026-08-03）。
 * measure トグル: 平均テンポ（打/秒・大きいほど速い）⇄ 終盤テンポ（秒・小さいほど速い）。
 * 押下時刻ベースの近似である旨を常設表示（REQ-107）。
 */
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { useChartTextColor } from '~/composables/useChartTextColor'
import { tempoValueOf } from '~/utils/shot-stats/tempo'
import type { TempoMeasure, TempoSample } from '~/types/shot-stats'

const props = defineProps<{
  samples: TempoSample[]
  /** 対象外になった確定ラリー数（母数併記, REQ-106） */
  excluded: number
  measure: TempoMeasure
}>()

const emit = defineEmits<{ 'update:measure': [measure: TempoMeasure] }>()

const { t } = useI18n()
const chartText = useChartTextColor()

/** 視点なし（entity=all）は won=null の単一系列 */
const neutral = computed(() => props.samples.every(s => s.won === null))

function pointsOf(kind: 'won' | 'lost' | 'all'): [number, number][] {
  return props.samples
    .filter(s => (kind === 'all' ? true : kind === 'won' ? s.won === true : s.won === false))
    .map((s) => {
      const v = tempoValueOf(s, props.measure)
      if (v === null) return null
      // y はカテゴリ行 + 微小ジッタ（重なり回避）
      const base = kind === 'all' ? 0.5 : kind === 'won' ? 1 : 0
      const jitter = ((s.rallyId.charCodeAt(0) % 10) - 5) * 0.014
      return [v, base + jitter] as [number, number]
    })
    .filter((p): p is [number, number] => p !== null)
}

const option = computed(() => {
  const series = neutral.value
    ? [{ name: t('shotStats.tempo.all'), type: 'scatter', symbolSize: 9, data: pointsOf('all') }]
    : [
        { name: t('shotStats.tempo.won'), type: 'scatter', symbolSize: 9, data: pointsOf('won') },
        { name: t('shotStats.tempo.lost'), type: 'scatter', symbolSize: 9, data: pointsOf('lost') }
      ]
  return {
    tooltip: {
      trigger: 'item',
      formatter: (p: { value: [number, number], seriesName: string }) =>
        `${p.seriesName}: ${p.value[0].toFixed(2)} ${unitLabel.value}`
    },
    textStyle: { color: chartText.value, fontSize: 13 },
    legend: { bottom: 0, textStyle: { color: chartText.value, fontSize: 13 } },
    grid: { left: 48, right: 16, top: 20, bottom: 44 },
    xAxis: {
      type: 'value',
      name: unitLabel.value,
      nameGap: 30,
      nameLocation: 'middle',
      axisLabel: { color: chartText.value, fontSize: 13 },
      nameTextStyle: { color: chartText.value, fontSize: 12 }
    },
    yAxis: { type: 'value', min: -0.4, max: 1.4, show: false },
    series
  }
})

const unitLabel = computed(() =>
  props.measure === 'avg' ? t('shotStats.tempo.unitAvg') : t('shotStats.tempo.unitLast3')
)

/** measure ごとの表示対象数（last3 は 3 打未満を除く） */
const shown = computed(() =>
  props.samples.filter(s => tempoValueOf(s, props.measure) !== null).length
)
</script>

<template>
  <div class="tempo-chart">
    <div class="tempo-header">
      <h3 class="chart-title">
        {{ $t('shotStats.tempo.title') }}
      </h3>
      <div class="measure-toggle">
        <UButton
          size="xs"
          :variant="measure === 'avg' ? 'solid' : 'ghost'"
          data-testid="tempo-avg"
          @click="emit('update:measure', 'avg')"
        >
          {{ $t('shotStats.tempo.avg') }}
        </UButton>
        <UButton
          size="xs"
          :variant="measure === 'last3' ? 'solid' : 'ghost'"
          data-testid="tempo-last3"
          @click="emit('update:measure', 'last3')"
        >
          {{ $t('shotStats.tempo.last3') }}
        </UButton>
      </div>
    </div>
    <ClientOnly>
      <VChart
        class="chart"
        :option="option"
        autoresize
      />
    </ClientOnly>
    <p
      class="tempo-note"
      data-testid="tempo-note"
    >
      {{ $t('shotStats.tempo.note', { n: shown, excluded }) }}
    </p>
  </div>
</template>

<style scoped>
.tempo-chart { display: flex; flex-direction: column; gap: 0.25rem; }
.tempo-header { display: flex; align-items: center; justify-content: space-between; gap: 0.5rem; flex-wrap: wrap; }
.chart-title { font-size: 0.875rem; font-weight: 600; }
.measure-toggle { display: flex; gap: 0.25rem; }
.chart { width: 100%; height: 260px; }
.tempo-note { font-size: 0.75rem; opacity: 0.7; }
</style>
