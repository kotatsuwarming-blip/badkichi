<script setup lang="ts">
/**
 * CourtDiagram.vue — コート図で 4 選手の立ち位置を可視化する presentational component。
 *
 * 関連: TASK-0012 / docs/design/match-recording/ui-design.md「コート図」/ 立ち位置表示
 * 方針:
 *   - rule-engine の positions を上下 2 チームで描画。camera_near_team を手前 (下)、相手を奥 (上)。
 *     null は A を手前の既定 (ui-design.md)。
 *   - サーバーを ◎ で強調、レシーバーを枠線で示す。override で left/right が入れ替わると表示も入れ替わる。
 *   - 選手名は names マップで解決 (presentational、session 非依存でテスト容易)。
 *   - 左右ミラー補正は MVP では行わない (実装時プロトタイプで調整、ui-design.md)。
 */
import { computed } from 'vue'
import type { CourtSide, PlayerId, Team, TeamPositions } from '~/utils/rule-engine/types'

const props = defineProps<{
  positions: TeamPositions
  servingTeam: Team
  server: PlayerId
  receiver: PlayerId
  cameraNearTeam: Team | null
  names: Record<PlayerId, string>
}>()

const nearTeam = computed<Team>(() => props.cameraNearTeam ?? 'A')
const farTeam = computed<Team>(() => (nearTeam.value === 'A' ? 'B' : 'A'))

function posOf(team: Team): { left: PlayerId, right: PlayerId } {
  return team === 'A' ? props.positions.teamA : props.positions.teamB
}

function cell(team: Team, side: CourtSide) {
  const id = posOf(team)[side]
  return {
    id,
    name: props.names[id] ?? id,
    isServer: id === props.server,
    isReceiver: id === props.receiver
  }
}

const farCells = computed(() => [cell(farTeam.value, 'left'), cell(farTeam.value, 'right')])
const nearCells = computed(() => [cell(nearTeam.value, 'left'), cell(nearTeam.value, 'right')])
</script>

<template>
  <div
    class="court-diagram"
    data-testid="court-diagram"
  >
    <p class="court-label">
      {{ $t('record.court.far') }}: {{ $t(`record.team.${farTeam}`) }}
    </p>
    <div class="court">
      <div class="court-row">
        <div
          v-for="c in farCells"
          :key="c.id"
          class="court-cell"
          :class="{ 'is-server': c.isServer, 'is-receiver': c.isReceiver }"
          :data-testid="`cell-${c.id}`"
        >
          <span
            v-if="c.isServer"
            class="server-mark"
          >◎</span>
          {{ c.name }}
        </div>
      </div>
      <div class="court-net" />
      <div class="court-row">
        <div
          v-for="c in nearCells"
          :key="c.id"
          class="court-cell"
          :class="{ 'is-server': c.isServer, 'is-receiver': c.isReceiver }"
          :data-testid="`cell-${c.id}`"
        >
          <span
            v-if="c.isServer"
            class="server-mark"
          >◎</span>
          {{ c.name }}
        </div>
      </div>
    </div>
    <p class="court-label">
      {{ $t('record.court.near') }}: {{ $t(`record.team.${nearTeam}`) }}
    </p>
  </div>
</template>

<style scoped>
.court-diagram { display: flex; flex-direction: column; gap: 0.25rem; align-items: center; }
.court-label { font-size: 0.75rem; color: var(--ui-text-muted); }
.court { width: 100%; max-width: 20rem; border: 1px solid var(--ui-border); border-radius: 0.5rem; overflow: hidden; }
.court-row { display: grid; grid-template-columns: 1fr 1fr; }
.court-cell { padding: 0.75rem 0.25rem; text-align: center; border: 1px solid var(--ui-border); font-size: 0.875rem; }
.court-cell.is-server { background: var(--ui-primary); color: var(--ui-bg); font-weight: 600; }
.court-cell.is-receiver { outline: 2px solid var(--ui-primary); outline-offset: -2px; }
.court-net { height: 2px; background: var(--ui-border); }
.server-mark { margin-right: 0.25rem; }
</style>
