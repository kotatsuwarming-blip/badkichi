<script setup lang="ts">
/**
 * stats.vue（Group 横断ダッシュボード）— /groups/[id]/stats
 *
 * グローバルフィルタ（対象=全体/選手/ペア、試合期間=日付範囲+個別調整）+ ドリルダウン（役割×ポジション×ラリー長）。
 * 選手/ペア選択時はブレイクダウン、テーブル/ラリー長グラフ連動。別試合のラリー再生はソース切替（:key + autoSeekMs, 2秒前）。
 *
 * 関連要件: REQ-002/004/010/012/104 + 受け入れ2026-06-09
 */
import { computed, onMounted, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import type { VideoSource } from '~/types/video-playback'
import type { PairRate, PlayerRate, RallyRow, StatsRole } from '~/types/stats-dashboard'
import { useStatsView } from '~/composables/useStatsView'
import { useAnnotationCoverage } from '~/composables/useAnnotationCoverage'
import { useRallyFlowView } from '~/composables/useRallyFlowView'
import { useShotStatsView } from '~/composables/useShotStatsView'
import { usePlayers } from '~/composables/usePlayers'
import { useAnalytics } from '~/composables/useAnalytics'

const SEEK_LEAD_MS = 2000

const route = useRoute()
const groupId = route.params.id as string

// 統計ダッシュボード閲覧 (ADR-016 第1ゲート: 記録→統計ファネルの到達点)
const { capture } = useAnalytics()
onMounted(() => capture('stats_viewed', { scope: 'group', group_id: groupId }))

const view = useStatsView({ kind: 'group', groupId })
const { data: players } = usePlayers()

// 3 タブ（概要 / ショット分析 / ラリー展開, NFR-203・設計2026-08-04）。
// チャート列のみ切替え、動画・テーブルはタブ横断で保持（v-show, アンマウントしない）
type StatsTab = 'overview' | 'shots' | 'rallyflow'
const activeTab = ref<StatsTab>('overview')
const coverage = useAnnotationCoverage(() => ({
  p_group_id: groupId,
  p_match_ids: view.includedMatchIds.value
}))
const flow = useRallyFlowView({ kind: 'group', groupId }, {
  includedMatchIds: view.includedMatchIds,
  entity: () => view.globalFilter.value.entity,
  nameOf: view.nameOf
})
const shot = useShotStatsView({ kind: 'group', groupId }, {
  includedMatchIds: view.includedMatchIds,
  entity: () => view.globalFilter.value.entity,
  nameOf: view.nameOf
})
watch(activeTab, (tab) => {
  // タブ初回アクティブ時に遅延取得（NFR-001）
  if (tab !== 'overview' && !coverage.loaded.value) coverage.execute()
  if (tab === 'rallyflow' && !flow.loaded.value) flow.execute()
  if (tab === 'shots' && !shot.loaded.value) shot.execute()
})
const playerOptions = computed(() => (players.value ?? []).map(p => ({ id: p.id, name: p.name })))

const overviewMode = ref<'player' | 'pair'>('player')
const overviewEntries = computed<(PlayerRate | PairRate)[]>(() =>
  overviewMode.value === 'pair' ? (view.overview.value?.pairRates ?? []) : (view.overview.value?.playerRates ?? [])
)
const isEntity = computed(() => view.globalFilter.value.entity.kind !== 'all')

// 別試合のラリー再生 → ソース切替（youtube 即時 / local 再選択）
const videoSource = ref<VideoSource | null>(null)
const currentMatchId = ref<string | null>(null)
const autoSeekMs = ref<number | null>(null)
const pendingLocalRally = ref<RallyRow | null>(null)

function onSelectRally(rally: RallyRow): void {
  if (rally.video_start_timestamp_ms === null) return
  const target = Math.max(0, rally.video_start_timestamp_ms - SEEK_LEAD_MS)
  if (rally.match_id === currentMatchId.value && videoSource.value) {
    autoSeekMs.value = target
    return
  }
  if (rally.video_source_type === 'youtube') {
    currentMatchId.value = rally.match_id
    videoSource.value = { type: 'youtube', url: rally.video_source_url }
    autoSeekMs.value = target
    pendingLocalRally.value = null
  } else {
    pendingLocalRally.value = rally
    videoSource.value = null
  }
}
function onPickLocalFile(e: Event): void {
  const file = (e.target as HTMLInputElement).files?.[0]
  const rally = pendingLocalRally.value
  if (file && rally && rally.video_start_timestamp_ms !== null) {
    currentMatchId.value = rally.match_id
    videoSource.value = { type: 'local', file }
    autoSeekMs.value = Math.max(0, rally.video_start_timestamp_ms - SEEK_LEAD_MS)
    pendingLocalRally.value = null
  }
}

function onOverviewSelect(payload: { playerId?: string, pair?: { player1Id: string, player2Id: string }, role: StatsRole }): void {
  if (payload.pair) view.setEntity({ kind: 'pair', player1Id: payload.pair.player1Id, player2Id: payload.pair.player2Id })
  else if (payload.playerId) view.setEntity({ kind: 'player', playerId: payload.playerId })
}

function onEntitySelect(payload: { playerId?: string, role: StatsRole }): void {
  const e = view.globalFilter.value.entity
  if (e.kind === 'pair' && !view.drilldown.value.memberId && payload.playerId) {
    view.setDrillMember(payload.playerId)
  } else {
    view.setDrillRole(payload.role)
  }
}
function backToPair(): void {
  const m = view.drilldown.value.memberId
  if (m) view.setDrillMember(m)
}
</script>

<template>
  <div class="group-stats-page">
    <header class="stats-header">
      <UButton
        variant="ghost"
        icon="i-lucide-arrow-left"
        :to="`/groups/${groupId}/matches`"
        data-testid="back"
      >
        {{ $t('stats.backToMatches') }}
      </UButton>
      <span class="title">{{ $t('stats.groupTitle') }}</span>
    </header>

    <StatsGlobalFilterBar
      :players="playerOptions"
      :matches-meta="view.matchesMeta.value"
      :global-filter="view.globalFilter.value"
      :included-match-ids="view.includedMatchIds.value"
      :show-period="true"
      @set-entity="view.setEntity"
      @set-date-range="view.setDateRange"
      @toggle-match="view.toggleMatchExclusion"
    />

    <nav class="stats-tabs">
      <UButton
        size="sm"
        :variant="activeTab === 'overview' ? 'solid' : 'ghost'"
        data-testid="tab-overview"
        @click="activeTab = 'overview'"
      >
        {{ $t('shotStats.tabs.overview') }}
      </UButton>
      <UButton
        size="sm"
        :variant="activeTab === 'shots' ? 'solid' : 'ghost'"
        data-testid="tab-shots"
        @click="activeTab = 'shots'"
      >
        {{ $t('shotStats.tabs.shots') }}
      </UButton>
      <UButton
        size="sm"
        :variant="activeTab === 'rallyflow' ? 'solid' : 'ghost'"
        data-testid="tab-rallyflow"
        @click="activeTab = 'rallyflow'"
      >
        {{ $t('shotStats.tabs.rallyflow') }}
      </UButton>
    </nav>

    <StatsEmptyState v-if="view.isEmpty.value" />

    <div
      v-else
      class="stats-grid"
    >
      <section class="charts-col">
        <div
          v-show="activeTab === 'shots'"
          class="tab-panel"
          data-testid="panel-shots"
        >
          <StatsAnnotationBadge
            v-if="coverage.loaded.value"
            :summary="coverage.summary.value"
          />
          <template v-if="shot.loaded.value && !shot.isEmpty.value">
            <StatsShotFilterBar
              :hitter-ids="shot.hitterIds.value"
              :present-types="shot.presentTypes.value"
              :set-numbers="shot.knownSetNumbers.value"
              :player-filter="shot.playerFilter.value"
              :type-filter="shot.typeFilter.value"
              :hand-filter="shot.handFilter.value"
              :set-number="shot.setNumber.value"
              :name-of="view.nameOf"
              @update:player-filter="shot.playerFilter.value = $event"
              @update:type-filter="shot.typeFilter.value = $event"
              @update:hand-filter="shot.handFilter.value = $event; shot.zoneHand.value = $event"
              @update:set-number="shot.setNumber.value = $event"
            />
            <StatsEndingsChart
              :entries="shot.endingEntries.value"
              :ranking="shot.decisiveRanking.value"
            />
            <StatsEndingsCourtMap
              :won="shot.landZonesWon.value"
              :lost="shot.landZonesLost.value"
            />
            <StatsServeTypeChart
              :rows="shot.serveRows.value"
              :name-of="view.nameOf"
            />
            <StatsShotMixChart :rows="shot.filteredTypeRows.value" />
            <StatsShotMixScatter :rows="shot.filteredTypeRows.value" />
            <StatsHandChart :rows="shot.filteredTypeRows.value" />
            <StatsShotHeatmap
              :origin-cells="shot.originCells.value"
              :dest-cells="shot.destCells.value"
              :selected="shot.selectedOrigin.value"
              :total="shot.heatmapTotal.value"
              :pointed-total="coverage.summary.value.shots_pointed"
              @select-origin="shot.selectOrigin"
            />
          </template>
          <p
            v-else-if="shot.pending.value"
            class="placeholder"
          >
            {{ $t('shotStats.loading') }}
          </p>
          <p
            v-else
            class="placeholder"
          >
            {{ $t('shotStats.shotsEmpty') }}
          </p>
        </div>
        <div
          v-show="activeTab === 'rallyflow'"
          class="tab-panel"
          data-testid="panel-rallyflow"
        >
          <!-- Group 横断は J/K のみ（L セット推移は試合単位限定, REQ-017） -->
          <template v-if="flow.loaded.value && !flow.isEmpty.value">
            <StatsPhaseRateChart :entries="flow.phaseEntries.value" />
            <StatsTempoChart
              :samples="flow.tempo.value.samples"
              :excluded="flow.tempo.value.excluded"
              :measure="flow.measure.value"
              @update:measure="flow.measure.value = $event"
            />
          </template>
          <p
            v-else-if="flow.pending.value"
            class="placeholder"
          >
            {{ $t('shotStats.loading') }}
          </p>
          <p
            v-else
            class="placeholder"
          >
            {{ $t('shotStats.flow.empty') }}
          </p>
        </div>
        <div
          v-show="activeTab === 'overview'"
          class="tab-panel"
          data-testid="panel-overview"
        >
          <template v-if="isEntity">
            <div class="entity-controls">
              <StatsPositionToggle
                :position="view.drilldown.value.position"
                @change="view.setDrillPosition"
              />
              <UButton
                v-if="view.drilldown.value.memberId"
                size="xs"
                variant="ghost"
                data-testid="back-to-pair"
                @click="backToPair"
              >
                {{ $t('stats.backToPair') }}
              </UButton>
            </div>
            <StatsRateChart
              :entries="view.entityRates.value"
              mode="player"
              :selected-role="view.drilldown.value.role"
              @select="onEntitySelect"
            />
          </template>
          <template v-else>
            <div class="mode-toggle">
              <UButton
                size="xs"
                :variant="overviewMode === 'player' ? 'solid' : 'ghost'"
                data-testid="mode-player"
                @click="overviewMode = 'player'"
              >
                {{ $t('stats.mode.player') }}
              </UButton>
              <UButton
                size="xs"
                :variant="overviewMode === 'pair' ? 'solid' : 'ghost'"
                data-testid="mode-pair"
                @click="overviewMode = 'pair'"
              >
                {{ $t('stats.mode.pair') }}
              </UButton>
            </div>
            <StatsRateChart
              :entries="overviewEntries"
              :mode="overviewMode"
              @select="onOverviewSelect"
            />
          </template>
          <StatsRallyLengthChart
            :bins="view.rallyLengthBins.value"
            :selected-keys="view.drilldown.value.shotBinKeys"
            @select-bins="view.setDrillBins"
          />
        </div>
      </section>

      <section class="video-col">
        <StatsVideoPane
          v-if="videoSource"
          :key="currentMatchId ?? 'none'"
          :source="videoSource"
          :rally-markers-ms="[]"
          :auto-seek-ms="autoSeekMs"
        />
        <div
          v-else-if="pendingLocalRally"
          class="source-picker"
          data-testid="source-picker"
        >
          <p>{{ $t('record.localReselect') }}</p>
          <input
            type="file"
            accept="video/*"
            data-testid="local-file"
            @change="onPickLocalFile"
          >
        </div>
      </section>

      <section class="table-col">
        <StatsRallyTable
          :rows="view.tableRows.value"
          :show-match="true"
          @select="onSelectRally"
        />
      </section>
    </div>
  </div>
</template>

<style scoped>
.group-stats-page { display: flex; flex-direction: column; gap: 1rem; padding: 1rem; }
.stats-tabs { display: flex; gap: 0.5rem; align-items: center; }
.tab-panel { display: flex; flex-direction: column; gap: 1rem; }
.placeholder { font-size: 0.875rem; opacity: 0.7; }
.stats-header { display: flex; align-items: center; gap: 1rem; }
.title { font-weight: 600; }
.mode-toggle { display: flex; gap: 0.5rem; align-items: center; }
.entity-controls { display: flex; gap: 0.5rem; align-items: center; flex-wrap: wrap; }
.charts-col, .video-col, .table-col { display: flex; flex-direction: column; gap: 1rem; }
.source-picker { display: flex; flex-direction: column; gap: 0.5rem; }
.stats-grid { display: grid; grid-template-columns: 1fr; gap: 1rem; }
@media (min-width: 1024px) {
  .stats-grid {
    grid-template-columns: 1.4fr 1fr;
    grid-template-areas: 'charts video' 'table table';
    align-items: start;
  }
  .charts-col { grid-area: charts; }
  .video-col { grid-area: video; }
  .table-col { grid-area: table; }
}
</style>
