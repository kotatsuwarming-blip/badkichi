<script setup lang="ts">
/**
 * RallyHistory.vue — ラリー履歴一覧 (番号/サーバー/結果/ショット数)。未確定はバッジで明示 (EDGE-003)。
 * 各行 [▶] で動画開始位置 (video_start_timestamp_ms) へジャンプ (REQ-009)。
 * 関連: TASK-0015 / ui-design.md
 */
import { computed } from 'vue'
import type { PlayerId } from '~/utils/rule-engine/types'
import type { RallyHistoryItem } from '~/types/match-recording'

const props = defineProps<{
  items: RallyHistoryItem[]
  names: Record<PlayerId, string>
}>()

const emit = defineEmits<{ jump: [ms: number] }>()

// 新しい順 (降順) 表示
const ordered = computed(() => [...props.items].sort((a, b) => b.rallyNumber - a.rallyNumber))

function resultLabelKey(item: RallyHistoryItem): string {
  if (!item.isPointConfirmed) return 'record.history.unconfirmed'
  if (item.isLet) return 'record.history.let'
  return item.pointWinner === 'A' ? 'record.history.pointA' : 'record.history.pointB'
}
</script>

<template>
  <div
    class="rally-history"
    data-testid="rally-history"
  >
    <p
      v-if="ordered.length === 0"
      class="empty"
      data-testid="history-empty"
    >
      {{ $t('record.history.empty') }}
    </p>
    <template v-else>
      <p
        class="legend"
        data-testid="history-legend"
      >
        {{ $t('record.history.legend') }}
      </p>
      <ul class="list">
        <li
          v-for="item in ordered"
          :key="item.rallyNumber"
          class="row"
          :class="{ 'is-unconfirmed': !item.isPointConfirmed }"
          :data-testid="`history-row-${item.rallyNumber}`"
        >
          <span class="num">#{{ item.rallyNumber }}</span>
          <span class="players">
            <span class="srv">{{ names[item.serverPlayerId] ?? item.serverPlayerId }}</span>
            <span class="arrow">▶</span>
            <span class="rcv">{{ names[item.receiverPlayerId] ?? item.receiverPlayerId }}</span>
          </span>
          <span class="result">{{ $t(resultLabelKey(item)) }}</span>
          <span class="shots">{{ item.shotCount }}{{ $t('record.history.shotsUnit') }}</span>
          <UButton
            v-if="item.videoStartTimestampMs !== null"
            size="xs"
            variant="ghost"
            icon="i-lucide-play"
            :data-testid="`jump-${item.rallyNumber}`"
            :aria-label="$t('record.history.jump')"
            @click="emit('jump', item.videoStartTimestampMs!)"
          />
        </li>
      </ul>
    </template>
  </div>
</template>

<style scoped>
.rally-history { font-size: 0.875rem; }
.empty { color: var(--ui-text-muted); padding: 0.5rem; }
.legend { font-size: 0.75rem; color: var(--ui-text-muted); padding: 0.25rem; }
.list { display: flex; flex-direction: column; }
.row { display: flex; align-items: center; gap: 0.75rem; padding: 0.375rem 0.25rem; border-bottom: 1px solid var(--ui-border); }
.row.is-unconfirmed { background: var(--ui-warning); color: var(--ui-bg); }
.num { font-weight: 600; min-width: 2.5rem; }
.players { display: inline-flex; align-items: center; gap: 0.375rem; }
.players .arrow { color: var(--ui-text-muted); font-size: 0.75rem; }
.players .srv { font-weight: 600; }
.shots { color: var(--ui-text-muted); margin-left: auto; }
</style>
