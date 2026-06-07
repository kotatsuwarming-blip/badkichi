<script setup lang="ts">
/**
 * MatchSummary.vue — 試合結果サマリー（完了確認）。各セットのスコアと試合勝者を表示。
 * 関連: 完了ボタン / REQ-011 / ② B-7（スコアは導出）
 */
import type { MatchSummary } from '~/types/match-recording'

defineProps<{
  summary: MatchSummary
}>()
</script>

<template>
  <div
    class="match-summary"
    data-testid="match-summary"
  >
    <h2 class="title">
      {{ $t('record.summary.title') }}
    </h2>

    <p
      v-if="summary.matchWinner"
      class="winner"
      data-testid="summary-winner"
    >
      {{ $t('record.summary.matchWinner') }}:
      {{ $t(`record.team.${summary.matchWinner}`) }}（{{ summary.setsWonA }} - {{ summary.setsWonB }}）
    </p>
    <p
      v-else
      class="in-progress"
      data-testid="summary-inprogress"
    >
      {{ $t('record.summary.inProgress') }}（{{ summary.setsWonA }} - {{ summary.setsWonB }}）
    </p>

    <table class="sets">
      <thead>
        <tr>
          <th>{{ $t('record.summary.set') }}</th>
          <th>{{ $t('record.team.A') }}</th>
          <th>{{ $t('record.team.B') }}</th>
        </tr>
      </thead>
      <tbody>
        <tr
          v-for="s in summary.sets"
          :key="s.setNumber"
          :data-testid="`summary-set-${s.setNumber}`"
        >
          <td>{{ s.setNumber }}</td>
          <td :class="{ 'is-won': s.winner === 'A' }">
            {{ s.scoreA }}
          </td>
          <td :class="{ 'is-won': s.winner === 'B' }">
            {{ s.scoreB }}
          </td>
        </tr>
      </tbody>
    </table>

    <p
      v-if="summary.sets.length === 0"
      class="empty"
    >
      {{ $t('record.summary.empty') }}
    </p>
  </div>
</template>

<style scoped>
.match-summary { display: flex; flex-direction: column; gap: 0.75rem; }
.title { font-weight: 700; font-size: 1.125rem; }
.winner { font-weight: 700; color: var(--ui-primary); }
.in-progress { color: var(--ui-text-muted); }
.sets { width: 100%; border-collapse: collapse; text-align: center; }
.sets th, .sets td { border: 1px solid var(--ui-border); padding: 0.375rem 0.5rem; }
.sets td.is-won { font-weight: 700; background: var(--ui-primary); color: var(--ui-bg); }
.empty { color: var(--ui-text-muted); }
</style>
