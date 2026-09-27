<script setup lang="ts">
/**
 * StatsCourtZones.vue — バドミントンコート図 + ゾーンヒート（SVG 自作, 設計2026-08-04）
 *
 * A（落下点）/ F（打点ヒートマップ）で共用する描画基盤。
 * 座標系は選手視点固定（下 = 対象選手の自陣バック側, REQ-105）。
 * コート実寸比: 幅 6.1m × 全長 13.4m（cm 単位の viewBox）。
 */
import { computed } from 'vue'
import type { ZoneCell } from '~/types/shot-stats'

const props = withDefaults(defineProps<{
  cells: ZoneCell[]
  zones?: number
  showCounts?: boolean
  /** 本数でなく % を表示 (stats-miss-out-detail REQ-001)。分母は percentDenominators (セル別) */
  percent?: boolean
  /** % の分母 (キー = "row:col")。未指定セルは全セル合計を分母にする */
  percentDenominators?: Record<string, number>
  /** セルをクリック選択可能にする (REQ-002)。selected と select emit で完全制御 */
  selectable?: boolean
  selected?: { row: number, col: number } | null
  /** セルのホバーツールチップ (SVG title)。キー = "row:col" */
  cellTitles?: Record<string, string>
}>(), { zones: 3, showCounts: true, percent: false, percentDenominators: undefined, selectable: false, selected: null, cellTitles: undefined })

const emit = defineEmits<{ select: [cell: { row: number, col: number }] }>()

const totalCount = computed(() => props.cells.reduce((s, c) => s + c.count, 0))

function cellLabel(cell: ZoneCell): string {
  if (!props.percent) return String(cell.count)
  const denom = props.percentDenominators?.[`${cell.row}:${cell.col}`] ?? totalCount.value
  if (denom === 0) return ''
  return `${Math.round((cell.count / denom) * 100)}%`
}

function isSelected(cell: ZoneCell): boolean {
  return props.selected?.row === cell.row && props.selected?.col === cell.col
}

function onCellClick(cell: ZoneCell): void {
  if (props.selectable) emit('select', { row: cell.row, col: cell.col })
}

const W = 610
const H = 1340
const NET = H / 2
const SHORT_SERVICE = 198 // ネットからショートサービスラインまで 1.98m
const LONG_SERVICE = 76 // バックバウンダリーからダブルスロングサービスラインまで 0.76m
const SINGLES_SIDE = 46 // ダブルスサイドラインからシングルスサイドラインまで 0.46m (REQ-301a)

/** ゾーン row（0=手前バック）→ SVG y（下が手前） */
function cellY(row: number, zones: number): number {
  const cellH = H / (zones * 2)
  return H - (row + 1) * cellH
}
</script>

<template>
  <svg
    class="court"
    :viewBox="`-8 -8 ${W + 16} ${H + 16}`"
    role="img"
    data-testid="court-zones"
  >
    <!-- ゾーンヒート（selectable 時はクリックで選択, REQ-002） -->
    <g>
      <rect
        v-for="cell in cells"
        :key="`${cell.row}:${cell.col}`"
        :x="(W / zones) * cell.col"
        :y="cellY(cell.row, zones)"
        :width="W / zones"
        :height="H / (zones * 2)"
        :fill="`rgba(59, 130, 246, ${0.1 + cell.ratio * 0.55})`"
        :stroke="isSelected(cell) ? 'currentColor' : 'none'"
        :stroke-width="isSelected(cell) ? 10 : 0"
        :style="selectable ? 'cursor: pointer' : undefined"
        :data-testid="`zone-${cell.row}-${cell.col}`"
        @click="onCellClick(cell)"
      >
        <title v-if="cellTitles?.[`${cell.row}:${cell.col}`]">{{ cellTitles[`${cell.row}:${cell.col}`] }}</title>
      </rect>
    </g>
    <!-- コートライン -->
    <g
      fill="none"
      stroke="currentColor"
      stroke-width="6"
      opacity="0.55"
    >
      <rect
        x="0"
        y="0"
        :width="W"
        :height="H"
      />
      <!-- ショートサービスライン（両側） -->
      <line
        x1="0"
        :y1="NET - SHORT_SERVICE"
        :x2="W"
        :y2="NET - SHORT_SERVICE"
      />
      <line
        x1="0"
        :y1="NET + SHORT_SERVICE"
        :x2="W"
        :y2="NET + SHORT_SERVICE"
      />
      <!-- ダブルスロングサービスライン -->
      <line
        x1="0"
        :y1="LONG_SERVICE"
        :x2="W"
        :y2="LONG_SERVICE"
      />
      <line
        x1="0"
        :y1="H - LONG_SERVICE"
        :x2="W"
        :y2="H - LONG_SERVICE"
      />
      <!-- シングルスサイドライン (左右 0.46m 内側、常時描画 REQ-301a) -->
      <line
        v-for="x in [SINGLES_SIDE, W - SINGLES_SIDE]"
        :key="`ssl-${x}`"
        :x1="x"
        y1="0"
        :x2="x"
        :y2="H"
        stroke-width="4"
        opacity="0.6"
        data-testid="singles-sideline"
      />
      <!-- センターライン（ショートサービスライン〜バック） -->
      <line
        :x1="W / 2"
        y1="0"
        :x2="W / 2"
        :y2="NET - SHORT_SERVICE"
      />
      <line
        :x1="W / 2"
        :y1="NET + SHORT_SERVICE"
        :x2="W / 2"
        :y2="H"
      />
    </g>
    <!-- ネット -->
    <line
      x1="0"
      :y1="NET"
      :x2="W"
      :y2="NET"
      stroke="currentColor"
      stroke-width="8"
      stroke-dasharray="18 12"
      opacity="0.8"
    />
    <!-- 件数 -->
    <g v-if="showCounts">
      <text
        v-for="cell in cells"
        :key="`t-${cell.row}:${cell.col}`"
        :x="(W / zones) * cell.col + (W / zones) / 2"
        :y="cellY(cell.row, zones) + H / (zones * 2) / 2"
        text-anchor="middle"
        dominant-baseline="central"
        font-size="52"
        fill="currentColor"
        opacity="0.85"
        pointer-events="none"
      >{{ cellLabel(cell) }}</text>
    </g>
  </svg>
</template>

<style scoped>
.court { width: 100%; max-width: 240px; height: auto; display: block; }
</style>
