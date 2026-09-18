<script setup lang="ts">
/**
 * StatsShotValueSummary.vue — SV 合計タイル（TASK-0004）
 *
 * 「稼いだ − 失った = 収支(±CI)」の等式チップ + 平易文 + 母数（REQ-003/402）。
 * 見た目の正: docs/spec/shot-value/sv-drilldown-mock.html（2026-09-16 等式表示改訂）
 */
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import type { SvAggregate } from '~/types/shot-value'

const props = defineProps<{
  agg: SvAggregate
  /** 対象全体の打数 N（母数併記） */
  totalN: number
  /** 選択中ゾーンの表示名。null = コート全体 */
  selectionLabel: string | null
}>()

const { t } = useI18n()

function fmt(v: number): string {
  const r = Math.round(v)
  return (r > 0 ? '+' : r < 0 ? '−' : '±') + Math.abs(r)
}

const plain = computed(() => {
  const abs = Math.abs(Math.round(props.agg.sv100))
  if (props.agg.n === 0) return ''
  if (abs < 2) return t('shotStats.value.plainEven')
  return props.agg.sv100 > 0
    ? t('shotStats.value.plainGain', { pts: abs })
    : t('shotStats.value.plainLoss', { pts: abs })
})
</script>

<template>
  <section
    class="sv-summary"
    data-testid="sv-summary"
  >
    <h3 class="title">
      {{ selectionLabel ?? $t('shotStats.value.wholeCourtLabel') }}
    </h3>
    <div class="equation">
      <span class="chip earn">
        <span class="lab">{{ $t('shotStats.value.earned') }}</span>
        <span
          class="val"
          data-testid="sv-earned"
        >+{{ Math.round(agg.earned100) }}</span>
      </span>
      <span class="op">−</span>
      <span class="chip lose">
        <span class="lab">{{ $t('shotStats.value.lost') }}</span>
        <span
          class="val"
          data-testid="sv-lost"
        >{{ Math.round(agg.lost100) }}</span>
      </span>
      <span class="op">=</span>
      <span class="chip net">
        <span class="lab">{{ $t('shotStats.value.netLabel100') }}</span>
        <span
          class="val"
          data-testid="sv-net"
        >{{ fmt(agg.sv100) }} <small>±{{ Math.round(agg.ci95) }}</small></span>
      </span>
      <span
        class="meta"
        data-testid="sv-denominator"
      >{{ $t('shotStats.value.denominator', { n: agg.n, total: totalN }) }}</span>
    </div>
    <p
      v-if="plain"
      class="plain"
      data-testid="sv-plain"
    >
      {{ plain }}
    </p>
  </section>
</template>

<style scoped>
.sv-summary { border: 1px solid var(--ui-border, #e5e7eb); border-radius: 10px; padding: 12px 16px; }
.title { font-size: 0.9rem; font-weight: 700; margin: 0 0 8px; color: var(--ui-text, #111827); }
.equation { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
.chip {
  display: inline-flex; flex-direction: column; align-items: center;
  border-radius: 8px; padding: 4px 12px; font-variant-numeric: tabular-nums;
}
.chip .lab { font-size: 0.68rem; color: var(--ui-text-muted, #6b7280); }
.chip .val { font-size: 1.1rem; font-weight: 700; }
.chip.earn { background: rgba(59, 130, 246, 0.12); }
.chip.earn .val { color: #1c5cab; }
.chip.lose { background: rgba(239, 68, 68, 0.10); }
.chip.lose .val { color: #c23837; }
.chip.net { border: 1.5px solid var(--ui-border, #e5e7eb); }
.chip.net .val { font-size: 1.4rem; }
.chip.net .val small { font-size: 0.85rem; font-weight: 400; color: var(--ui-text-muted, #6b7280); }
.op { font-size: 1.1rem; color: var(--ui-text-muted, #6b7280); }
.meta { font-size: 0.78rem; color: var(--ui-text-muted, #6b7280); }
.plain { font-size: 0.86rem; margin: 8px 0 0; color: var(--ui-text, #111827); }
</style>
