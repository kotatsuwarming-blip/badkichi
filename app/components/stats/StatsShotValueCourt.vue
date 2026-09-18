<script setup lang="ts">
/**
 * StatsShotValueCourt.vue — SV 自陣 3×3 ゾーンセレクタ（TASK-0003）
 *
 * セル複数選択（和集合）+ 行ラベル一括トグル。未選択 = コート全体（REQ-004）。
 * zone_row は 0 = 自陣バック / 2 = ネット際（placement 系と同一）。表示はネットを上に。
 * 見た目の正: docs/spec/shot-value/sv-drilldown-mock.html
 */
import { computed } from 'vue'
import { zoneKeyOf } from '~/types/shot-value'
import type { SvZoneCell } from '~/types/shot-value'

const props = withDefaults(defineProps<{
  cells: SvZoneCell[]
  /** 選択中ゾーンキー（'r0c0'）。空 = 全体 */
  selected: string[]
  zones?: number
}>(), { zones: 3 })

const emit = defineEmits<{ 'update:selected': [keys: string[]] }>()

/** 表示行（上 = ネット際 = zone_row 最大 → 下 = 自陣バック） */
const displayRows = computed(() => {
  const rows: { zoneRow: number, cells: SvZoneCell[] }[] = []
  for (let r = props.zones - 1; r >= 0; r--) {
    rows.push({
      zoneRow: r,
      cells: [...props.cells.filter(c => c.zoneRow === r)].sort((a, b) => a.zoneCol - b.zoneCol)
    })
  }
  return rows
})

function isSelected(cell: SvZoneCell): boolean {
  return props.selected.includes(zoneKeyOf(cell.zoneRow, cell.zoneCol))
}

function toggleCell(cell: SvZoneCell): void {
  const key = zoneKeyOf(cell.zoneRow, cell.zoneCol)
  const next = props.selected.includes(key)
    ? props.selected.filter(k => k !== key)
    : [...props.selected, key]
  emit('update:selected', next)
}

/** 行ラベルタップで一列トグル（全選択済みなら解除） */
function toggleRow(zoneRow: number): void {
  const keys = Array.from({ length: props.zones }, (_, c) => zoneKeyOf(zoneRow, c))
  const allIn = keys.every(k => props.selected.includes(k))
  const next = allIn
    ? props.selected.filter(k => !keys.includes(k))
    : [...new Set([...props.selected, ...keys])]
  emit('update:selected', next)
}

function fmt(v: number): string {
  const r = Math.round(v)
  return (r > 0 ? '+' : r < 0 ? '−' : '±') + Math.abs(r)
}

function cellClass(cell: SvZoneCell): string {
  if (cell.n === 0) return 'is-zero'
  if (cell.sv100 >= 8) return 'is-pos-2'
  if (cell.sv100 > 2) return 'is-pos-1'
  if (cell.sv100 <= -8) return 'is-neg-2'
  if (cell.sv100 < -2) return 'is-neg-1'
  return 'is-zero'
}

/** zone_row → 行ラベルキー（2=前列/1=中列/0=後列） */
function rowLabelKey(zoneRow: number): string {
  return zoneRow === 2 ? 'rowFront' : zoneRow === 1 ? 'rowMid' : 'rowBack'
}
</script>

<template>
  <div
    class="sv-court"
    data-testid="sv-court"
  >
    <div class="net-label">
      {{ $t('shotStats.value.netLabel') }}
    </div>
    <div
      v-for="row in displayRows"
      :key="row.zoneRow"
      class="court-row"
    >
      <button
        type="button"
        class="row-label"
        :data-testid="`sv-row-${row.zoneRow}`"
        :aria-label="$t('shotStats.value.rowSelectAll', { row: $t(`shotStats.value.${rowLabelKey(row.zoneRow)}`) })"
        @click="toggleRow(row.zoneRow)"
      >
        {{ $t(`shotStats.value.${rowLabelKey(row.zoneRow)}`) }}
      </button>
      <button
        v-for="cell in row.cells"
        :key="`${cell.zoneRow}:${cell.zoneCol}`"
        type="button"
        class="cell"
        :class="[cellClass(cell), { 'is-selected': isSelected(cell) }]"
        :aria-pressed="isSelected(cell)"
        :data-testid="`sv-cell-${cell.zoneRow}-${cell.zoneCol}`"
        @click="toggleCell(cell)"
      >
        <span class="sv">{{ fmt(cell.sv100) }}</span>
        <span class="n">n={{ cell.n }}</span>
      </button>
    </div>
    <p class="court-note">
      {{ $t('shotStats.value.courtNote') }}
    </p>
  </div>
</template>

<style scoped>
.sv-court { max-width: 280px; }
.net-label {
  text-align: center; font-size: 0.7rem; letter-spacing: 0.2em;
  color: var(--ui-text-muted, #6b7280);
  border-bottom: 3px double var(--ui-border, #e5e7eb);
  padding-bottom: 2px; margin-bottom: 6px;
}
.court-row { display: grid; grid-template-columns: 32px 1fr 1fr 1fr; gap: 4px; margin-bottom: 4px; }
.row-label {
  writing-mode: vertical-rl; font-size: 0.72rem; color: var(--ui-text-muted, #6b7280);
  background: none; border: none; cursor: pointer; padding: 0; border-radius: 6px;
  display: flex; align-items: center; justify-content: center;
}
.row-label:hover { background: var(--ui-bg-elevated, #f3f4f6); }
.cell {
  aspect-ratio: 4 / 3; min-height: 44px;
  border: 1px solid var(--ui-border, #e5e7eb); border-radius: 6px;
  cursor: pointer; padding: 4px; font-family: inherit; position: relative;
  display: flex; flex-direction: column; align-items: center; justify-content: center;
  color: var(--ui-text, #111827); background: var(--ui-bg, #fff);
}
.cell .sv { font-size: 0.88rem; font-weight: 700; font-variant-numeric: tabular-nums; }
.cell .n { font-size: 0.66rem; color: var(--ui-text-muted, #6b7280); font-variant-numeric: tabular-nums; }
.cell.is-pos-2 { background: rgba(59, 130, 246, 0.35); }
.cell.is-pos-1 { background: rgba(59, 130, 246, 0.15); }
.cell.is-neg-2 { background: rgba(239, 68, 68, 0.35); }
.cell.is-neg-1 { background: rgba(239, 68, 68, 0.15); }
.cell.is-selected { border: 2px solid var(--ui-text, #111827); }
.cell.is-selected::after {
  content: "✓"; position: absolute; top: 2px; right: 5px; font-size: 0.7rem; font-weight: 700;
}
.court-note { font-size: 0.72rem; color: var(--ui-text-muted, #6b7280); margin-top: 8px; }
</style>
