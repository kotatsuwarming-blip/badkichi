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
import { computed, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import type { VideoSource } from '~/types/video-playback'
import type { PairRate, PlayerRate, RallyRow, StatsRole } from '~/types/stats-dashboard'
import { useMatchForRecording } from '~/composables/useMatchForRecording'
import { useStatsView } from '~/composables/useStatsView'

const SEEK_LEAD_MS = 2000 // 再生はサーブの 2 秒前から（受け入れ2026-06-09）

const route = useRoute()
const matchId = route.params.matchId as string
const groupId = route.params.id as string

const { data: match } = useMatchForRecording(matchId)
const view = useStatsView({ kind: 'match', matchId, groupId })

// 対象選択用の選手一覧（この試合の 4 選手）
const players = computed(() => (match.value?.roster ?? []).map(r => ({ id: r.playerId, name: r.name })))

const overviewMode = ref<'player' | 'pair'>('player')
const overviewEntries = computed<(PlayerRate | PairRate)[]>(() =>
  overviewMode.value === 'pair' ? (view.overview.value?.pairRates ?? []) : (view.overview.value?.playerRates ?? [])
)
const isEntity = computed(() => view.globalFilter.value.entity.kind !== 'all')

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
      :show-period="false"
      @set-entity="view.setEntity"
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
          :names="view.namesMap.value"
          @select="onSelectRally"
        />
      </section>
    </div>
  </div>
</template>

<style scoped>
.stats-page { display: flex; flex-direction: column; gap: 1rem; padding: 1rem; }
.stats-header { display: flex; align-items: center; gap: 1rem; }
.match-name { font-weight: 600; }
.record-btn { margin-left: auto; }
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
