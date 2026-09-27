<script setup lang="ts">
/**
 * StatsShotValuePanel.vue — SV 画面コンテナ（TASK-0005）
 *
 * ゾーン選択状態を保持し、Court / Summary / Breakdown を束ねる。
 * rows は選手・hand・グローバルフィルタ適用済みを受け取り、ゾーン合算・重み合成は
 * すべてここ（クライアント）で行う — 選択変更で再フェッチしない（NFR-001）。
 */
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { SV_WEIGHTS } from '~/utils/shot-value/weights'
import { aggregateRoles, filterByZones, toAggregate, typeBreakdown, zoneCells } from '~/utils/shot-value/score'
import type { ShotValueRow } from '~/types/shot-value'

const props = defineProps<{
  rows: ShotValueRow[]
}>()

const { t } = useI18n()

/** 選択中ゾーンキー。空 = コート全体（REQ-004） */
const selectedZones = ref<string[]>([])

const cells = computed(() => zoneCells(props.rows, SV_WEIGHTS))

const zoneSet = computed(() => selectedZones.value.length > 0 ? new Set(selectedZones.value) : null)
const zonedRows = computed(() => filterByZones(props.rows, zoneSet.value))

const totalN = computed(() => props.rows.reduce((acc, r) => acc + r.n, 0))
const agg = computed(() => toAggregate(aggregateRoles(zonedRows.value), SV_WEIGHTS))
const breakdown = computed(() => typeBreakdown(zonedRows.value, SV_WEIGHTS))

/** 選択ゾーンの表示名（例: 後・左 + 後・中）。未選択は null → コート全体 */
const selectionLabel = computed(() => {
  if (selectedZones.value.length === 0) return null
  const rowName = (r: number): string =>
    t(`shotStats.value.${r === 2 ? 'rowFront' : r === 1 ? 'rowMid' : 'rowBack'}`)
  const colName = (c: number): string => t(`shotStats.value.col${c}`)
  const names = [...selectedZones.value]
    .map(key => ({ r: Number(key[1]), c: Number(key[3]) }))
    .sort((a, b) => (b.r - a.r) || (a.c - b.c))
    .map(z => `${rowName(z.r)}・${colName(z.c)}`)
  return t('shotStats.value.selectedLabel', { zones: names.join(' + ') })
})
</script>

<template>
  <div
    class="sv-panel"
    data-testid="sv-panel"
  >
    <h3 class="panel-title">
      {{ $t('shotStats.value.title') }}
    </h3>
    <p class="panel-note">
      {{ $t('shotStats.value.note') }}
    </p>
    <div class="panel-grid">
      <StatsShotValueCourt
        :cells="cells"
        :selected="selectedZones"
        @update:selected="selectedZones = $event"
      />
      <div class="right-col">
        <StatsShotValueSummary
          :agg="agg"
          :total-n="totalN"
          :selection-label="selectionLabel"
        />
        <StatsShotValueBreakdown :rows="breakdown" />
      </div>
    </div>
  </div>
</template>

<style scoped>
.sv-panel { width: 100%; }
.panel-title { font-size: 0.9375rem; font-weight: 700; margin: 0 0 0.25rem; color: var(--ui-text, #111827); }
.panel-note { font-size: 0.78rem; color: var(--ui-text-muted, #6b7280); margin: 0 0 0.75rem; }
.panel-grid { display: grid; grid-template-columns: 280px 1fr; gap: 20px; align-items: start; }
.right-col { display: flex; flex-direction: column; gap: 14px; min-width: 0; }
@media (max-width: 720px) {
  .panel-grid { grid-template-columns: 1fr; }
}
</style>
