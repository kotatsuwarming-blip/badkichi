<script setup lang="ts">
/**
 * StatsReceiveTypeChart.vue — レシーブ分析ドリルダウン（2026-08-08 #6）
 *
 * Level 1: サーブ種別（ショート/ロング/ドライブ/未注釈）ごとのレシーブ本数（棒）+
 *          レシーブ側得点率（折れ線）。棒タップでそのサーブへドリルダウン。
 * Level 2: 選択サーブへの返球種別ごとの本数 + 得点率。棒タップでコースをさらに絞る。
 * Level 3: 返球コース（相手半面 3×3 + ネット/アウト/コース不明）と各コースの得点率。
 * 選手は打者フィルタで絞る（親が rows を絞って渡す）。サーブ位置トグルあり。
 */
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useChartTextColor } from '~/composables/useChartTextColor'
import { countAxisScale } from '~/utils/shot-stats/chart-axis'
import { buildCourses, buildReturnEntries, buildServeFacets, SERVE_FACETS } from '~/utils/shot-stats/receive'
import type { RateEntry } from '~/utils/shot-stats/receive'
import type { ServePosition } from '~/types/stats-dashboard'
import { OUT_RING_SLOTS } from '~/types/shot-stats'
import type { ReceiveDetailRow } from '~/types/shot-stats'
import type { ShotType } from '~/types/shot-annotation'

const props = defineProps<{ rows: ReceiveDetailRow[] }>()

const { t } = useI18n()
const chartText = useChartTextColor()

const position = ref<ServePosition | null>(null)
/** ドリルダウン状態（undefined 相当を「未選択」として {} で表現） */
const selectedServe = ref<{ type: ShotType | null } | null>(null)
const selectedReturn = ref<{ type: ShotType | null } | null>(null)
watch(selectedServe, () => {
  selectedReturn.value = null
})

const filtered = computed(() =>
  props.rows.filter(r => position.value === null || r.server_position === position.value)
)

const facets = computed(() => buildServeFacets(filtered.value))
const returns = computed<RateEntry[]>(() =>
  selectedServe.value === null ? [] : buildReturnEntries(filtered.value, selectedServe.value.type)
)
const courses = computed(() =>
  selectedServe.value === null
    ? null
    : buildCourses(filtered.value, {
        serveType: selectedServe.value.type,
        ...(selectedReturn.value === null ? {} : { receiveType: selectedReturn.value.type })
      })
)

function typeLabel(type: ShotType | null): string {
  return type === null ? t('shotStats.endings.unannotated') : t(`annotation.shotType.${type}`)
}

function rateText(total: number, won: number): string {
  return total === 0 ? '-' : `${Math.round((won / total) * 100)}%`
}

function comboOption(entries: RateEntry[]) {
  const scale = countAxisScale(Math.max(...entries.map(e => e.total), 0))
  return {
    tooltip: {
      trigger: 'axis',
      formatter: (params: { dataIndex: number }[]) => {
        const e = entries[params[0]!.dataIndex]!
        const rate = e.total === 0 ? '-' : `${Math.round((e.won / e.total) * 100)}% (${e.won}/${e.total})`
        return `${typeLabel(e.type)}<br/>${t('shotStats.combo.count')}: ${e.total}<br/>${t('shotStats.combo.rate')}: ${rate}`
      }
    },
    textStyle: { color: chartText.value, fontSize: 13 },
    legend: { bottom: 0, textStyle: { color: chartText.value, fontSize: 12 } },
    grid: { left: 48, right: 48, top: 20, bottom: 44 },
    xAxis: {
      type: 'category',
      data: entries.map(e => typeLabel(e.type)),
      axisLabel: { color: chartText.value, fontSize: 12 }
    },
    // 両軸を同一分割数に固定してグリッド線を1組に統合（2軸で横線が倍増して見えづらいため）
    yAxis: [
      {
        type: 'value', name: t('shotStats.combo.count'), min: 0, nameGap: 12,
        max: scale.max, interval: scale.interval,
        axisLabel: { color: chartText.value, fontSize: 13 },
        nameTextStyle: { color: chartText.value, fontSize: 12 }
      },
      {
        type: 'value', name: '%', min: 0, max: 100, nameGap: 12, interval: 20,
        splitLine: { show: false },
        axisLabel: { color: chartText.value, fontSize: 13 },
        nameTextStyle: { color: chartText.value, fontSize: 12 }
      }
    ],
    series: [
      { name: t('shotStats.combo.count'), type: 'bar', yAxisIndex: 0, data: entries.map(e => e.total) },
      {
        name: t('shotStats.combo.rate'),
        type: 'line',
        yAxisIndex: 1,
        connectNulls: false,
        data: entries.map(e => (e.total === 0 ? null : Math.round((e.won / e.total) * 1000) / 10))
      }
    ]
  }
}

