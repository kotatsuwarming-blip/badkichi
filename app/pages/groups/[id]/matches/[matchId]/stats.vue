<script setup lang="ts">
/**
 * stats.vue（試合単位ダッシュボード）— /groups/[id]/matches/[matchId]/stats
 *
 * グローバルフィルタ（対象=全体/選手/ペア）+ ドリルダウン（役割×ポジション×ラリー長）。
 * 全体: 選手別/ペア別の得点率一覧。選手/ペア選択時: サーブ/レシーブ×右(偶)/左(奇)のブレイクダウン。
 * ラリーテーブル・ラリー長グラフはドリルダウンに連動。行選択で 2 秒前から埋め込み再生。
 *
 * 関連要件: REQ-001/003/004/005/006/007/010/011/103 + 受け入れ2026-06-09
 */
import { computed, onMounted, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import type { VideoSource } from '~/types/video-playback'
import type { PairRate, PlayerRate, RallyRow, StatsRole } from '~/types/stats-dashboard'
import type { FlowRally, WormPoint } from '~/types/shot-stats'
import type { Team } from '~/utils/rule-engine/types'
import { useMatchForRecording } from '~/composables/useMatchForRecording'
import { useStatsView } from '~/composables/useStatsView'
import { useAnnotationCoverage } from '~/composables/useAnnotationCoverage'
import { useRallyFlowView } from '~/composables/useRallyFlowView'
import { useShotStatsView } from '~/composables/useShotStatsView'
import { useAnalytics } from '~/composables/useAnalytics'
import { buildWorm } from '~/utils/shot-stats/momentum'
import { subjectTeamOf } from '~/utils/shot-stats/flow'

const SEEK_LEAD_MS = 2000 // 再生はサーブの 2 秒前から（受け入れ2026-06-09）

const route = useRoute()
const matchId = route.params.matchId as string
const groupId = route.params.id as string

// 統計ダッシュボード閲覧 (ADR-016 第1ゲート: 記録→統計ファネルの到達点)
const { capture } = useAnalytics()
onMounted(() => capture('stats_viewed', { scope: 'match', match_id: matchId, group_id: groupId }))

const { data: match } = useMatchForRecording(matchId)
const view = useStatsView({ kind: 'match', matchId, groupId })

// 4 タブ（サーブ周り / 強み / 弱点 / ラリー展開, 2026-08-08 #8 再編）
type StatsTab = 'serve' | 'strengths' | 'weakness' | 'rallyflow'
const activeTab = ref<StatsTab>('serve')
const coverage = useAnnotationCoverage(() => ({ p_match_id: matchId }))
const globalSetNumber = computed(() => view.globalFilter.value.setNumber)
const flow = useRallyFlowView({ kind: 'match', matchId, groupId }, {
  includedMatchIds: view.includedMatchIds,
  setNumber: globalSetNumber,
  entity: () => view.entity.value,
  nameOf: view.nameOf
})
const shot = useShotStatsView({ kind: 'match', matchId, groupId }, {
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

// L: セット選択とワーム系列（視点 = 選択中の選手/ペアのチーム。全体時はチーム A, REQ-017）
const selectedSet = ref<number | null>(null)
function perspectiveOf(rallies: FlowRally[]): Team {
  const subj = flow.subject.value
  if (subj.kind === 'all' || rallies.length === 0) return 'A'
  return subjectTeamOf(rallies[0]!, subj) ?? 'A'
}
const currentSet = computed(() => selectedSet.value ?? flow.setNumbers.value[0] ?? null)
const wormPoints = computed<WormPoint[]>(() => {
  if (currentSet.value === null) return []
  const rallies = flow.ralliesOfSet(currentSet.value)
  return buildWorm(rallies, perspectiveOf(rallies))
})
function onSelectWormPoint(point: WormPoint): void {
  // タップ → 動画ジャンプ（既定 2 秒前, REQ-019）
  if (point.videoStartMs === null) return
  videoPane.value?.seekToMs(Math.max(0, point.videoStartMs - SEEK_LEAD_MS))
}

/** テンポ散布図の点タップ → 2 秒前から再生（REQ-019 準拠） */
function onSelectTempoRally(rallyId: string): void {
  const r = flow.rows.value.find(x => x.rallyId === rallyId)
  if (!r || r.videoStartMs === null) return
  videoPane.value?.seekToMs(Math.max(0, r.videoStartMs - SEEK_LEAD_MS))
}

// 対象選択用の選手一覧（この試合の 4 選手）
const players = computed(() => (match.value?.roster ?? []).map(r => ({ id: r.playerId, name: r.name })))

const overviewEntries = computed<(PlayerRate | PairRate)[]>(() =>
  view.globalFilter.value.subjectMode === 'pair'
    ? (view.overview.value?.pairRates ?? [])
    : (view.overview.value?.playerRates ?? [])
)
const isEntity = computed(() => view.entity.value.kind !== 'all')

// 動画ソース（youtube 即時 / local 再選択）
const videoSource = ref<VideoSource | null>(null)
watch(match, (m) => {
  if (m && m.videoSourceType === 'youtube' && !videoSource.value) {
    videoSource.value = { type: 'youtube', url: m.videoSourceUrl }
  }
}, { immediate: true })
function onPickLocalFile(e: Event): void {
  const file = (e.target as HTMLInputElement).files?.[0]
  if (file) videoSource.value = { type: 'local', file }
}

const videoPane = ref<{ seekToMs: (ms: number) => void } | null>(null)
function onSelectRally(rally: RallyRow): void {
  if (rally.video_start_timestamp_ms === null) return
  videoPane.value?.seekToMs(Math.max(0, rally.video_start_timestamp_ms - SEEK_LEAD_MS))
}

// 全体オーバービューの棒クリック → その選手/ペアを対象に（ドリルイン）
function onOverviewSelect(payload: { playerId?: string, pair?: { player1Id: string, player2Id: string }, role: StatsRole }): void {
  if (payload.pair) view.setEntity({ kind: 'pair', player1Id: payload.pair.player1Id, player2Id: payload.pair.player2Id })
  else if (payload.playerId) view.setEntity({ kind: 'player', playerId: payload.playerId })
}

// 選手/ペアの棒クリック → ペア(未フォーカス)なら個人へドリルダウン、それ以外は役割ドリルダウン
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
  <div class="stats-page">
    <header class="stats-header">
      <UButton
        variant="ghost"
        icon="i-lucide-arrow-left"
        :to="`/groups/${groupId}/matches`"
        data-testid="back"
      >
        {{ $t('stats.backToMatches') }}
      </UButton>
      <span class="match-name">{{ match?.name ?? $t('stats.matchTitle') }}</span>
      <UButton
        class="record-btn"
        variant="outline"
        icon="i-lucide-circle-dot"
        :to="`/groups/${groupId}/matches/${matchId}/record`"
        data-testid="to-record"
      >
        {{ $t('stats.backToRecord') }}
      </UButton>
    </header>

    <StatsGlobalFilterBar
      :players="players"
      :matches-meta="[]"
      :global-filter="view.globalFilter.value"
      :included-match-ids="view.includedMatchIds.value"
      :set-numbers="view.knownSetNumbers.value"
      :show-period="false"
      @set-subject-mode="view.setSubjectMode"
      @set-player="view.setPlayer"
      @set-pair1="view.setPair1"
      @set-pair2="view.setPair2"
      @set-set-number="view.setSetNumber"
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
    </nav>

    <StatsAnnotationBadge
      v-if="coverage.loaded.value"
      :summary="coverage.summary.value"
    />

    <StatsEmptyState v-if="view.isEmpty.value" />

    <div
      v-else
      class="stats-grid"
    >
      <section class="charts-col">
        <div
          v-show="activeTab === 'serve'"
          class="tab-panel"
          data-testid="panel-serve"
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
            <StatsRateChart
              :entries="overviewEntries"
              :mode="view.globalFilter.value.subjectMode"
              @select="onOverviewSelect"
            />
          </template>
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
          <StatsRallyLengthChart
            :bins="view.rallyLengthBins.value"
            :selected-keys="view.drilldown.value.shotBinKeys"
            @select-bins="view.setDrillBins"
          />
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
          <template v-if="flow.loaded.value && !flow.isEmpty.value">
            <StatsPhaseRateChart :entries="flow.phaseEntries.value" />
            <StatsTempoChart
              :samples="flow.tempo.value.samples"
              :excluded="flow.tempo.value.excluded"
              @select="onSelectTempoRally"
            />
            <div
              v-if="flow.setNumbers.value.length > 0"
              class="set-toggle"
            >
              <UButton
                v-for="sn in flow.setNumbers.value"
                :key="sn"
                size="xs"
                :variant="currentSet === sn ? 'solid' : 'ghost'"
                :data-testid="`set-${sn}`"
                @click="selectedSet = sn"
              >
                {{ $t('shotStats.flow.set', { n: sn }) }}
              </UButton>
            </div>
            <StatsSetFlowChart
              :points="wormPoints"
              @select="onSelectWormPoint"
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

      <section class="video-col">
        <StatsVideoPane
          v-if="videoSource"
          ref="videoPane"
          :source="videoSource"
          :rally-markers-ms="[]"
        />
        <div
          v-else
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
          @select="onSelectRally"
        />
      </section>
    </div>
  </div>
</template>

<style scoped>
.stats-page { display: flex; flex-direction: column; gap: 1rem; padding: 1rem; }
.stats-tabs { display: flex; gap: 0.5rem; align-items: center; flex-wrap: wrap; }
.tab-panel { display: flex; flex-direction: column; gap: 1rem; }
.placeholder { font-size: 0.875rem; opacity: 0.7; }
.set-toggle { display: flex; gap: 0.25rem; align-items: center; flex-wrap: wrap; }
.stats-header { display: flex; align-items: center; gap: 1rem; }
.match-name { font-weight: 600; }
.record-btn { margin-left: auto; }
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
