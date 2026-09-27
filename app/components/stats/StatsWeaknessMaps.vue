<script setup lang="ts">
/**
 * StatsWeaknessMaps.vue — 弱点分析（2026-08-08 #8, 川島アドバイス）
 *
 * 1. ミスした打点: 自分のショットがネット/アウトで終わった打点のヒートマップ（自陣半面）。
 *    セルは全ミス中の割合 (%) 表示。ホバー/クリックで球種内訳 + 決着種別（ネット/アウト）
 *    （stats-miss-out-detail REQ-001〜003, 2026-09-28）。
 * 2. 決められた落下点: 相手の決定打が自陣に落ちた位置のヒートマップ。
 *    ダブルスはどちらの選手が取るべきだったか判別できないため**チーム単位**
 *    （選手を選んでもペア両選手で同じ図が出る）。
 *    シングルスはチーム = 個人のため選手単位の注記に切り替える (REQ-302)。
 * ※「崩され」の遡り分析（決められる前のどのショットで崩されたか）は集計方法を検討中（note 参照）。
 */
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import type { LandZoneResult, PlacementBreakdown, PlacementDestCell } from '~/types/shot-stats'

const props = defineProps<{
  /** ミス打点（自陣半面 3×3 の origin セル。breakdown に net 内訳あり） */
  missCells: PlacementDestCell[]
  /** 同フィルタでの打点セル別の総打数（% の分母 = その地点から打った本数, 2026-09-29 修正） */
  shotTotals: PlacementDestCell[]
  /** 被決定点（buildLandZones の lost 側） */
  lost: LandZoneResult
  /** シングルス試合なら true (被決定点の注記を選手単位の文言に、REQ-302) */
  singles?: boolean
}>()

const { t } = useI18n()

// ---- ミス打点の内訳（REQ-001〜003） ----
/** クリック選択中のセル。同一セル再クリックで解除 */
const selectedMiss = ref<{ row: number, col: number } | null>(null)

function onSelectMiss(cell: { row: number, col: number }): void {
  selectedMiss.value
    = selectedMiss.value?.row === cell.row && selectedMiss.value?.col === cell.col ? null : cell
}

function typeLabel(type: PlacementBreakdown['type']): string {
  return type === null ? t('shotStats.endings.unannotated') : t(`annotation.shotType.${type}`)
}

/** 1 エントリの表示: 球種 n 本（ネット x / アウト y） */
function entryText(b: PlacementBreakdown): string {
  return t('shotStats.weakness.missEntry', {
    type: typeLabel(b.type), n: b.count, net: b.net, out: b.count - b.net
  })
}

/** ホバーツールチップ（"row:col" → 内訳文字列） */
const missTitles = computed<Record<string, string>>(() =>
  Object.fromEntries(props.missCells.map(c => [
    `${c.row}:${c.col}`,
    c.breakdown.map(entryText).join(' / ')
  ]))
)

/** クリック選択パネルの内訳（未選択は null） */
const selectedBreakdown = computed<PlacementBreakdown[] | null>(() => {
  const sel = selectedMiss.value
  if (sel === null) return null
  const cell = props.missCells.find(c => c.row === sel.row && c.col === sel.col)
  return cell?.breakdown ?? []
})

const missTotal = computed(() => props.missCells.reduce((s, c) => s + c.count, 0))

/** % の分母: その地点から打った総本数（キー = "row:col"） */
/** 決められた落下点のホバー内訳（決定打の球種, 2026-09-29） */
const concededTitles = computed<Record<string, string>>(() =>
  Object.fromEntries(props.lost.cells.map(c => [
    `${c.row}:${c.col}`,
    c.types.map(e => `${typeLabel(e.type)} ${e.count}`).join(' / ')
  ]))
)

const missDenominators = computed<Record<string, number>>(() =>
  Object.fromEntries(props.shotTotals.map(c => [`${c.row}:${c.col}`, c.count]))
)

