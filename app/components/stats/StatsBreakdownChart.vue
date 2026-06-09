<script setup lang="ts">
/**
 * StatsBreakdownChart.vue — 選択選手/ペアの得点率ブレイクダウン（サーブ/レシーブ × 右(偶)/左(奇)）
 *
 * 役割・サービスポジションで段階ドリルダウン。選択中のセルを濃く、非該当を淡く表示（受け入れ2026-06-09）。
 * 母数併記（NFR-201）、母数0は「-」。
 *
 * 関連要件: REQ-003/004 / 受け入れ2026-06-09
 */
import { useI18n } from 'vue-i18n'
import type { EntityBreakdown, RateValue, ServePosition, StatsDrilldown, StatsRole } from '~/types/stats-dashboard'

const props = defineProps<{
  breakdown: EntityBreakdown
  drilldown: StatsDrilldown
}>()

const emit = defineEmits<{
  drillRole: [role: StatsRole]
  drillPosition: [position: ServePosition]
}>()

const { t } = useI18n()
const ROLES: StatsRole[] = ['serve', 'receive']
const POSITIONS: ServePosition[] = ['right', 'left']

function cell(role: StatsRole, position: ServePosition): RateValue {
  return props.breakdown.cells.find(c => c.role === role && c.position === position)?.rate
    ?? { rate: null, denominator: 0, numerator: 0 }
}

function rateText(rv: RateValue): string {
  if (rv.rate === null) return t('stats.rate.noData')
  return t('stats.rate.withCount', { rate: Math.round(rv.rate * 100), n: rv.denominator })
}

// セルが現在のドリルダウンに該当するか（該当=濃い / 非該当=淡い）
function isActive(role: StatsRole, position: ServePosition): boolean {
  const d = props.drilldown
  return (d.role === null || d.role === role) && (d.position === null || d.position === position)
}
function roleSelected(role: StatsRole): boolean {
  return props.drilldown.role === role
}
function posSelected(position: ServePosition): boolean {
  return props.drilldown.position === position
}
</script>

<template>
  <div
    class="stats-breakdown"
    data-testid="stats-breakdown"
  >
    <!-- 役割トグル -->
    <div class="toggles">
      <button
        v-for="role in ROLES"
        :key="role"
        type="button"
        class="toggle"
        :class="{ 'is-selected': roleSelected(role) }"
        :data-testid="`drill-role-${role}`"
        @click="emit('drillRole', role)"
      >
        {{ $t(`stats.role.${role}`) }}
      </button>
      <span class="sep">×</span>
      <button
        v-for="position in POSITIONS"
        :key="position"
        type="button"
        class="toggle"
        :class="{ 'is-selected': posSelected(position) }"
        :data-testid="`drill-pos-${position}`"
        @click="emit('drillPosition', position)"
      >
        {{ $t(`stats.position.${position}`) }}
      </button>
    </div>

    <!-- 4 セルのグリッド（行=役割, 列=ポジション）。選択中を濃く、非該当を淡く -->
    <table class="grid">
      <thead>
        <tr>
          <th />
          <th
            v-for="position in POSITIONS"
            :key="position"
          >
            {{ $t(`stats.position.${position}`) }}
          </th>
        </tr>
      </thead>
      <tbody>
        <tr
          v-for="role in ROLES"
          :key="role"
        >
          <th>{{ $t(`stats.role.${role}`) }}</th>
          <td
            v-for="position in POSITIONS"
            :key="position"
            class="cell"
            :class="{ 'is-dim': !isActive(role, position) }"
            :data-testid="`cell-${role}-${position}`"
          >
            {{ rateText(cell(role, position)) }}
          </td>
        </tr>
      </tbody>
    </table>
  </div>
</template>

<style scoped>
.stats-breakdown { display: flex; flex-direction: column; gap: 0.75rem; }
.toggles { display: flex; align-items: center; gap: 0.5rem; flex-wrap: wrap; }
.toggle {
  padding: 0.25rem 0.75rem;
  border: 1px solid var(--ui-border, #d1d5db);
  border-radius: 9999px;
  font-size: 0.875rem;
  background: transparent;
  cursor: pointer;
}
.toggle.is-selected { background: var(--ui-primary, #3b82f6); color: #fff; border-color: transparent; }
.sep { color: var(--ui-text-muted, #9ca3af); }
.grid { border-collapse: collapse; width: 100%; max-width: 28rem; }
.grid th, .grid td { border: 1px solid var(--ui-border, #e5e7eb); padding: 0.5rem 0.75rem; text-align: center; }
.cell { font-variant-numeric: tabular-nums; transition: opacity 0.15s; }
.cell.is-dim { opacity: 0.35; }
</style>
