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

// 4 タブ（サーブ周り / 強み / 弱点 / ラリー展開, 2026-08-08 #8 再編）
type StatsTab = 'serve' | 'strengths' | 'weakness' | 'rallyflow'
const activeTab = ref<StatsTab>('serve')
const coverage = useAnnotationCoverage(() => ({
  p_group_id: groupId,
  p_match_ids: view.includedMatchIds.value
}))
const globalSetNumber = computed(() => view.globalFilter.value.setNumber)
const flow = useRallyFlowView({ kind: 'group', groupId }, {
  includedMatchIds: view.includedMatchIds,
  setNumber: globalSetNumber,
  entity: () => view.entity.value,
  nameOf: view.nameOf
})
const shot = useShotStatsView({ kind: 'group', groupId }, {
  includedMatchIds: view.includedMatchIds,
  setNumber: globalSetNumber,
  entity: () => view.entity.value,
  nameOf: view.nameOf
})
// 既定タブ（サーブ周り）が注釈データを使うため、注釈系は初期ロード。ラリー展開のみ遅延
onMounted(() => {
  coverage.execute()
  shot.execute()
})
watch(activeTab, (tab) => {
  if (tab === 'rallyflow' && !flow.loaded.value) flow.execute()
})
// バッジは対象試合（チェックボックス・期間）の変更に追従（shot/flow は composable 内 watch）
watch(view.includedMatchIds, () => {
  if (coverage.loaded.value || coverage.pending.value) coverage.execute()
})
const playerOptions = computed(() => (players.value ?? []).map(p => ({ id: p.id, name: p.name })))

const overviewEntries = computed<(PlayerRate | PairRate)[]>(() =>
  view.globalFilter.value.subjectMode === 'pair'
    ? (view.overview.value?.pairRates ?? [])
    : (view.overview.value?.playerRates ?? [])
)
const isEntity = computed(() => view.entity.value.kind !== 'all')

// 別試合のラリー再生 → ソース切替（youtube 即時 / local 再選択）
const videoSource = ref<VideoSource | null>(null)
const currentMatchId = ref<string | null>(null)
const autoSeekMs = ref<number | null>(null)
const pendingLocalRally = ref<RallyRow | null>(null)
// 動画パネルの表示/非表示（非表示中はチャートをフル幅に。ラリー選択で自動再表示, 2026-08-16）
const videoHidden = ref(false)