/** 選択セルのサマリ（ミス n / 打った total, ミス率） */
const selectedSummary = computed<{ miss: number, total: number, pct: number } | null>(() => {
  const sel = selectedMiss.value
  if (sel === null) return null
  const miss = props.missCells.find(c => c.row === sel.row && c.col === sel.col)?.count ?? 0
  const total = missDenominators.value[`${sel.row}:${sel.col}`] ?? miss
  return { miss, total, pct: total > 0 ? Math.round((miss / total) * 100) : 0 }
})
</script>

<template>
  <div class="weakness-maps">
    <div class="map-block">
      <h3 class="chart-title">
        {{ $t('shotStats.weakness.missTitle') }}
      </h3>
      <p class="map-note">
        {{ $t('shotStats.weakness.missNote') }}
      </p>
      <StatsCourtZones
        :cells="missCells"
        percent
        :percent-denominators="missDenominators"
        selectable
        :selected="selectedMiss"
        :cell-titles="missTitles"
        data-testid="weakness-miss-map"
        @select="onSelectMiss"
      />
      <p
        v-if="missTotal > 0"
        class="map-note"
      >
        {{ $t('shotStats.weakness.missPercentNote', { total: missTotal }) }}
      </p>
      <!-- クリック選択したセルの内訳（球種 × ネット/アウト, REQ-002） -->
      <div
        v-if="selectedBreakdown !== null"
        class="miss-detail"
        data-testid="miss-detail"
      >
        <h4 class="sub-title">
          {{ $t('shotStats.weakness.missDetailTitle') }}
        </h4>
        <p
          v-if="selectedSummary !== null"
          class="map-note"
          data-testid="miss-detail-summary"
        >
          {{ $t('shotStats.weakness.missDetailSummary', selectedSummary) }}
        </p>
        <p
          v-if="selectedBreakdown.length === 0"
          class="map-note"
        >
          {{ $t('shotStats.weakness.missDetailEmpty') }}
        </p>
        <ul v-else>
          <li
            v-for="b in selectedBreakdown"
            :key="b.type ?? '__null__'"
            :data-testid="`miss-detail-${b.type ?? 'unannotated'}`"
          >
            {{ entryText(b) }}
          </li>
        </ul>
      </div>
    </div>
    <div class="map-block">
      <h3 class="chart-title">
        {{ $t('shotStats.weakness.concededTitle') }}
      </h3>
      <p class="map-note">
        {{ $t(singles ? 'shotStats.weakness.playerNote' : 'shotStats.weakness.teamNote') }}
      </p>
      <StatsCourtZones
        :cells="lost.cells"
        :cell-titles="concededTitles"
        data-testid="weakness-conceded-map"
      />
      <p
        v-if="lost.outFallback.side + lost.outFallback.back + lost.outFallback.both + lost.unlocated > 0"
        class="map-note"
      >
        {{ $t('shotStats.endings.outNote', {
          side: lost.outFallback.side,
          back: lost.outFallback.back,
          both: lost.outFallback.both,
          unlocated: lost.unlocated
        }) }}
      </p>
    </div>
    <p class="followup-note">
      {{ $t('shotStats.weakness.followupNote') }}
    </p>
  </div>
</template>

<style scoped>
.weakness-maps { display: flex; flex-direction: column; gap: 1rem; }
.map-block { display: flex; flex-direction: column; gap: 0.375rem; }
.chart-title { font-size: 0.875rem; font-weight: 600; }
.sub-title { font-size: 0.8125rem; font-weight: 600; }
.map-note { font-size: 0.75rem; opacity: 0.7; }
.followup-note { font-size: 0.75rem; opacity: 0.6; }
.miss-detail { border: 1px solid var(--ui-border, #e5e7eb); border-radius: 8px; padding: 0.5rem 0.75rem; }
.miss-detail ul { margin: 0; padding-left: 1.1rem; font-size: 0.8125rem; }
.miss-detail li { margin: 0.125rem 0; }
</style>
