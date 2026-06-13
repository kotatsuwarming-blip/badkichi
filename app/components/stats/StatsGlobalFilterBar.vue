<script setup lang="ts">
/**
 * StatsGlobalFilterBar.vue — グローバルフィルタ（対象=全体/選手/ペア、試合期間=日付範囲+個別調整）
 *
 * 選手/ペア・期間はチャート外のグローバル設定（受け入れ2026-06-09）。期間は Group 横断のみ表示。
 * 対象試合がどれか分かるよう、期間内の試合をチェックボックスで一覧表示（除外で個別調整）。
 *
 * 関連要件: 受け入れ2026-06-09
 */
import { computed, ref, watch } from 'vue'
import type { MatchMeta, StatsEntity, StatsGlobalFilter } from '~/types/stats-dashboard'

const props = defineProps<{
  players: { id: string, name: string }[]
  matchesMeta: MatchMeta[]
  globalFilter: StatsGlobalFilter
  includedMatchIds: string[] | null
  showPeriod: boolean
}>()

const emit = defineEmits<{
  setEntity: [entity: StatsEntity]
  setDateRange: [from: string | null, to: string | null]
  toggleMatch: [matchId: string]
}>()

// 対象（entity）選択のローカル状態
const mode = ref<'all' | 'player' | 'pair'>(props.globalFilter.entity.kind)
const playerId = ref<string>(props.globalFilter.entity.kind === 'player' ? props.globalFilter.entity.playerId : '')
const pair1 = ref<string>(props.globalFilter.entity.kind === 'pair' ? props.globalFilter.entity.player1Id : '')
const pair2 = ref<string>(props.globalFilter.entity.kind === 'pair' ? props.globalFilter.entity.player2Id : '')

function emitEntity(): void {
  if (mode.value === 'player' && playerId.value) {
    emit('setEntity', { kind: 'player', playerId: playerId.value })
  } else if (mode.value === 'pair' && pair1.value && pair2.value && pair1.value !== pair2.value) {
    emit('setEntity', { kind: 'pair', player1Id: pair1.value, player2Id: pair2.value })
  } else {
    emit('setEntity', { kind: 'all' })
  }
}
watch([mode, playerId, pair1, pair2], emitEntity)

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
    <!-- 対象（選手/ペア） -->
    <div class="row">
      <label class="lbl">{{ $t('stats.entity.select') }}</label>
      <select
        v-model="mode"
        class="ctrl"
        data-testid="entity-mode"
      >
        <option value="all">
          {{ $t('stats.entity.all') }}
        </option>
        <option value="player">
          {{ $t('stats.entity.player') }}
        </option>
        <option value="pair">
          {{ $t('stats.entity.pair') }}
        </option>
      </select>
      <select
        v-if="mode === 'player'"
        v-model="playerId"
        class="ctrl"
        data-testid="entity-player"
      >
        <option
          value=""
          disabled
        >
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
      <template v-if="mode === 'pair'">
        <select
          v-model="pair1"
          class="ctrl"
          data-testid="entity-pair1"
        >
          <option
            value=""
            disabled
          >
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
          v-model="pair2"
          class="ctrl"
          data-testid="entity-pair2"
        >
          <option
            value=""
            disabled
          >
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
.ctrl { padding: 0.25rem 0.5rem; border: 1px solid var(--ui-border, #d1d5db); border-radius: 0.375rem; font-size: 0.875rem; }
.matches summary { cursor: pointer; font-size: 0.875rem; }
.match-list { list-style: none; margin: 0.5rem 0 0; padding: 0; display: flex; flex-direction: column; gap: 0.25rem; max-height: 12rem; overflow-y: auto; }
.match-list label { display: flex; align-items: center; gap: 0.5rem; font-size: 0.875rem; }
.match-list .date { color: var(--ui-text-muted, #9ca3af); margin-left: auto; }
</style>
