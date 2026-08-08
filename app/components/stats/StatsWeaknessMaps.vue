<script setup lang="ts">
/**
 * StatsWeaknessMaps.vue — 弱点分析（2026-08-08 #8, 川島アドバイス）
 *
 * 1. ミスした打点: 自分のショットがネット/アウトで終わった打点のヒートマップ（自陣半面）
 * 2. 決められた落下点: 相手の決定打が自陣に落ちた位置のヒートマップ。
 *    ダブルスはどちらの選手が取るべきだったか判別できないため**チーム単位**
 *    （選手を選んでもペア両選手で同じ図が出る）。
 * ※「崩され」の遡り分析（決められる前のどのショットで崩されたか）は集計方法を検討中（note 参照）。
 */
import type { LandZoneResult, PlacementDestCell } from '~/types/shot-stats'

defineProps<{
  /** ミス打点（自陣半面 3×3 の origin セル） */
  missCells: PlacementDestCell[]
  /** 被決定点（buildLandZones の lost 側） */
  lost: LandZoneResult
}>()
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
        data-testid="weakness-miss-map"
      />
    </div>
    <div class="map-block">
      <h3 class="chart-title">
        {{ $t('shotStats.weakness.concededTitle') }}
      </h3>
      <p class="map-note">
        {{ $t('shotStats.weakness.teamNote') }}
      </p>
      <StatsCourtZones
        :cells="lost.cells"
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
.map-note { font-size: 0.75rem; opacity: 0.7; }
.followup-note { font-size: 0.75rem; opacity: 0.6; }
</style>
