<script setup lang="ts">
/**
 * StatsShotHeatmap.vue — F 配球ヒートマップ（REQ-011 改訂, ヒアリング2026-08-08 #2〜#4）
 *
 * 手前（自陣）3×3 のセルをタップで選択 → そのセルから打ったショットの配球先が
 * 奥（相手）3×3 + コート外（ネット / 左右アウト / バックアウト）に本数で表示される。
 * 手前・奥・コート外いずれもホバーで球種内訳（<title> ツールチップ, #4）。
 * ミスの行き先は寄せずに別枠表示（#4）。未選択時は全体合計 + 選択を促す文言。
 * 座標は選手視点固定（下 = 自陣, REQ-105 カメラ基準正規化）。
 */
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { buildOriginProfile } from '~/utils/shot-stats/placement'
import { OUT_RING_SLOTS } from '~/types/shot-stats'
import type { PlacementBreakdown, PlacementDestCell, PlacementOutRing } from '~/types/shot-stats'

const props = withDefaults(defineProps<{
  originCells: PlacementDestCell[]
  destCells: PlacementDestCell[]
  outRing: PlacementOutRing
  selected: { row: number, col: number } | null
  /** 表示中の配球総数（コート内 + ネット + アウト。母数併記, NFR-201） */
  total: number
  /** スコープ全体の打点注釈数（分母） */
  pointedTotal: number
  zones?: number
}>(), { zones: 3 })

const emit = defineEmits<{ selectOrigin: [cell: { row: number, col: number }] }>()

const { t } = useI18n()

const W = 610
const H = 1340
const NET = H / 2
// コート外表示用の余白（左右 = サイドアウト / 上 = バックアウト + 角, REQ-102）
const MX = 210
const MT = 140
const MB = 16
// アウト位置リングの枠サイズ（コートセルより小さめ, REQ-102）
const BOX = 104
const GAP = 12

/** リング 11 枠の SVG 配置（相手半面を取り囲む。0=ネット側の行 / 列は打者視点） */
const ringRects = computed(() => OUT_RING_SLOTS.map((slot) => {
  const colW = W / props.zones
  if (slot === 'left_back') return { slot, x: -BOX - GAP, y: -BOX - GAP, w: BOX, h: BOX }
  if (slot === 'right_back') return { slot, x: W + GAP, y: -BOX - GAP, w: BOX, h: BOX }
  const [side, idx] = slot.split('_') as [string, string]
  const i = Number(idx)
  if (side === 'back') return { slot, x: i * colW + GAP / 2, y: -BOX - GAP, w: colW - GAP, h: BOX }
  // サイド: 行 i（0 = ネット側）に沿わせる
  const y = destY(i) + GAP / 2
  const h = cellH() - GAP
  return { slot, x: side === 'left' ? -BOX - GAP : W + GAP, y, w: BOX, h }
}))

const ringMax = computed(() => Math.max(1, ...OUT_RING_SLOTS.map(slot => props.outRing.ring[slot].count)))

/** アウト枠の塗り（赤系。0 本は枠線のみ, REQ-103） */
function ringFill(count: number): string {
  if (count === 0) return 'transparent'
  return `rgba(239, 68, 68, ${0.18 + (count / ringMax.value) * 0.45})`
}

function cellH(): number {
  return H / (props.zones * 2)
}

/** 手前セル（origin_row 0=自陣バック）→ SVG y（下が自陣バック） */
function originY(row: number): number {
  return H - (row + 1) * cellH()
}

/** 奥セル（dest_row 0=ネット側）→ SVG y（row 0 = ネット直上 [NET−cellH, NET]） */
function destY(row: number): number {
  return NET - (row + 1) * cellH()
}

function originCellAt(row: number, col: number): PlacementDestCell | null {
  return props.originCells.find(c => c.row === row && c.col === col) ?? null
}

function isSelected(row: number, col: number): boolean {
  return props.selected?.row === row && props.selected?.col === col
}

