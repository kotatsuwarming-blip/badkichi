<script setup lang="ts">
/**
 * StatsShotHeatmap.vue — F 配球ヒートマップ（REQ-011 改訂, ヒアリング2026-08-08）
 *
 * 手前（自陣）3×3 のセルをタップで選択 → そのセルから打ったショットの配球先が
 * 奥（相手）3×3 に本数で表示される。数字ホバーで球種内訳（<title> ツールチップ）。
 * 未選択時は全セル合計 + 選択を促す文言。同一セル再タップで解除。
 * 座標は選手視点固定（下 = 自陣, REQ-105）。
 */
import { useI18n } from 'vue-i18n'
import type { PlacementDestCell, ZoneCell } from '~/types/shot-stats'

const props = withDefaults(defineProps<{
  originCells: ZoneCell[]
  destCells: PlacementDestCell[]
  selected: { row: number, col: number } | null
  /** 表示中の配球総数（母数併記, NFR-201） */
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

function cellH(): number {
  return H / (props.zones * 2)
}

/** 手前セル（origin_row 0=自陣バック）→ SVG y（下が自陣バック） */
function originY(row: number): number {
  return H - (row + 1) * cellH()
}

/** 奥セル（dest_row 0=ネット側）→ SVG y */
function destY(row: number): number {
  return NET - (row + 1) * cellH() + cellH()
}

function originCellAt(row: number, col: number): ZoneCell | null {
  return props.originCells.find(c => c.row === row && c.col === col) ?? null
}

function isSelected(row: number, col: number): boolean {
  return props.selected?.row === row && props.selected?.col === col
}

/** 球種内訳ツールチップ文字列（ホバー表示, ヒアリング2026-08-08） */
function breakdownText(cell: PlacementDestCell): string {
  return cell.breakdown
    .map(b => `${b.type === null ? t('shotStats.endings.unannotated') : t(`annotation.shotType.${b.type}`)} ${b.count}`)
    .join(' / ')
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
    <svg
      class="court"
      :viewBox="`-8 -8 ${W + 16} ${H + 16}`"
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
          <title>{{ breakdownText(cell) }}</title>
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
      <!-- 手前（自陣）半面: 選択可能セル（打った本数の数字 + ヒート + 選択枠） -->
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
            <title>{{ $t('shotStats.heatmap.originTip', { n: originCellAt(row - 1, col - 1)?.count ?? 0 }) }}</title>
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
.court { width: 100%; max-width: 280px; height: auto; display: block; }
.origin-cell { cursor: pointer; }
.hint { font-size: 0.75rem; opacity: 0.6; }
</style>
