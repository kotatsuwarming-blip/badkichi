<script setup lang="ts">
/**
 * StatsShotValueBreakdown.vue — SV 球種別ポイント内訳（TASK-0004）
 *
 * 中央 0 軸の左右に 5 役割（決め/誘発/布石 = 右、自ミス/許した = 左）を積み上げ。
 * ヒゲ = 95%CI、行末に収支 ±CI、n 降順、n<5 薄表示（REQ-005〜007）。
 * 見た目の正: docs/spec/shot-value/sv-drilldown-mock.html
 */
import { useI18n } from 'vue-i18n'
import type { SvTypeBreakdownRow } from '~/types/shot-value'

defineProps<{
  rows: SvTypeBreakdownRow[]
}>()

const { t } = useI18n()

/** 横軸スケール: ±SCALE /100本 を各半分 50% にマップ */
const SCALE = 70

function pct(v: number): number {
  return Math.min(50, (v / SCALE) * 50)
}

interface Seg {
  key: string
  side: 'pos' | 'neg'
  left: number
  width: number
  color: string
  label: string
  value: number
}

/** 表示セグメント（布石 = fuseki1+2 / 許した = yurushi1+2 に統合した 5 色） */
function segsOf(row: SvTypeBreakdownRow): Seg[] {
  const segs: Seg[] = []
  const pos: [string, number, string][] = [
    ['kime', row.per100.kime, '#1c5cab'],
    ['yuhatsu', row.per100.yuhatsu, '#3987e5'],
    ['fuseki', row.per100.fuseki1 + row.per100.fuseki2, '#86b6ef']
  ]
  const neg: [string, number, string][] = [
    ['miss', row.per100.miss, '#c23837'],
    ['yurushi', row.per100.yurushi1 + row.per100.yurushi2, '#f0a09f']
  ]
  let acc = 0
  for (const [key, v, color] of pos) {
    if (v <= 0) continue
    segs.push({
      key, side: 'pos', left: 50 + pct(acc), width: Math.max(0.5, pct(v)),
      color, label: t(`shotStats.value.role.${key}`), value: v
    })
    acc += v
  }
  acc = 0
  for (const [key, v, color] of neg) {
    if (v <= 0) continue
    acc += v
    segs.push({
      key, side: 'neg', left: 50 - pct(acc), width: Math.max(0.5, pct(v)),
      color, label: t(`shotStats.value.role.${key}`), value: v
    })
  }
  return segs
}

function whisker(row: SvTypeBreakdownRow): { left: number, width: number } {
  const lo = Math.max(-SCALE, row.sv100 - row.ci95)
  const hi = Math.min(SCALE, row.sv100 + row.ci95)
  return { left: 50 + pct(Math.max(-SCALE, Math.min(SCALE, lo))), width: pct(hi) - pct(lo) }
}

function netLeft(row: SvTypeBreakdownRow): number {
  return 50 + pct(Math.max(-SCALE, Math.min(SCALE, row.sv100)))
}

function fmt(v: number): string {
  const r = Math.round(v)
  return (r > 0 ? '+' : r < 0 ? '−' : '±') + Math.abs(r)
}

const LEGEND: { key: string, color: string }[] = [
  { key: 'kime', color: '#1c5cab' },
  { key: 'yuhatsu', color: '#3987e5' },
  { key: 'fuseki', color: '#86b6ef' },
  { key: 'miss', color: '#c23837' },
  { key: 'yurushi', color: '#f0a09f' }
]
</script>

