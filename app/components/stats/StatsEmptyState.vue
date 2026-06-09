<script setup lang="ts">
/**
 * StatsEmptyState.vue — 統計の空状態（データ未記録 / 集計対象 0 件）
 *
 * 関連設計: docs/design/stats-dashboard/dataflow.md（空状態フロー）
 * 関連要件: REQ-103 / REQ-201
 */
withDefaults(defineProps<{
  titleKey?: string
  descriptionKey?: string
}>(), {
  titleKey: 'stats.empty.title',
  descriptionKey: 'stats.empty.description'
})
</script>

<template>
  <div
    class="stats-empty"
    data-testid="stats-empty"
  >
    <UIcon
      name="i-lucide-bar-chart-3"
      class="icon"
    />
    <p class="title">
      {{ $t(titleKey) }}
    </p>
    <p class="description">
      {{ $t(descriptionKey) }}
    </p>
  </div>
</template>

<style scoped>
.stats-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.5rem;
  padding: 2.5rem 1rem;
  color: var(--ui-text-muted, #6b7280);
  text-align: center;
}
.icon { font-size: 2rem; opacity: 0.5; }
.title { font-weight: 600; }
.description { font-size: 0.875rem; }
</style>