function onSelectRally(rally: RallyRow): void {
  if (rally.video_start_timestamp_ms === null) return
  videoHidden.value = false
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

/** テンポ散布図の点タップ → 該当ラリーを 2 秒前から再生（ソース切替は onSelectRally と同一） */
function onSelectTempoRally(rallyId: string): void {
  const r = flow.rows.value.find(x => x.rallyId === rallyId)
  if (!r || r.videoStartMs === null) return
  onSelectRally({
    match_id: r.matchId,
    video_start_timestamp_ms: r.videoStartMs,
    video_source_type: r.videoSourceType,
    video_source_url: r.videoSourceUrl
  } as RallyRow)
}

function onOverviewSelect(payload: { playerId?: string, pair?: { player1Id: string, player2Id: string }, role: StatsRole }): void {
  if (payload.pair) view.setEntity({ kind: 'pair', player1Id: payload.pair.player1Id, player2Id: payload.pair.player2Id })
  else if (payload.playerId) view.setEntity({ kind: 'player', playerId: payload.playerId })
}

function onEntitySelect(payload: { playerId?: string, role: StatsRole }): void {
  const e = view.entity.value
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
      :set-numbers="view.knownSetNumbers.value"
      :show-period="true"
      @set-subject-mode="view.setSubjectMode"
      @set-player="view.setPlayer"
      @set-pair1="view.setPair1"
      @set-pair2="view.setPair2"
      @set-set-number="view.setSetNumber"
      @set-date-range="view.setDateRange"
      @toggle-match="view.toggleMatchExclusion"
    />

    <nav class="stats-tabs">
      <UButton
        size="sm"
        :variant="activeTab === 'serve' ? 'solid' : 'ghost'"
        data-testid="tab-serve"
        @click="activeTab = 'serve'"
      >
        {{ $t('shotStats.tabs.serve') }}
      </UButton>
      <UButton
        size="sm"
        :variant="activeTab === 'strengths' ? 'solid' : 'ghost'"
        data-testid="tab-strengths"
        @click="activeTab = 'strengths'"
      >
        {{ $t('shotStats.tabs.strengths') }}
      </UButton>
      <UButton
        size="sm"
        :variant="activeTab === 'weakness' ? 'solid' : 'ghost'"
        data-testid="tab-weakness"
        @click="activeTab = 'weakness'"
      >
        {{ $t('shotStats.tabs.weakness') }}
      </UButton>
      <UButton
        size="sm"
        :variant="activeTab === 'rallyflow' ? 'solid' : 'ghost'"
        data-testid="tab-rallyflow"
        @click="activeTab = 'rallyflow'"
      >
        {{ $t('shotStats.tabs.rallyflow') }}
      </UButton>
      <UButton
        size="sm"
        variant="ghost"
        class="video-toggle"
        :icon="videoHidden ? 'i-lucide-video' : 'i-lucide-video-off'"
        data-testid="video-toggle"
        @click="videoHidden = !videoHidden"
      >
        {{ videoHidden ? $t('stats.video.show') : $t('stats.video.hide') }}
      </UButton>
    </nav>

    <StatsAnnotationBadge
      v-if="coverage.loaded.value"
      :summary="coverage.summary.value"
    />

    <StatsEmptyState v-if="view.isEmpty.value" />

    <div
      v-else
      class="stats-grid"
      :class="{ 'video-hidden': videoHidden }"
    >
      <section class="charts-col">
        <div
          v-show="activeTab === 'serve'"
          class="tab-panel"
          data-testid="panel-serve"
        >
          <!-- ポジション別得点率とラリー長は同じドリルダウンに連動するため横並び (2026-08-16) -->
          <div class="serve-top">
            <div class="rate-block">
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
                <StatsRateChart
                  :entries="overviewEntries"
                  :mode="view.globalFilter.value.subjectMode"
                  @select="onOverviewSelect"
                />
              </template>
            </div>
            <StatsRallyLengthChart
              :bins="view.rallyLengthBins.value"
              :selected-keys="view.drilldown.value.shotBinKeys"
              @select-bins="view.setDrillBins"
            />
          </div>
          <template v-if="shot.loaded.value">
            <StatsServeTypeChart :rows="shot.filteredServeRows.value" />
            <StatsReceiveTypeChart :rows="shot.filteredReceiveRows.value" />
          </template>
          <p
            v-else
            class="placeholder"
          >
            {{ $t('shotStats.loading') }}
          </p>
        </div>
        <div
          v-show="activeTab === 'strengths'"
          class="tab-panel"
          data-testid="panel-strengths"
        >
          <p class="placeholder">
            {{ $t('shotStats.strengths.note') }}
          </p>
        </div>
        <div
          v-show="activeTab === 'weakness'"
          class="tab-panel"
          data-testid="panel-weakness"
        >
          <StatsWeaknessMaps
            v-if="shot.loaded.value"
            :miss-cells="shot.missOriginCells.value"
            :lost="shot.landZonesLost.value"
          />
          <p
            v-else
            class="placeholder"
          >
            {{ $t('shotStats.loading') }}
          </p>
        </div>
        <div
          v-show="activeTab === 'rallyflow'"
          class="tab-panel"
          data-testid="panel-rallyflow"
        >
          <!-- 配球ヒートマップ（3打目以降 = ラリー分析のためラリー展開へ, 2026-08-08 再編） -->
          <StatsShotHeatmap
            v-if="shot.loaded.value"
            :origin-cells="shot.originCells.value"
            :dest-cells="shot.destCells.value"
            :selected="shot.selectedOrigin.value"
            :dest-extras="shot.destExtras.value"
            :total="shot.heatmapTotal.value"
            :pointed-total="coverage.summary.value.shots_pointed"
            @select-origin="shot.selectOrigin"
          />
          <!-- Group 横断は J/K のみ（L セット推移は試合単位限定, REQ-017） -->
          <template v-if="flow.loaded.value && !flow.isEmpty.value">
            <StatsPhaseRateChart :entries="flow.phaseEntries.value" />
            <StatsTempoChart
              :samples="flow.tempo.value.samples"
              :excluded="flow.tempo.value.excluded"
              @select="onSelectTempoRally"
            />
          </template>
          <p
            v-else-if="flow.pending.value"
            class="placeholder"
          >
            {{ $t('shotStats.loading') }}
          </p>
        </div>
      </section>

      <section
        v-show="!videoHidden"
        class="video-col"
      >
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
.stats-tabs { display: flex; gap: 0.5rem; align-items: center; flex-wrap: wrap; }
.video-toggle { margin-left: auto; }
.tab-panel { display: flex; flex-direction: column; gap: 1rem; }
.placeholder { font-size: 0.875rem; opacity: 0.7; }
.stats-header { display: flex; align-items: center; gap: 1rem; }
.title { font-weight: 600; }
.entity-controls { display: flex; gap: 0.5rem; align-items: center; flex-wrap: wrap; }
.charts-col, .video-col, .table-col { display: flex; flex-direction: column; gap: 1rem; }
.source-picker { display: flex; flex-direction: column; gap: 0.5rem; }
.serve-top { display: grid; grid-template-columns: 1fr; gap: 1rem; align-items: start; }
.rate-block { display: flex; flex-direction: column; gap: 0.5rem; min-width: 0; }
.stats-grid { display: grid; grid-template-columns: 1fr; gap: 1rem; }
@media (min-width: 1024px) {
  .stats-grid {
    grid-template-columns: 1.4fr 1fr;
    grid-template-areas: 'charts video' 'table table';
    align-items: start;
  }
  .charts-col { grid-area: charts; }
  .video-col { grid-area: video; }
  /* 動画はスクロールに追従（下方のチャートから再生しても見える, 2026-08-16） */
  .video-col { position: sticky; top: 1rem; }
  .table-col { grid-area: table; }
  .serve-top { grid-template-columns: 1fr 1fr; }
  /* 動画パネル非表示中はチャートをフル幅に (2026-08-16) */
  .stats-grid.video-hidden {
    grid-template-columns: 1fr;
    grid-template-areas: 'charts' 'table';
  }
}
</style>
