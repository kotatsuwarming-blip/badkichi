<script setup lang="ts">
/**
 * StatsCourtZones.vue — バドミントンコート図 + ゾーンヒート（SVG 自作, 設計2026-08-04）
 *
 * A（落下点）/ F（打点ヒートマップ）で共用する描画基盤。
 * 座標系は選手視点固定（下 = 対象選手の自陣バック側, REQ-105）。
 * コート実寸比: 幅 6.1m × 全長 13.4m（cm 単位の viewBox）。
 */
import type { ZoneCell } from '~/types/shot-stats'

withDefaults(defineProps<{
  cells: ZoneCell[]
  zones?: number
  showCounts?: boolean
}>(), { zones: 3, showCounts: true })

const W = 610
const H = 1340
const NET = H / 2
const SHORT_SERVICE = 198 // ネットからショートサービスラインまで 1.98m
const LONG_SERVICE = 76 // バックバウンダリーからダブルスロングサービスラインまで 0.76m

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
    <!-- ゾーンヒート -->
    <g>
      <rect
        v-for="cell in cells"
        :key="`${cell.row}:${cell.col}`"
        :x="(W / zones) * cell.col"
        :y="cellY(cell.row, zones)"
        :width="W / zones"
        :height="H / (zones * 2)"
        :fill="`rgba(59, 130, 246, ${0.1 + cell.ratio * 0.55})`"
        :data-testid="`zone-${cell.row}-${cell.col}`"
      />
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
      >{{ cell.count }}</text>
    </g>
  </svg>
</template>

<style scoped>
.court { width: 100%; max-width: 240px; height: auto; display: block; }
</style>