/** 球種内訳ツールチップ文字列（ホバー表示, #4） */
function breakdownText(breakdown: PlacementBreakdown[]): string {
  return breakdown
    .map(b => `${b.type === null ? t('shotStats.endings.unannotated') : t(`annotation.shotType.${b.type}`)} ${b.count}`)
    .join(' / ')
}

/** 選択ゾーンのショットプロファイル（候補 0 本込み, #5）。未選択は null */
const profile = computed<PlacementBreakdown[] | null>(() => {
  if (props.selected === null) return null
  const cell = originCellAt(props.selected.row, props.selected.col)
  return buildOriginProfile(cell?.breakdown ?? [], props.selected.row, props.zones)
})
const profileMax = computed(() =>
  Math.max(1, ...(profile.value ?? []).map(b => b.count))
)
/** 真ん中の行は候補固定なし（実際に打った球種のみ表示） */
const isMiddleRow = computed(() =>
  props.selected !== null && props.selected.row !== 0 && props.selected.row !== props.zones - 1
)

function typeLabel(type: PlacementBreakdown['type']): string {
  return type === null ? t('shotStats.endings.unannotated') : t(`annotation.shotType.${type}`)
}

function originTitle(row: number, col: number): string {
  const cell = originCellAt(row, col)
  const head = t('shotStats.heatmap.originTip', { n: cell?.count ?? 0 })
  return cell && cell.breakdown.length > 0 ? `${head}: ${breakdownText(cell.breakdown)}` : head
}
</script>

