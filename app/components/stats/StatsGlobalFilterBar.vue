<script setup lang="ts">
/**
 * StatsGlobalFilterBar.vue — グローバルフィルタ（全タブ共通, 2026-08-08 再編）
 *
 * 階層: 対象モード（選手別/ペア別）→ 選手/ペア選択 → セット。すべて同一階層で全タブに適用。
 * 未選択（全選手 / ペア未完）は全員比較（overview）。期間 + 対象試合は Group 横断のみ表示。
 * 完全制御コンポーネント（状態は useStatsView が保持。チャートクリック選択とも同期）。
 *
 * 関連要件: 受け入れ2026-06-09 + フィルタ再編2026-08-08
 */
import { computed } from 'vue'
import type { MatchMeta, StatsGlobalFilter, SubjectMode } from '~/types/stats-dashboard'

const props = defineProps<{
  players: { id: string, name: string }[]
  matchesMeta: MatchMeta[]
  globalFilter: StatsGlobalFilter
  includedMatchIds: string[] | null
  setNumbers: number[]
  showPeriod: boolean
}>()

const emit = defineEmits<{
  setSubjectMode: [mode: SubjectMode]
  setPlayer: [id: string | null]
  setPair1: [id: string | null]
  setPair2: [id: string | null]
  setSetNumber: [n: number | null]
  setDateRange: [from: string | null, to: string | null]
  toggleMatch: [matchId: string]
}>()

function sel(e: Event): string {
  return (e.target as HTMLSelectElement).value
}

const includedSet = computed(() => new Set(props.includedMatchIds ?? props.matchesMeta.map(m => m.id)))
function onDateFrom(e: Event): void {
  emit('setDateRange', (e.target as HTMLInputElement).value || null, props.globalFilter.dateTo)
}
function onDateTo(e: Event): void {
  emit('setDateRange', props.globalFilter.dateFrom, (e.target as HTMLInputElement).value || null)
}
</script>

<template>
  <div
    class="global-filter"
    data-testid="global-filter"
  >
    <!-- 対象（選手別/ペア別 → 選手選択）+ セット。全タブ共通 -->
    <div class="row">
      <label class="lbl">{{ $t('stats.entity.select') }}</label>
      <div class="mode-toggle">
        <UButton
          size="xs"
          :variant="globalFilter.subjectMode === 'player' ? 'solid' : 'ghost'"
          data-testid="mode-player"
          @click="emit('setSubjectMode', 'player')"
        >
          {{ $t('stats.mode.player') }}
        </UButton>
        <UButton
          size="xs"
          :variant="globalFilter.subjectMode === 'pair' ? 'solid' : 'ghost'"
          data-testid="mode-pair"
          @click="emit('setSubjectMode', 'pair')"
        >
          {{ $t('stats.mode.pair') }}
        </UButton>
      </div>
      <select
        v-if="globalFilter.subjectMode === 'player'"
        class="ctrl"
        data-testid="entity-player"
        :value="globalFilter.playerId ?? ''"
        @change="emit('setPlayer', sel($event) || null)"
      >
        <option value="">
          {{ $t('shotStats.filter.allPlayers') }}
        </option>
        <option
          v-for="p in players"
          :key="p.id"
          :value="p.id"
        >
          {{ p.name }}
        </option>
      </select>
      <template v-else>
        <select
          class="ctrl"
          data-testid="entity-pair1"
          :value="globalFilter.pair1Id ?? ''"
          @change="emit('setPair1', sel($event) || null)"
        >
          <option value="">
            —
          </option>
          <option
            v-for="p in players"
            :key="p.id"
            :value="p.id"
          >
            {{ p.name }}
          </option>
        </select>
        <select
          class="ctrl"
          data-testid="entity-pair2"
          :value="globalFilter.pair2Id ?? ''"
          @change="emit('setPair2', sel($event) || null)"
        >
          <option value="">
            —
          </option>
          <option
            v-for="p in players"
            :key="p.id"
            :value="p.id"
          >
            {{ p.name }}
          </option>
        </select>
      </template>
      <select
        class="ctrl"
        data-testid="filter-set"
        :value="globalFilter.setNumber === null ? '' : String(globalFilter.setNumber)"
        @change="emit('setSetNumber', sel($event) === '' ? null : Number(sel($event)))"
      >
        <option value="">
          {{ $t('shotStats.filter.allSets') }}
        </option>
        <option
          v-for="sn in setNumbers"
          :key="sn"
          :value="String(sn)"
        >
          {{ $t('shotStats.flow.set', { n: sn }) }}
        </option>
      </select>
    </div>

    <!-- 期間（Group 横断のみ） -->
    <div
      v-if="showPeriod"
      class="row"
    >
      <label class="lbl">{{ $t('stats.period.label') }}</label>
      <input
        type="date"
        class="ctrl"
        :value="globalFilter.dateFrom ?? ''"
        data-testid="date-from"
        @change="onDateFrom"
      >
      <span>〜</span>
      <input
        type="date"
        class="ctrl"
        :value="globalFilter.dateTo ?? ''"
        data-testid="date-to"
        @change="onDateTo"
      >
    </div>

    <!-- 対象試合一覧（個別調整） -->
    <details
      v-if="showPeriod && matchesMeta.length > 0"
      class="matches"
    >
      <summary>{{ $t('stats.period.matches') }}（{{ includedSet.size }}/{{ matchesMeta.length }}）</summary>
      <ul class="match-list">
        <li
          v-for="m in matchesMeta"
          :key="m.id"
        >
          <label :data-testid="`match-toggle-${m.id}`">
            <input
              type="checkbox"
              :checked="includedSet.has(m.id)"
              @change="emit('toggleMatch', m.id)"
            >
            <span>{{ m.name || m.id }}</span>
            <span class="date">{{ m.matchDate ?? '' }}</span>
          </label>
        </li>
      </ul>
    </details>
  </div>
</template>

<style scoped>
.global-filter { display: flex; flex-direction: column; gap: 0.5rem; padding: 0.75rem; border: 1px solid var(--ui-border, #e5e7eb); border-radius: 0.5rem; }
.row { display: flex; align-items: center; gap: 0.5rem; flex-wrap: wrap; }
.lbl { font-size: 0.8125rem; color: var(--ui-text-muted, #6b7280); min-width: 5rem; }
.mode-toggle { display: flex; gap: 0.25rem; align-items: center; }
.ctrl { padding: 0.25rem 0.5rem; border: 1px solid var(--ui-border, #d1d5db); border-radius: 0.375rem; font-size: 0.875rem; }
.matches summary { cursor: pointer; font-size: 0.875rem; }
.match-list { list-style: none; margin: 0.5rem 0 0; padding: 0; display: flex; flex-direction: column; gap: 0.25rem; max-height: 12rem; overflow-y: auto; }
.match-list label { display: flex; align-items: center; gap: 0.5rem; font-size: 0.875rem; }
.match-list .date { color: var(--ui-text-muted, #9ca3af); margin-left: auto; }
</style>
