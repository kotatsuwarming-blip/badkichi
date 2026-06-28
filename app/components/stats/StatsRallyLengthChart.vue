<script setup lang="ts">
/**
 * StatsRallyLengthChart.vue — ラリー長別 本数(棒) + サーブ側勝率(線) コンボチャート
 *
 * x 軸はラリー長ビン（1〜3 / 4〜7 / …）。棒は複数選択可で、選択ビンキー集合を selectBins に emit
 * （クロスフィルタの和集合, ヒアリング2026-06-09）。
 *
 * 関連設計: docs/design/stats-dashboard/{interfaces.ts,dataflow.md}
 * 関連要件: REQ-005 / REQ-010 / REQ-406
 */
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { toRallyLengthSeries } from '~/utils/stats-dashboard/to-rally-length-series'
import type { RallyLengthBin } from '~/types/stats-dashboard'

const props = defineProps<{
  bins: RallyLengthBin[]
  /** 現在選択中のビンキー（複数選択） */
  selectedKeys: string[]
}>()

const emit = defineEmits<{ selectBins: [keys: string[]] }>()

const { t } = useI18n()

const series = computed(() => toRallyLengthSeries(props.bins))

const option = computed(() => {
  const s = series.value
  return {
    tooltip: { trigger: 'axis' },
    // 凡例は下部へ。軸名（本数/%）と凡例の衝突を解消（U-06: 凡例がグラフに被る）
    legend: { data: [t('stats.rallyLength.count'), t('stats.rallyLength.winRate')], bottom: 0 },
    grid: { left: 48, right: 48, top: 28, bottom: 44 },
    xAxis: { type: 'category', data: s.labels },
    yAxis: [
      { type: 'value', name: t('stats.rallyLength.count'), min: 0, nameGap: 12 },
      { type: 'value', name: '%', min: 0, max: 100, nameGap: 12 }
    ],
    series: [
      {
        name: t('stats.rallyLength.count'),
        type: 'bar',
        yAxisIndex: 0,
        data: s.counts.map((v, i) => ({
          value: v,
          // 選択中ビンを強調
          itemStyle: props.selectedKeys.includes(s.keys[i]!) ? { opacity: 1 } : { opacity: 0.55 }
        }))
      },
      {
        name: t('stats.rallyLength.winRate'),
        type: 'line',
        yAxisIndex: 1,
        data: s.winRatesPct
      }
    ]
  }
})

// 棒クリック → 該当ビンキーをトグルし、選択集合を emit
function onChartClick(params: { dataIndex: number }): void {
  const key = series.value.keys[params.dataIndex]
  if (!key) return
  const next = props.selectedKeys.includes(key)
    ? props.selectedKeys.filter(k => k !== key)
    : [...props.selectedKeys, key]
  emit('selectBins', next)
}

defineExpose({ onChartClick })
</script>

<template>
  <div
    class="stats-rally-length-chart"
    data-testid="stats-rally-length-chart"
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
.stats-rally-length-chart { width: 100%; }
.chart { width: 100%; height: 300px; }
</style>
