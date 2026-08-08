<script setup lang="ts">
/**
 * StatsShotFilterBar.vue — 注釈系タブ共通フィルタ（2026-08-08 #8 で打者・セットの 2 軸へ縮小）
 *
 * 球種・hand の全体フィルタはユーザ判断で撤去（REQ-004 改訂）。
 * 打者 = クライアント側即時 / セット = RPC 再取得。
 * UI は StatsGlobalFilterBar と同じネイティブ select。
 */
defineProps<{
  hitterIds: string[]
  setNumbers: number[]
  playerFilter: string | null
  setNumber: number | null
  nameOf: (id: string) => string
}>()

const emit = defineEmits<{
  'update:playerFilter': [v: string | null]
  'update:setNumber': [v: number | null]
}>()

function sel(e: Event): string {
  return (e.target as HTMLSelectElement).value
}
</script>

<template>
  <div
    class="shot-filter-bar"
    data-testid="shot-filter-bar"
  >
    <select
      class="filter-select"
      data-testid="filter-player"
      :value="playerFilter ?? ''"
      @change="emit('update:playerFilter', sel($event) || null)"
    >
      <option value="">
        {{ $t('shotStats.filter.allPlayers') }}
      </option>
      <option
        v-for="id in hitterIds"
        :key="id"
        :value="id"
      >
        {{ nameOf(id) }}
      </option>
    </select>
    <select
      class="filter-select"
      data-testid="filter-set"
      :value="setNumber === null ? '' : String(setNumber)"
      @change="emit('update:setNumber', sel($event) === '' ? null : Number(sel($event)))"
    >
      <option value="">
        {{ $t('shotStats.filter.allSets') }}
      </option>
      <option
        v-for="sn in setNumbers"
        :key="sn"
        :value="String(sn)"
      >
        {{ $t('shotStats.flow.set', { n: sn }) }}
      </option>
    </select>
  </div>
</template>

<style scoped>
.shot-filter-bar { display: flex; gap: 0.5rem; flex-wrap: wrap; }
.filter-select {
  font-size: 0.8125rem;
  padding: 0.25rem 0.5rem;
  border: 1px solid var(--ui-border, rgba(128, 128, 128, 0.35));
  border-radius: 0.375rem;
  background: transparent;
  color: inherit;
}
</style>
