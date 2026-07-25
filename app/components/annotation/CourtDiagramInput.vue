<script setup lang="ts">
/**
 * 【機能概要】: 入力用コート図。ライン外領域込みで描画し、タップ/クリックを
 *             絶対正規化座標 (範囲外値許容) で emit する (REQ-005 / REQ-014)。
 * 【実装方針】: record 用 CourtDiagram (表示専用) とは別責務 (design-interview D4)。
 *             viewBox はコート実寸比 (幅 6.1m × 全長 13.4m、1m = 10 単位)。
 *             外周 3m 相当をアウト領域として含める。y=0 側 = チームA側バックバウンダリー。
 *             精度は ±50cm で足りる UI トーン: マーカーは大きめの円 (NFR-202)。
 */
import { computed } from 'vue'
import { fromNormalized, toNormalized } from '~/utils/annotation/court-coords'
import type { CourtPoint, CourtRect } from '~/types/shot-annotation'

const props = withDefaults(defineProps<{
  /** 表示するマーカー (正規化座標)。null = 非表示 */
  marker?: CourtPoint | null
  /** アウト領域 (ライン外) のタップを許可するか (落下点入力 = true / 打点入力 = false 推奨) */
  allowOutZone?: boolean
}>(), {
  marker: null,
  allowOutZone: true
})

const emit = defineEmits<{ select: [point: CourtPoint] }>()

/** コート本体 (ラインの内側)。単位 = 0.1m */
const COURT: CourtRect = { left: 30, top: 30, width: 61, height: 134 }
const MARGIN = 30
const VIEW_W = COURT.width + MARGIN * 2
const VIEW_H = COURT.height + MARGIN * 2
const NET_Y = COURT.top + COURT.height / 2

function onSelect(event: MouseEvent) {
  const svg = event.currentTarget as SVGSVGElement
  const rect = svg.getBoundingClientRect()
  const vx = ((event.clientX - rect.left) / rect.width) * VIEW_W
  const vy = ((event.clientY - rect.top) / rect.height) * VIEW_H
  const point = toNormalized(vx, vy, COURT)
  const inCourt = point.x >= 0 && point.x <= 1 && point.y >= 0 && point.y <= 1
  if (!inCourt && !props.allowOutZone) return
  emit('select', point)
}

const markerPos = computed(() =>
  props.marker ? fromNormalized(props.marker, COURT) : null
)
</script>

<template>
  <svg
    :viewBox="`0 0 ${VIEW_W} ${VIEW_H}`"
    class="w-full max-w-xs cursor-crosshair select-none"
    role="img"
    @click="onSelect"
  >
    <!-- アウト領域 (ライン外)。落下点はここもタップ可能 (REQ-005) -->
    <rect
      :width="VIEW_W"
      :height="VIEW_H"
      class="fill-neutral-200 dark:fill-neutral-800"
    />
    <!-- コート本体 -->
    <rect
      :x="COURT.left"
      :y="COURT.top"
      :width="COURT.width"
      :height="COURT.height"
      class="fill-emerald-600/80 stroke-white"
      stroke-width="1.5"
    />
    <!-- ネット (中央) -->
    <line
      :x1="COURT.left"
      :x2="COURT.left + COURT.width"
      :y1="NET_Y"
      :y2="NET_Y"
      class="stroke-white"
      stroke-width="2"
      stroke-dasharray="3 2"
    />
    <!-- ショートサービスライン (ネットから 1.98m) -->
    <line
      v-for="offset in [-19.8, 19.8]"
      :key="offset"
      :x1="COURT.left"
      :x2="COURT.left + COURT.width"
      :y1="NET_Y + offset"
      :y2="NET_Y + offset"
      class="stroke-white/70"
      stroke-width="0.8"
    />
    <!-- センターライン -->
    <line
      v-for="[y1, y2] in [[COURT.top, NET_Y - 19.8], [NET_Y + 19.8, COURT.top + COURT.height]]"
      :key="y1"
      :x1="COURT.left + COURT.width / 2"
      :x2="COURT.left + COURT.width / 2"
      :y1="y1"
      :y2="y2"
      class="stroke-white/70"
      stroke-width="0.8"
    />
    <!-- 入力マーカー (±50cm トーンの大きめ円、NFR-202) -->
    <circle
      v-if="markerPos"
      :cx="markerPos.px"
      :cy="markerPos.py"
      r="5"
      class="fill-amber-400/80 stroke-amber-600"
      stroke-width="1"
    />
  </svg>
</template>
