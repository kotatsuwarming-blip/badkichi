<script setup lang="ts">
/**
 * StatsRallyLengthChart.vue — ラリー長別 本数(棒) + サーブ側勝率(線) コンボチャート
 *
 * x 軸はラリー長ビン（1 / 2 / 3〜7 / …。1〜2打=サーブ/レシーブ決着を分離, U-06）。
 * 棒は複数選択可で、選択ビンキー集合を selectBins に emit
 * （クロスフィルタの和集合, ヒアリング2026-06-09）。
 *
 * 関連設計: docs/design/stats-dashboard/{interfaces.ts,dataflow.md}
 * 関連要件: REQ-005 / REQ-010 / REQ-406
 */
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { toRallyLengthSeries } from '~/utils/stats-dashboard/to-rally-length-series'
import { useChartTextColor } from '~/composables/useChartTextColor'
import type { RallyLengthBin } from '~/types/stats-dashboard'

const props = defineProps<{
  bins: RallyLengthBin[]
  /** 現在選択中のビンキー（複数選択） */
  selectedKeys: string[]
}>()

const emit = defineEmits<{ selectBins: [keys: string[]] }>()

const { t } = useI18n()

// テーマ（ライト/ダーク）に追従する文字色（U-06: ダーク背景で濃い文字が見えない）。
const chartText = useChartTextColor()

const series = computed(() => toRallyLengthSeries(props.bins))

const option = computed(() => {
  const s = series.value
  return {
    tooltip: { trigger: 'axis' },
    // チャート全文字をテーマ追従色・標準サイズに（U-06）
    textStyle: { color: chartText.value, fontSize: 13 },
    // 凡例は下部へ。軸名（本数/%）と凡例の衝突を解消（U-06: 凡例がグラフに被る）
    legend: { data: [t('stats.rallyLength.count'), t('stats.rallyLength.winRate')], bottom: 0, textStyle: { color: chartText.value, fontSize: 13 } },
    // 2行ラベル（1打/2打の決着注記）ぶん下余白を確保
    grid: { left: 48, right: 48, top: 28, bottom: 60 },
    // 軸ラベル・軸名はやや大きめで視認性を上げる（U-06）。interval:0 で5ビン全ラベルを常時表示
    xAxis: { type: 'category', data: s.labels, axisLabel: { color: chartText.value, fontSize: 13, fontWeight: 500, interval: 0 } },
    yAxis: [
      { type: 'value', name: t('stats.rallyLength.count'), min: 0, nameGap: 12, axisLabel: { color: chartText.value, fontSize: 13 }, nameTextStyle: { color: chartText.value, fontSize: 12 } },
      { type: 'value', name: '%', min: 0, max: 100, nameGap: 12, axisLabel: { color: chartText.value, fontSize: 13 }, nameTextStyle: { color: chartText.value, fontSize: 12 } }
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
    <h3 class="chart-title">
      {{ t('stats.rallyLength.title') }}
    </h3>
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
.chart-title { font-size: 0.9375rem; font-weight: 700; margin: 0 0 0.25rem; color: var(--ui-text); }
.chart { width: 100%; height: 300px; }
</style>