<template>
  <div class="heatmap">
    <h3 class="chart-title">
      {{ $t('shotStats.heatmap.title') }}
    </h3>
    <p
      class="denominator"
      data-testid="heatmap-denominator"
    >
      {{ $t('shotStats.denominator', { n: total, total: pointedTotal }) }}
    </p>
    <p
      class="heatmap-state"
      data-testid="heatmap-state"
    >
      {{ selected === null
        ? $t('shotStats.heatmap.promptSelect')
        : $t('shotStats.heatmap.selectedCell') }}
    </p>
    <div class="heatmap-body">
      <svg
        class="court"
        :viewBox="`${-MX} ${-MT} ${W + MX * 2} ${H + MT + MB}`"
        role="img"
        data-testid="placement-court"
      >
        <!-- 奥（相手）半面: 配球先ヒート + 本数。ホバーで球種内訳 -->
        <g
          v-for="cell in destCells"
          :key="`d-${cell.row}:${cell.col}`"
        >
          <rect
            :x="(W / zones) * cell.col"
            :y="destY(cell.row)"
            :width="W / zones"
            :height="cellH()"
            :fill="`rgba(59, 130, 246, ${0.1 + cell.ratio * 0.55})`"
            :data-testid="`dest-${cell.row}-${cell.col}`"
          >
            <title>{{ breakdownText(cell.breakdown) }}</title>
          </rect>
          <text
            :x="(W / zones) * cell.col + (W / zones) / 2"
            :y="destY(cell.row) + cellH() / 2"
            text-anchor="middle"
            dominant-baseline="central"
            font-size="56"
            font-weight="600"
            fill="currentColor"
            pointer-events="none"
          >{{ cell.count }}</text>
        </g>
        <!-- アウト位置リング（11 枠。赤系 = アウト, stats-miss-out-detail REQ-102/103） -->
        <g>
          <g
            v-for="r in ringRects"
            :key="r.slot"
          >
            <rect
              :x="r.x"
              :y="r.y"
              :width="r.w"
              :height="r.h"
              rx="10"
              :fill="ringFill(outRing.ring[r.slot].count)"
              stroke="rgba(239, 68, 68, 0.45)"
              stroke-width="3"
              :opacity="outRing.ring[r.slot].count > 0 ? 1 : 0.35"
              :data-testid="`out-${r.slot}`"
            >
              <title>{{ breakdownText(outRing.ring[r.slot].breakdown) }}</title>
            </rect>
            <text
              v-if="outRing.ring[r.slot].count > 0"
              :x="r.x + r.w / 2"
              :y="r.y + r.h / 2"
              text-anchor="middle"
              dominant-baseline="central"
              font-size="48"
              font-weight="600"
              fill="currentColor"
              pointer-events="none"
            >{{ outRing.ring[r.slot].count }}</text>
          </g>
          <!-- ネットは単枠のまま（位置の記録なし, REQ-105） -->
          <text
            v-if="outRing.net.count > 0"
            :x="W + 16"
            :y="NET"
            text-anchor="start"
            dominant-baseline="central"
            font-size="40"
            fill="currentColor"
            data-testid="extra-net"
          >
            {{ $t('shotStats.heatmap.net') }} {{ outRing.net.count }}
            <title>{{ breakdownText(outRing.net.breakdown) }}</title>
          </text>
        </g>
        <!-- 手前（自陣）半面: 選択可能セル（打った本数 + ヒート + 選択枠） -->
        <g
          v-for="row in zones"
          :key="`or-${row}`"
        >
          <g
            v-for="col in zones"
            :key="`oc-${row}-${col}`"
          >
            <rect
              class="origin-cell"
              :x="(W / zones) * (col - 1)"
              :y="originY(row - 1)"
              :width="W / zones"
              :height="cellH()"
              :fill="isSelected(row - 1, col - 1)
                ? 'rgba(234, 179, 8, 0.4)'
                : `rgba(148, 163, 184, ${0.06 + (originCellAt(row - 1, col - 1)?.ratio ?? 0) * 0.35})`"
              :stroke="isSelected(row - 1, col - 1) ? 'rgb(234, 179, 8)' : 'transparent'"
              stroke-width="8"
              :data-testid="`origin-${row - 1}-${col - 1}`"
              @click="emit('selectOrigin', { row: row - 1, col: col - 1 })"
            >
              <title>{{ originTitle(row - 1, col - 1) }}</title>
            </rect>
            <!-- そのゾーンから打った本数（0 は非表示。奥の配球数と区別するためやや控えめ） -->
            <text
              v-if="(originCellAt(row - 1, col - 1)?.count ?? 0) > 0"
              :x="(W / zones) * (col - 1) + (W / zones) / 2"
              :y="originY(row - 1) + cellH() / 2"
              text-anchor="middle"
              dominant-baseline="central"
              font-size="48"
              fill="currentColor"
              opacity="0.7"
              pointer-events="none"
              :data-testid="`origin-count-${row - 1}-${col - 1}`"
            >{{ originCellAt(row - 1, col - 1)!.count }}</text>
          </g>
        </g>
        <!-- コートライン -->
        <g
          fill="none"
          stroke="currentColor"
          stroke-width="6"
          opacity="0.55"
          pointer-events="none"
        >
          <rect
            x="0"
            y="0"
            :width="W"
            :height="H"
          />
          <line
            x1="0"
            :y1="NET - 198"
            :x2="W"
            :y2="NET - 198"
          />
          <line
            x1="0"
            :y1="NET + 198"
            :x2="W"
            :y2="NET + 198"
          />
          <line
            x1="0"
            y1="76"
            :x2="W"
            y2="76"
          />
          <line
            x1="0"
            :y1="H - 76"
            :x2="W"
            :y2="H - 76"
          />
          <line
            :x1="W / 2"
            y1="0"
            :x2="W / 2"
            :y2="NET - 198"
          />
          <line
            :x1="W / 2"
            :y1="NET + 198"
            :x2="W / 2"
            :y2="H"
          />
        </g>
        <line
          x1="0"
          :y1="NET"
          :x2="W"
          :y2="NET"
          stroke="currentColor"
          stroke-width="8"
          stroke-dasharray="18 12"
          opacity="0.8"
          pointer-events="none"
        />
      </svg>
      <!-- 選択ゾーンのショットプロファイル（#5: 候補は 0 本も表示して「打てていない選択肢」を可視化） -->
      <div
        v-if="profile !== null"
        class="zone-profile"
        data-testid="zone-profile"
      >
        <h4 class="profile-title">
          {{ $t('shotStats.heatmap.profileTitle') }}
        </h4>
        <ul class="profile-list">
          <li
            v-for="entry in profile"
            :key="entry.type ?? '__null__'"
            class="profile-row"
            :class="{ 'is-zero': entry.count === 0 }"
            :data-testid="`profile-${entry.type ?? 'unannotated'}`"
          >
            <span class="profile-label">{{ typeLabel(entry.type) }}</span>
            <span class="profile-bar-track">
              <span
                class="profile-bar"
                :style="{ width: `${((entry.count - entry.miss) / profileMax) * 100}%` }"
              />
              <span
                v-if="entry.miss > 0"
                class="profile-bar profile-bar-miss"
                :style="{ width: `${(entry.miss / profileMax) * 100}%` }"
                :data-testid="`profile-miss-${entry.type ?? 'unannotated'}`"
              />
            </span>
            <span class="profile-count">{{ entry.count }}</span>
          </li>
        </ul>
        <p class="profile-legend">
          <span class="legend-swatch legend-ok" /> {{ $t('shotStats.heatmap.legendOk') }}
          <span class="legend-swatch legend-miss" /> {{ $t('shotStats.heatmap.legendMiss') }}
        </p>
        <p
          v-if="isMiddleRow"
          class="profile-note"
        >
          {{ $t('shotStats.heatmap.middleNote') }}
        </p>
      </div>
    </div>
    <p class="hint">
      {{ $t('shotStats.heatmap.hint') }}
    </p>
  </div>
