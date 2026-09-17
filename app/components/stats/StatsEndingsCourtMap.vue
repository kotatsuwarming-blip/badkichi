<script setup lang="ts">
/**
 * StatsEndingsCourtMap.vue — A 決着落下点のコート図（REQ-007/103, TASK-0010）
 *
 * 得点 ⇄ 失点の切替つき 3×3 ゾーン表示（floor 決着のみ）。
 * コート外落下は side/back/both の帯として件数表示（out_direction フォールバック含む, REQ-103）。
 */
import { computed, ref } from 'vue'
import type { LandZoneResult } from '~/types/shot-stats'

const props = defineProps<{
  won: LandZoneResult
  lost: LandZoneResult
}>()

const kind = ref<'won' | 'lost'>('won')
const current = computed<LandZoneResult>(() => (kind.value === 'won' ? props.won : props.lost))
const outTotal = computed(() =>
  current.value.outFallback.side + current.value.outFallback.back + current.value.outFallback.both
)
</script>

<template>
  <div class="court-map">
    <div class="map-header">
      <h3 class="chart-title">
        {{ $t('shotStats.endings.landTitle') }}
      </h3>
      <div class="kind-toggle">
        <UButton
          size="xs"
          :variant="kind === 'won' ? 'solid' : 'ghost'"
          data-testid="land-won"
          @click="kind = 'won'"
        >
          {{ $t('shotStats.endings.landWon') }}
        </UButton>
        <UButton
          size="xs"
          :variant="kind === 'lost' ? 'solid' : 'ghost'"
          data-testid="land-lost"
          @click="kind = 'lost'"
        >
          {{ $t('shotStats.endings.landLost') }}
        </UButton>
      </div>
    </div>
    <StatsCourtZones :cells="current.cells" />
    <p
      v-if="outTotal > 0 || current.unlocated > 0"
      class="out-note"
      data-testid="out-note"
    >
      {{ $t('shotStats.endings.outNote', {
        side: current.outFallback.side,
        back: current.outFallback.back,
        both: current.outFallback.both,
        unlocated: current.unlocated
      }) }}
    </p>
  </div>
</template>

<style scoped>
.court-map { display: flex; flex-direction: column; gap: 0.5rem; }
.map-header { display: flex; align-items: center; justify-content: space-between; gap: 0.5rem; flex-wrap: wrap; }
.chart-title { font-size: 0.875rem; font-weight: 600; }
.kind-toggle { display: flex; gap: 0.25rem; }
.out-note { font-size: 0.75rem; opacity: 0.7; }
</style>