<template>
  <div
    class="sv-breakdown"
    data-testid="sv-breakdown"
  >
    <p
      v-if="rows.length === 0"
      class="empty"
      data-testid="sv-breakdown-empty"
    >
      {{ $t('shotStats.value.empty') }}
    </p>
    <template v-else>
      <div class="brk-head">
        <span>{{ $t('shotStats.value.colType') }}</span>
        <span class="axis-label">{{ $t('shotStats.value.axisLabel') }}</span>
        <span class="num-label">{{ $t('shotStats.value.colNet') }}</span>
      </div>
      <div
        v-for="row in rows"
        :key="row.shotType"
        class="brk-row"
        :class="{ 'is-dim': row.lowSample }"
        :data-testid="`sv-type-${row.shotType}`"
      >
        <span class="shot-name">
          {{ $t(`annotation.shotType.${row.shotType}`) }}
          <span class="n">n={{ row.n }}</span>
          <span
            v-if="row.lowSample"
            class="low"
          >{{ $t('shotStats.value.lowSample') }}</span>
        </span>
        <span class="track">
          <span class="zeroline" />
          <span
            v-for="seg in segsOf(row)"
            :key="seg.key"
            class="seg"
            :class="seg.side"
            :style="{ left: `${seg.left}%`, width: `${seg.width}%`, background: seg.color }"
            :title="`${seg.label} ${seg.side === 'pos' ? '+' : '−'}${seg.value.toFixed(1)} /100`"
          />
          <span
            class="whisker"
            :style="{ left: `${whisker(row).left}%`, width: `${whisker(row).width}%` }"
          />
          <span
            class="netmark"
            :style="{ left: `calc(${netLeft(row)}% - 1px)` }"
          />
        </span>
        <span class="sv-num">
          {{ fmt(row.sv100) }}<small>±{{ Math.round(row.ci95) }}</small>
        </span>
      </div>
      <div class="legend">
        <span
          v-for="item in LEGEND"
          :key="item.key"
        >
          <i
            class="sw"
            :style="{ background: item.color }"
          />{{ $t(`shotStats.value.role.${item.key}`) }}
        </span>
      </div>
      <p class="hint">
        {{ $t('shotStats.value.whiskerHint') }}
      </p>
    </template>
  </div>
</template>

<style scoped>
.sv-breakdown { width: 100%; }
.brk-head, .brk-row { display: grid; grid-template-columns: 7.5em 1fr 5.5em; gap: 10px; align-items: center; }
.brk-head { font-size: 0.7rem; color: var(--ui-text-muted, #6b7280); margin: 6px 0 4px; }
.axis-label { text-align: center; }
.num-label { text-align: right; }
.brk-row { padding: 5px 0; border-top: 1px solid var(--ui-border, #e5e7eb); }
.brk-row.is-dim { opacity: 0.45; }
.shot-name { font-size: 0.82rem; color: var(--ui-text, #111827); }
.shot-name .n { display: block; color: var(--ui-text-muted, #6b7280); font-size: 0.72rem; font-variant-numeric: tabular-nums; }
.shot-name .low {
  display: inline-block; font-size: 0.62rem; border: 1px solid var(--ui-border, #e5e7eb);
  border-radius: 999px; padding: 0 6px; color: var(--ui-text-muted, #6b7280);
}
.track { position: relative; height: 34px; display: block; }
.zeroline { position: absolute; left: 50%; top: 0; bottom: 0; width: 1px; background: var(--ui-border, #d1d5db); }
.seg { position: absolute; top: 6px; height: 14px; }
.seg.pos { border-radius: 0 4px 4px 0; }
.seg.neg { border-radius: 4px 0 0 4px; }
.whisker { position: absolute; top: 26px; height: 2px; background: var(--ui-text-muted, #6b7280); opacity: 0.7; }
.netmark { position: absolute; top: 23px; width: 2px; height: 8px; background: var(--ui-text, #111827); }
.sv-num { text-align: right; font-variant-numeric: tabular-nums; font-size: 0.85rem; font-weight: 600; color: var(--ui-text, #111827); }
.sv-num small { display: block; font-weight: 400; color: var(--ui-text-muted, #6b7280); font-size: 0.7rem; }
.legend { display: flex; gap: 14px; flex-wrap: wrap; margin-top: 12px; font-size: 0.72rem; color: var(--ui-text-muted, #6b7280); }
.legend span { display: inline-flex; align-items: center; gap: 5px; }
.sw { width: 12px; height: 12px; border-radius: 3px; display: inline-block; }
.hint { font-size: 0.74rem; color: var(--ui-text-muted, #6b7280); margin-top: 10px; }
.empty { color: var(--ui-text-muted, #6b7280); padding: 1rem 0; }
</style>
