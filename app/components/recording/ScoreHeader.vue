<script setup lang="ts">
/**
 * ScoreHeader.vue — スコア / セット番号 / サーバー・レシーバーを表示する presentational component。
 * 関連: TASK-0013 / REQ-008 / ui-design.md
 */
import type { Score } from '~/utils/rule-engine/types'

defineProps<{
  score: Score
  setNumber: number | null
  serverName: string
  receiverName: string
}>()
</script>

<template>
  <div
    class="score-header"
    data-testid="score-header"
  >
    <div
      class="score"
      data-testid="score"
    >
      {{ score.teamA }} - {{ score.teamB }}
    </div>
    <div class="meta">
      <span data-testid="set-number">{{ $t('record.score.set') }} {{ setNumber ?? '-' }}</span>
      <span data-testid="server">{{ $t('record.score.server') }}: {{ serverName }}</span>
      <span data-testid="receiver">{{ $t('record.score.receiver') }}: {{ receiverName }}</span>
    </div>
  </div>
</template>

<style scoped>
.score-header { display: flex; align-items: baseline; gap: 1rem; flex-wrap: wrap; }
.score { font-size: 1.75rem; font-weight: 700; }
.meta { display: flex; gap: 1rem; font-size: 0.875rem; color: var(--ui-text-muted); flex-wrap: wrap; }
</style>