const facetOption = computed(() => comboOption(facets.value))
const returnOption = computed(() => comboOption(returns.value))

/** Level 1 の棒タップ → サーブ種別を選択（同じ棒で解除） */
function onFacetClick(params: { dataIndex?: number }): void {
  if (typeof params.dataIndex !== 'number') return
  const type = SERVE_FACETS[params.dataIndex]
  if (type === undefined) return
  selectedServe.value = selectedServe.value?.type === type ? null : { type }
}

/** Level 2 の棒タップ → 返球種別でコースを絞る（同じ棒で解除） */
function onReturnClick(params: { dataIndex?: number }): void {
  if (typeof params.dataIndex !== 'number') return
  const entry = returns.value[params.dataIndex]
  if (!entry) return
  selectedReturn.value = selectedReturn.value?.type === entry.type ? null : { type: entry.type }
}

defineExpose({ onFacetClick, onReturnClick })

// コース図（相手半面のみの簡易 SVG）
const CW = 610
const CH = 670
function courseCellY(row: number): number {
  // dest_row 0 = ネット側 = 図の下
  return CH - (row + 1) * (CH / 3)
}

// アウト位置リング（11 枠。コートセルより小さめ, stats-miss-out-detail REQ-101/102）
const RBOX = 96
const RGAP = 10
const ringRects = OUT_RING_SLOTS.map((slot) => {
  const colW = CW / 3
  const rowH = CH / 3
  if (slot === 'left_back') return { slot, x: -RBOX - RGAP, y: -RBOX - RGAP, w: RBOX, h: RBOX }
  if (slot === 'right_back') return { slot, x: CW + RGAP, y: -RBOX - RGAP, w: RBOX, h: RBOX }
  const [side, idx] = slot.split('_') as [string, string]
  const i = Number(idx)
  if (side === 'back') return { slot, x: i * colW + RGAP / 2, y: -RBOX - RGAP, w: colW - RGAP, h: RBOX }
  // サイド: dest_row i (0 = ネット側 = 図の下) に沿わせる
  return { slot, x: side === 'left' ? -RBOX - RGAP : CW + RGAP, y: courseCellY(i) + RGAP / 2, w: RBOX, h: rowH - RGAP }
})

function ringMax(): number {
  if (courses.value === null) return 1
  return Math.max(1, ...OUT_RING_SLOTS.map(slot => courses.value!.ring[slot].total))
}

function ringFill(total: number): string {
  if (total === 0) return 'transparent'
  return `rgba(239, 68, 68, ${0.18 + (total / ringMax()) * 0.45})`
}

/** 返球種別の内訳ツールチップ文字列（配球ヒートマップと同形式, 2026-09-29） */
function typesText(types: { type: ShotType | null, total: number }[]): string {
  return types.map(e => `${typeLabel(e.type)} ${e.total}`).join(' / ')
}
</script>

