<script setup lang="ts">
/**
 * stats.vue（試合単位ダッシュボード）— /groups/[id]/matches/[matchId]/stats
 *
 * チャート（得点率・ラリー長）+ ラリーテーブル + 埋め込みプレーヤーを共存させ、
 * クロスフィルタ（per-match はクライアント絞り込み）→ ラリー選択で該当 ms 再生。
 *
 * 関連設計: docs/design/stats-dashboard/{architecture.md,dataflow.md}
 * 関連要件: REQ-001/003/004/005/006/007/010/011/103/201/NFR-202/203
 */
import { computed, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import type { VideoSource } from '~/types/video-playback'
import type { PairRate, PlayerRate, RallyRow, StatsRole } from '~/types/stats-dashboard'
import { useMatchForRecording } from '~/composables/useMatchForRecording'
import { useMatchStats } from '~/composables/useMatchStats'
import { useMatchRallies } from '~/composables/useMatchRallies'
import { useStatsFilter } from '~/composables/useStatsFilter'
import type { MatchRoster } from '~/utils/stats-dashboard/filter-rallies'

const route = useRoute()
const matchId = route.params.matchId as string
const groupId = route.params.id as string

const { data: match } = useMatchForRecording(matchId)
const { data: stats } = useMatchStats(matchId)
const { data: rallies } = useMatchRallies(matchId)

const names = computed<Record<string, string>>(() => {
  const map: Record<string, string> = {}
  for (const r of match.value?.roster ?? []) map[r.playerId] = r.name
  return map
})

// per-match のペア絞り込み用ロスター（team A/B → player_id の組。フィルタ自体は player_id ベース）
const matchRoster = computed<MatchRoster | undefined>(() => {
  const r = match.value?.roster
  if (!r || r.length !== 4) return undefined
  const a = r.filter(x => x.team === 'A').map(x => x.playerId)
  const b = r.filter(x => x.team === 'B').map(x => x.playerId)
  if (a.length !== 2 || b.length !== 2) return undefined
  return { pairA: [a[0]!, a[1]!], pairB: [b[0]!, b[1]!] }
})

const { filter, setFilter, clear, apply } = useStatsFilter({ roster: () => matchRoster.value })

// 表示モード（選手別 / ペア別）
const mode = ref<'player' | 'pair'>('player')
const rateEntries = computed<(PlayerRate | PairRate)[]>(() =>
  mode.value === 'pair' ? (stats.value?.pairRates ?? []) : (stats.value?.playerRates ?? [])
)

// クロスフィルタ後のラリー（per-match はクライアント側）
const filteredRallies = computed<RallyRow[]>(() => apply(rallies.value ?? []))
const rallyMarkersMs = computed<number[]>(() =>
  filteredRallies.value
    .map(r => r.video_start_timestamp_ms)
    .filter((ms): ms is number => ms !== null)
)
const isFiltered = computed(() =>
  filter.value.playerId !== null || filter.value.pair !== null || filter.value.shotBinKeys.length > 0
)

// 動画ソース（youtube は即時、local は方式 A 再選択）
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

// 埋め込みプレーヤー（ラリー行選択で seekToMs）
const videoPane = ref<{ seekToMs: (ms: number) => void } | null>(null)
function onSelectRally(rally: RallyRow): void {
  if (rally.video_start_timestamp_ms !== null) {
    videoPane.value?.seekToMs(rally.video_start_timestamp_ms)
  }
}

// チャート選択 → クロスフィルタ
function onSelectRate(payload: { playerId?: string, pair?: { player1Id: string, player2Id: string }, role: StatsRole }): void {
  setFilter({ playerId: payload.playerId ?? null, pair: payload.pair ?? null, role: payload.role })
}
function onSelectBins(keys: string[]): void {
  setFilter({ shotBinKeys: keys })
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

    <StatsEmptyState v-if="stats?.isEmpty" />

    <div
      v-else
      class="stats-grid"
    >
      <section class="charts-col">
        <div class="mode-toggle">
          <UButton
            size="xs"
            :variant="mode === 'player' ? 'solid' : 'ghost'"
            data-testid="mode-player"
            @click="mode = 'player'"
          >
            {{ $t('stats.mode.player') }}
          </UButton>
          <UButton
            size="xs"
            :variant="mode === 'pair' ? 'solid' : 'ghost'"
            data-testid="mode-pair"
            @click="mode = 'pair'"
          >
            {{ $t('stats.mode.pair') }}
          </UButton>
          <UButton
            v-if="isFiltered"
            size="xs"
            color="neutral"
            variant="soft"
            data-testid="clear-filter"
            @click="clear"
          >
            {{ $t('stats.filter.clear') }}
          </UButton>
        </div>
        <StatsRateChart
          :entries="rateEntries"
          :mode="mode"
          @select="onSelectRate"
        />
        <StatsRallyLengthChart
          :bins="stats?.rallyLength ?? []"
          :selected-keys="filter.shotBinKeys"
          @select-bins="onSelectBins"
        />
      </section>

      <section class="video-col">
        <StatsVideoPane
          v-if="videoSource"
          ref="videoPane"
          :key="match?.videoSourceType + ':' + (match?.videoSourceUrl ?? '')"
          :source="videoSource"
          :rally-markers-ms="rallyMarkersMs"
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
          :rows="filteredRallies"
          :names="names"
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
