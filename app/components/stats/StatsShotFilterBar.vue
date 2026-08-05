<script setup lang="ts">
/**
 * StatsShotFilterBar.vue — ショット分析タブのフィルタ 4 軸（REQ-004, TASK-0009）
 *
 * 打者・球種・hand = クライアント側即時 / セット = RPC 再取得（設計2026-08-04 了承の二段構え。
 * hand はヒートマップのみ RPC パラメータのため親でブリッジ）。
 * UI は StatsGlobalFilterBar と同じネイティブ select。
 */
import type { Hand, ShotType } from '~/types/shot-annotation'

defineProps<{
  hitterIds: string[]
  presentTypes: ShotType[]
  setNumbers: number[]
  playerFilter: string | null
  typeFilter: ShotType | null
  handFilter: Hand | null
  setNumber: number | null
  nameOf: (id: string) => string
}>()

const emit = defineEmits<{
  'update:playerFilter': [v: string | null]
  'update:typeFilter': [v: ShotType | null]
  'update:handFilter': [v: Hand | null]
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
      data-testid="filter-type"
      :value="typeFilter ?? ''"
      @change="emit('update:typeFilter', (sel($event) || null) as ShotType | null)"
    >
      <option value="">
        {{ $t('shotStats.filter.allTypes') }}
      </option>
      <option
        v-for="tp in presentTypes"
        :key="tp"
        :value="tp"
      >
        {{ $t(`annotation.shotType.${tp}`) }}
      </option>
    </select>
    <select
      class="filter-select"
      data-testid="filter-hand"
      :value="handFilter ?? ''"
      @change="emit('update:handFilter', (sel($event) || null) as Hand | null)"
    >
      <option value="">
        {{ $t('shotStats.filter.allHands') }}
      </option>
      <option value="forehand">
        {{ $t('annotation.hand.forehand') }}
      </option>
      <option value="backhand">
        {{ $t('annotation.hand.backhand') }}
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