<template>
  <div class="receive-chart">
    <div class="receive-header">
      <h3 class="chart-title">
        {{ $t('shotStats.receive.title') }}
      </h3>
      <StatsPositionToggle
        :position="position"
        @change="position = $event"
      />
    </div>
    <p class="drill-hint">
      {{ selectedServe === null
        ? $t('shotStats.receive.promptServe')
        : $t('shotStats.receive.drilled', { serve: typeLabel(selectedServe.type) }) }}
    </p>
    <ClientOnly>
      <VChart
        class="chart"
        :option="facetOption"
        autoresize
        @click="onFacetClick"
      />
    </ClientOnly>
    <template v-if="selectedServe !== null">
      <h4 class="sub-title">
        {{ $t('shotStats.receive.returnsTitle', { serve: typeLabel(selectedServe.type) }) }}
      </h4>
      <ClientOnly>
        <VChart
          class="chart"
          :option="returnOption"
          autoresize
          data-testid="receive-returns"
          @click="onReturnClick"
        />
      </ClientOnly>
      <div
        v-if="courses !== null"
        class="course-block"
        data-testid="receive-courses"
      >
        <h4 class="sub-title">
          {{ selectedReturn === null
            ? $t('shotStats.receive.courseTitleAll')
            : $t('shotStats.receive.courseTitle', { type: typeLabel(selectedReturn.type) }) }}
        </h4>
        <svg
          class="course-court"
          :viewBox="`${-RBOX - RGAP - 8} ${-RBOX - RGAP - 8} ${CW + RBOX + RGAP + 8 + 230} ${CH + RBOX + RGAP + 56}`"
          role="img"
        >
          <g
            v-for="cell in courses.cells"
            :key="`${cell.row}:${cell.col}`"
          >
            <title>{{ typesText(cell.types) }}</title>
            <rect
              :x="(CW / 3) * cell.col"
              :y="courseCellY(cell.row)"
              :width="CW / 3"
              :height="CH / 3"
              :fill="`rgba(59, 130, 246, ${0.1 + cell.ratio * 0.55})`"
              :data-testid="`course-${cell.row}-${cell.col}`"
            />
            <text
              :x="(CW / 3) * cell.col + CW / 6"
              :y="courseCellY(cell.row) + CH / 6 - 26"
              text-anchor="middle"
              font-size="48"
              font-weight="600"
              fill="currentColor"
            >{{ cell.total }}</text>
            <text
              :x="(CW / 3) * cell.col + CW / 6"
              :y="courseCellY(cell.row) + CH / 6 + 34"
              text-anchor="middle"
              font-size="38"
              fill="currentColor"
              opacity="0.75"
            >{{ rateText(cell.total, cell.won) }}</text>
          </g>
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
              :width="CW"
              :height="CH"
            />
            <line
              x1="0"
              y1="76"
              :x2="CW"
              y2="76"
            />
            <line
              x1="0"
              :y1="CH - 198"
              :x2="CW"
              :y2="CH - 198"
            />
            <line
              :x1="CW / 2"
              y1="0"
              :x2="CW / 2"
              :y2="CH - 198"
            />
          </g>
          <line
            x1="0"
            :y1="CH"
            :x2="CW"
            :y2="CH"
            stroke="currentColor"
            stroke-width="8"
            stroke-dasharray="18 12"
            opacity="0.8"
          />
          <!-- アウト位置リング（11 枠。赤系 = アウト, REQ-102/103） -->
          <g v-if="courses !== null">
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
                :fill="ringFill(courses.ring[r.slot].total)"
                stroke="rgba(239, 68, 68, 0.45)"
                stroke-width="3"
                :opacity="courses.ring[r.slot].total > 0 ? 1 : 0.35"
                :data-testid="`course-out-${r.slot}`"
              >
                <title v-if="courses.ring[r.slot].total > 0">{{ typesText(courses.ring[r.slot].types) }}</title>
              </rect>
              <text
                v-if="courses.ring[r.slot].total > 0"
                :x="r.x + r.w / 2"
                :y="r.y + r.h / 2"
                text-anchor="middle"
                dominant-baseline="central"
                font-size="46"
                font-weight="600"
                fill="currentColor"
                pointer-events="none"
              >{{ courses.ring[r.slot].total }}</text>
            </g>
            <!-- ネットは点線 (ネットライン) の右横に単枠表示 (配球ヒートマップと同形式, 2026-09-29) -->
            <text
              v-if="courses.net.total > 0"
              :x="CW + 20"
              :y="CH"
              text-anchor="start"
              dominant-baseline="central"
              font-size="40"
              fill="currentColor"
              data-testid="course-net"
            >
              {{ $t('shotStats.heatmap.net') }} {{ courses.net.total }}
              <title>{{ typesText(courses.net.types) }}</title>
            </text>
          </g>
        </svg>
      </div>
    </template>
  </div>
</template>

<style scoped>
.receive-chart { display: flex; flex-direction: column; gap: 0.375rem; }
.receive-header { display: flex; align-items: center; justify-content: space-between; gap: 0.5rem; flex-wrap: wrap; }
.chart-title { font-size: 0.875rem; font-weight: 600; }
.sub-title { font-size: 0.8125rem; font-weight: 600; }
.drill-hint { font-size: 0.75rem; opacity: 0.7; }
.chart { width: 100%; height: 260px; }
.course-block { display: flex; flex-direction: column; gap: 0.375rem; }
.course-court { width: 100%; max-width: 300px; height: auto; display: block; }
</style>
