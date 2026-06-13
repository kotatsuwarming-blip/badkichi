<script setup lang="ts">
/**
 * stats.vue（Group 横断ダッシュボード）— /groups/[id]/stats
 *
 * 複数試合を跨いだ選手別 / ペア別の累計分析。初期はチャートのみ、グラフで絞り込むと
 * サーバー側フィルタ + LIMIT でラリーを取得しテーブル表示（ヒアリング2026-06-08）。
 * 別試合のラリー再生は埋め込みプレーヤーの動画ソースを切替（:key 再生成 + autoSeekMs, REQ-104）。
 *
 * 関連設計: docs/design/stats-dashboard/{architecture.md,dataflow.md}
 * 関連要件: REQ-002/004/010/012/104 / NFR-202
 */
import { computed, ref } from 'vue'
import { useRoute } from 'vue-router'
import type { VideoSource } from '~/types/video-playback'
import type { PairRate, PlayerRate, RallyRow, StatsRole } from '~/types/stats-dashboard'
import { useGroupStats } from '~/composables/useGroupStats'
import { useGroupRallies } from '~/composables/useGroupRallies'
import { useStatsFilter } from '~/composables/useStatsFilter'
import { usePlayers } from '~/composables/usePlayers'

const route = useRoute()
const groupId = route.params.id as string

const { data: stats } = useGroupStats(groupId)
const { data: players } = usePlayers()
const { filter, setFilter, clear, toQueryArgs } = useStatsFilter()
const { data: groupRallies, refresh: refreshRallies } = useGroupRallies(groupId, () => toQueryArgs())

const names = computed<Record<string, string>>(() => {
  const map: Record<string, string> = {}
  for (const p of players.value ?? []) map[p.id] = p.name
  return map
})

const mode = ref<'player' | 'pair'>('player')
const rateEntries = computed<(PlayerRate | PairRate)[]>(() =>
  mode.value === 'pair' ? (stats.value?.pairRates ?? []) : (stats.value?.playerRates ?? [])
)

const isFiltered = computed(() =>
  filter.value.playerId !== null || filter.value.pair !== null || filter.value.shotBinKeys.length > 0
)
const rows = computed<RallyRow[]>(() => groupRallies.value ?? [])
const rallyMarkersMs = computed<number[]>(() =>
  rows.value.map(r => r.video_start_timestamp_ms).filter((ms): ms is number => ms !== null)
)

// チャート選択 → フィルタ更新 → 絞り込み後にサーバー側でラリー取得
async function onSelectRate(payload: { playerId?: string, pair?: { player1Id: string, player2Id: string }, role: StatsRole }): Promise<void> {
  setFilter({ playerId: payload.playerId ?? null, pair: payload.pair ?? null, role: payload.role })
  await refreshRallies()
}
async function onSelectBins(keys: string[]): Promise<void> {
  setFilter({ shotBinKeys: keys })
  await refreshRallies()
}
async function onClear(): Promise<void> {
  clear()
  await refreshRallies()
}

// 別試合の動画へソース切替して再生（youtube は即時、local は再選択）
const videoSource = ref<VideoSource | null>(null)
const currentMatchId = ref<string | null>(null)
const autoSeekMs = ref<number | null>(null)
const pendingLocalRally = ref<RallyRow | null>(null)

function onSelectRally(rally: RallyRow): void {
  if (rally.video_start_timestamp_ms === null) return
  if (rally.match_id === currentMatchId.value && videoSource.value) {
    autoSeekMs.value = rally.video_start_timestamp_ms
    return
  }
  if (rally.video_source_type === 'youtube') {
    currentMatchId.value = rally.match_id
    videoSource.value = { type: 'youtube', url: rally.video_source_url }
    autoSeekMs.value = rally.video_start_timestamp_ms
    pendingLocalRally.value = null
  } else {
    // local: 方式 A 再選択（このラリーのファイルをユーザーが選ぶ）
    pendingLocalRally.value = rally
    videoSource.value = null
  }
}
function onPickLocalFile(e: Event): void {
  const file = (e.target as HTMLInputElement).files?.[0]
  const rally = pendingLocalRally.value
  if (file && rally) {
    currentMatchId.value = rally.match_id
    videoSource.value = { type: 'local', file }
    autoSeekMs.value = rally.video_start_timestamp_ms
    pendingLocalRally.value = null
  }
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
            @click="onClear"
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
          :key="currentMatchId ?? 'none'"
          :source="videoSource"
          :rally-markers-ms="rallyMarkersMs"
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
        <p
          v-if="!isFiltered"
          class="filter-hint"
          data-testid="filter-hint"
        >
          {{ $t('stats.table.filterHint') }}
        </p>
        <StatsRallyTable
          v-else
          :rows="rows"
          :names="names"
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
.charts-col, .video-col, .table-col { display: flex; flex-direction: column; gap: 1rem; }
.source-picker { display: flex; flex-direction: column; gap: 0.5rem; }
.filter-hint { color: var(--ui-text-muted, #6b7280); font-size: 0.875rem; }
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
