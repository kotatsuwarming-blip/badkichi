<script setup lang="ts">
/**
 * stats.vue（Group 横断ダッシュボード）— /groups/[id]/stats
 *
 * グローバルフィルタ（対象=全体/選手/ペア、試合期間=日付範囲+個別調整）+ ドリルダウン（役割×ポジション×ラリー長）。
 * 選手/ペア選択時はブレイクダウン、テーブル/ラリー長グラフ連動。別試合のラリー再生はソース切替（:key + autoSeekMs, 2秒前）。
 *
 * 関連要件: REQ-002/004/010/012/104 + 受け入れ2026-06-09
 */
import { computed, onMounted, ref } from 'vue'
import { useRoute } from 'vue-router'
import type { VideoSource } from '~/types/video-playback'
import type { PairRate, PlayerRate, RallyRow, StatsRole } from '~/types/stats-dashboard'
import { useStatsView } from '~/composables/useStatsView'
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

    <StatsEmptyState v-if="view.isEmpty.value" />

    <div
      v-else
      class="stats-grid"
    >
      <section class="charts-col">
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
