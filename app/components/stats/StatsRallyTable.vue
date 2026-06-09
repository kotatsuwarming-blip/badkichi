<script setup lang="ts">
/**
 * StatsRallyTable.vue — ラリー一覧テーブル（クロスフィルタ結果 / 再生起点）
 *
 * 行選択で select を emit（埋め込みプレーヤーが該当 ms へシーク）。
 * video_start_timestamp_ms が null の行は再生不可（非リンク・dimmed, EDGE-103）。
 * レット・未確定は結果列で視覚区別。
 *
 * 関連設計: docs/design/stats-dashboard/{interfaces.ts,dataflow.md}
 * 関連要件: REQ-006 / REQ-007 / REQ-011 / EDGE-103
 */
import type { RallyRow } from '~/types/stats-dashboard'

const props = defineProps<{
  rows: RallyRow[]
  names: Record<string, string>
  /** Group 横断では試合名列を表示する */
  showMatch?: boolean
}>()

const emit = defineEmits<{ select: [rally: RallyRow] }>()

function nameOf(id: string): string {
  return props.names[id] ?? id
}

function resultLabelKey(row: RallyRow): string {
  if (!row.is_point_confirmed) return 'stats.outcome.unconfirmed'
  if (row.is_let) return 'stats.outcome.let'
  return row.point_winner === 'A' ? 'stats.outcome.pointA' : 'stats.outcome.pointB'
}

function jumpable(row: RallyRow): boolean {
  return row.video_start_timestamp_ms !== null
}

function onSelect(row: RallyRow): void {
  if (jumpable(row)) emit('select', row)
}
</script>

<template>
  <div
    class="stats-rally-table"
    data-testid="stats-rally-table"
  >
    <p
      v-if="rows.length === 0"
      class="empty"
      data-testid="rally-table-empty"
    >
      {{ $t('stats.table.empty') }}
    </p>
    <table
      v-else
      class="table"
    >
      <thead>
        <tr>
          <th>{{ $t('stats.table.rally') }}</th>
          <th v-if="showMatch">
            {{ $t('stats.table.match') }}
          </th>
          <th>{{ $t('stats.table.server') }}</th>
          <th>{{ $t('stats.table.receiver') }}</th>
          <th>{{ $t('stats.table.result') }}</th>
          <th>{{ $t('stats.table.shots') }}</th>
          <th />
        </tr>
      </thead>
      <tbody>
        <tr
          v-for="row in rows"
          :key="row.rally_id"
          class="row"
          :class="{ 'is-unconfirmed': !row.is_point_confirmed, 'is-disabled': !jumpable(row) }"
          :data-testid="`rally-row-${row.rally_id}`"
          @click="onSelect(row)"
        >
          <td>{{ row.set_number }}-{{ row.rally_number }}</td>
          <td v-if="showMatch">
            {{ row.match_name }}
          </td>
          <td>{{ nameOf(row.server_player_id) }}</td>
          <td>{{ nameOf(row.receiver_player_id) }}</td>
          <td>{{ $t(resultLabelKey(row)) }}</td>
          <td>{{ row.shot_count }}</td>
          <td>
            <UButton
              v-if="jumpable(row)"
              size="xs"
              variant="ghost"
              icon="i-lucide-play"
              :data-testid="`rally-play-${row.rally_id}`"
              :aria-label="$t('stats.table.play')"
              @click.stop="onSelect(row)"
            />
          </td>
        </tr>
      </tbody>
    </table>
  </div>
</template>

<style scoped>
.stats-rally-table { width: 100%; overflow-x: auto; }
.table { width: 100%; border-collapse: collapse; font-size: 0.875rem; }
.table th, .table td { padding: 0.375rem 0.5rem; text-align: left; border-bottom: 1px solid var(--ui-border, #e5e7eb); }
.row { cursor: pointer; }
.row.is-disabled { cursor: default; opacity: 0.55; }
.row.is-unconfirmed { font-style: italic; opacity: 0.8; }
.empty { color: var(--ui-text-muted, #6b7280); padding: 1rem 0; }
</style>