</template>

<style scoped>
.heatmap { display: flex; flex-direction: column; gap: 0.5rem; }
.chart-title { font-size: 0.875rem; font-weight: 600; }
.denominator { font-size: 0.75rem; opacity: 0.7; }
.heatmap-state { font-size: 0.8125rem; font-weight: 500; }
.heatmap-body { display: flex; gap: 1rem; flex-wrap: wrap; align-items: flex-start; }
.court { width: 100%; max-width: 340px; height: auto; display: block; flex: 1 1 240px; }
.zone-profile { flex: 1 1 220px; min-width: 200px; display: flex; flex-direction: column; gap: 0.375rem; }
.profile-title { font-size: 0.8125rem; font-weight: 600; }
.profile-list { list-style: none; padding: 0; margin: 0; display: flex; flex-direction: column; gap: 0.25rem; }
.profile-row { display: grid; grid-template-columns: 7em 1fr 2.5em; align-items: center; gap: 0.5rem; font-size: 0.8125rem; }
.profile-row.is-zero { opacity: 0.45; }
.profile-label { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.profile-bar-track { display: flex; height: 0.625rem; border-radius: 9999px; background: rgba(148, 163, 184, 0.18); overflow: hidden; }
.profile-bar { display: block; height: 100%; background: rgba(59, 130, 246, 0.75); }
.profile-bar-miss { background: rgba(239, 68, 68, 0.85); }
.profile-legend { display: flex; align-items: center; gap: 0.375rem; font-size: 0.75rem; opacity: 0.75; }
.legend-swatch { display: inline-block; width: 0.75rem; height: 0.5rem; border-radius: 2px; }
.legend-ok { background: rgba(59, 130, 246, 0.75); }
.legend-miss { background: rgba(239, 68, 68, 0.85); }
.profile-count { text-align: right; font-variant-numeric: tabular-nums; }
.profile-note { font-size: 0.75rem; opacity: 0.6; }
.origin-cell { cursor: pointer; }
.hint { font-size: 0.75rem; opacity: 0.6; }
</style>
