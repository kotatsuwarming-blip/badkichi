<script setup lang="ts">
/**
 * StatsHandChart.vue — G フォア/バック分析（REQ-012/102, TASK-0011）
 *
 * 球種別の F/B 本数（hand 注釈済みのみが母数。null はフォア扱いしない, REQ-102）と、
 * F/B 別の成果（決定率・ミス率）を表示する。
 */
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { useChartTextColor } from '~/composables/useChartTextColor'
import type { ShotTypeStatRow } from '~/types/shot-stats'
import type { ShotType } from '~/types/shot-annotation'

const props = defineProps<{ rows: ShotTypeStatRow[] }>()

const { t } = useI18n()
const chartText = useChartTextColor()

const handed = computed(() => props.rows.filter(r => r.hand !== null))
const handedShots = computed(() => handed.value.reduce((s, r) => s + r.shots, 0))
const totalShots = computed(() => props.rows.reduce((s, r) => s + r.shots, 0))

interface TypeHand { type: ShotType, fore: number, back: number }

const byType = computed<TypeHand[]>(() => {
  const map = new Map<ShotType, TypeHand>()
  for (const r of handed.value) {
    if (r.shot_type === null) continue
    let agg = map.get(r.shot_type)
    if (!agg) {
      agg = { type: r.shot_type, fore: 0, back: 0 }
      map.set(r.shot_type, agg)
    }
    if (r.hand === 'forehand') agg.fore += r.shots
    else agg.back += r.shots
  }
  return [...map.values()].sort((a, b) => (b.fore + b.back) - (a.fore + a.back))
})

/** F/B 別の成果（決定率・ミス率, 分母 = その hand の総打数） */
const outcome = computed(() => {
  const acc = {
    forehand: { shots: 0, decisive: 0, miss: 0 },
    backhand: { shots: 0, decisive: 0, miss: 0 }
  }
  for (const r of handed.value) {
    const side = acc[r.hand!]
    side.shots += r.shots
    side.decisive += r.decisive_won
    side.miss += r.miss_lost
  }
  return acc
})

function pct(n: number, d: number): string {
  return d === 0 ? '-' : `${Math.round((n / d) * 100)}%`
}

const option = computed(() => ({
  tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' } },
  textStyle: { color: chartText.value, fontSize: 13 },
  legend: { top: 0, type: 'scroll', textStyle: { color: chartText.value, fontSize: 12 } },
  grid: { left: 48, right: 16, top: 36, bottom: 76 },
  xAxis: {
    type: 'category',
    data: byType.value.map(a => t(`annotation.shotType.${a.type}`)),
    axisLabel: { color: chartText.value, fontSize: 11, rotate: 45 }
  },
  yAxis: {
    type: 'value',
    name: t('shotStats.hand.count'),
    nameGap: 12,
    axisLabel: { color: chartText.value, fontSize: 13 },
    nameTextStyle: { color: chartText.value, fontSize: 12 }
  },
  series: [
    { name: t('annotation.hand.forehand'), type: 'bar', stack: 'hand', data: byType.value.map(a => a.fore) },
    { name: t('annotation.hand.backhand'), type: 'bar', stack: 'hand', data: byType.value.map(a => a.back) }
  ]
}))
</script>

<template>
  <div class="hand-chart">
    <h3 class="chart-title">
      {{ $t('shotStats.hand.title') }}
    </h3>
    <p
      class="denominator"
      data-testid="hand-denominator"
    >
      {{ $t('shotStats.denominator', { n: handedShots, total: totalShots }) }}
    </p>
    <ClientOnly>
      <VChart
        class="chart"
        :option="option"
        autoresize
      />
    </ClientOnly>
    <div
      class="hand-outcome"
      data-testid="hand-outcome"
    >
      <span>
        {{ $t('annotation.hand.forehand') }}:
        {{ $t('shotStats.hand.outcome', {
          decisive: pct(outcome.forehand.decisive, outcome.forehand.shots),
          miss: pct(outcome.forehand.miss, outcome.forehand.shots)
        }) }}
      </span>
      <span>
        {{ $t('annotation.hand.backhand') }}:
        {{ $t('shotStats.hand.outcome', {
          decisive: pct(outcome.backhand.decisive, outcome.backhand.shots),
          miss: pct(outcome.backhand.miss, outcome.backhand.shots)
        }) }}
      </span>
    </div>
  </div>
</template>

<style scoped>
.hand-chart { display: flex; flex-direction: column; gap: 0.25rem; }
.chart-title { font-size: 0.875rem; font-weight: 600; }
.denominator { font-size: 0.75rem; opacity: 0.7; }
.chart { width: 100%; height: 300px; }
.hand-outcome { display: flex; gap: 1rem; flex-wrap: wrap; font-size: 0.8125rem; }
</style>
