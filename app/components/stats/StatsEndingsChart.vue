<script setup lang="ts">
/**
 * StatsEndingsChart.vue — A 決着分析: 得点/失点内訳 + 決定打ランキング（REQ-005/006, TASK-0010）
 *
 * 対象ごとに「エース獲得 / 相手ミス獲得」（得点側）と「自ミス / 被エース」（失点側）を
 * 積み上げ横棒で対比する。不明（unknown/未注釈）は別掲（REQ-108/EDGE-105）。
 */
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { useChartTextColor } from '~/composables/useChartTextColor'
import type { DecisiveRankRow, EndingEntry } from '~/types/shot-stats'

const props = defineProps<{
  entries: EndingEntry[]
  ranking: DecisiveRankRow[]
}>()

const { t } = useI18n()
const chartText = useChartTextColor()

const CATS = [
  { key: 'ace', side: 'won', label: 'shotStats.endings.ace' },
  { key: 'opponent_error', side: 'won', label: 'shotStats.endings.opponentError' },
  { key: 'own_error', side: 'lost', label: 'shotStats.endings.ownError' },
  { key: 'opponent_ace', side: 'lost', label: 'shotStats.endings.opponentAce' },
  { key: 'unknown', side: 'none', label: 'shotStats.endings.unknown' }
] as const

function valueOf(entry: EndingEntry, key: typeof CATS[number]['key']): number {
  if (key === 'unknown') return entry.breakdown.unknown
  if (key === 'ace' || key === 'opponent_error') return entry.breakdown.won[key]
  return entry.breakdown.lost[key]
}

const option = computed(() => ({
  tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' } },
  textStyle: { color: chartText.value, fontSize: 13 },
  legend: { bottom: 0, textStyle: { color: chartText.value, fontSize: 12 } },
  grid: { left: 90, right: 16, top: 12, bottom: 44 },
  xAxis: { type: 'value', axisLabel: { color: chartText.value, fontSize: 12 } },
  yAxis: {
    type: 'category',
    data: props.entries.map(e => e.label),
    axisLabel: { color: chartText.value, fontSize: 12 }
  },
  series: CATS.map(cat => ({
    name: t(cat.label),
    type: 'bar',
    stack: 'total',
    data: props.entries.map(e => valueOf(e, cat.key)),
    itemStyle: {
      color: cat.key === 'ace'
        ? 'rgba(34,197,94,0.85)'
        : cat.key === 'opponent_error'
          ? 'rgba(34,197,94,0.45)'
          : cat.key === 'own_error'
            ? 'rgba(239,68,68,0.55)'
            : cat.key === 'opponent_ace'
              ? 'rgba(239,68,68,0.85)'
              : 'rgba(148,163,184,0.5)'
    }
  }))
}))

/** ランキング表示用ラベル（null = 未注釈, REQ-108） */
function rankLabel(row: DecisiveRankRow): string {
  return row.shotType === null ? t('shotStats.endings.unannotated') : t(`annotation.shotType.${row.shotType}`)
}
</script>

<template>
  <div class="endings-chart">
    <h3 class="chart-title">
      {{ $t('shotStats.endings.title') }}
    </h3>
    <p
      class="denominator"
      data-testid="endings-denominator"
    >
      {{ $t('shotStats.denominator', {
        n: entries.reduce((s, e) => s + e.breakdown.annotatedRallies, 0),
        total: entries.reduce((s, e) => s + e.breakdown.totalRallies, 0)
      }) }}
    </p>
    <ClientOnly>
      <VChart
        class="chart"
        :option="option"
        autoresize
      />
    </ClientOnly>
    <div
      v-if="ranking.length > 0"
      class="ranking"
      data-testid="decisive-ranking"
    >
      <h4 class="ranking-title">
        {{ $t('shotStats.endings.rankingTitle') }}
      </h4>
      <ol class="ranking-list">
        <li
          v-for="(row, i) in ranking"
          :key="i"
        >
          {{ rankLabel(row) }} <span class="count">{{ row.count }}</span>
        </li>
      </ol>
    </div>
  </div>
</template>

<style scoped>
.endings-chart { display: flex; flex-direction: column; gap: 0.25rem; }
.chart-title { font-size: 0.875rem; font-weight: 600; }
.denominator { font-size: 0.75rem; opacity: 0.7; }
.chart { width: 100%; height: 300px; }
.ranking-title { font-size: 0.8125rem; font-weight: 600; }
.ranking-list { display: flex; flex-wrap: wrap; gap: 0.375rem 1rem; list-style: none; padding: 0; font-size: 0.8125rem; counter-reset: rank; }
.ranking-list li::before { counter-increment: rank; content: counter(rank) '. '; opacity: 0.6; }
.count { font-weight: 600; }
</style>
