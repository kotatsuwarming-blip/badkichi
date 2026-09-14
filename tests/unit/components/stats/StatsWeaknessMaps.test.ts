// @vitest-environment happy-dom
/**
 * StatsWeaknessMaps.vue 単体テスト (singles-support TASK-0013 / REQ-302)
 */
import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import StatsWeaknessMaps from '~/components/stats/StatsWeaknessMaps.vue'
import type { LandZoneResult } from '~/types/shot-stats'

const lost: LandZoneResult = {
  cells: [],
  outFallback: { side: 0, back: 0, both: 0 },
  unlocated: 0
} as unknown as LandZoneResult

function mountMaps(singles: boolean) {
  return mount(StatsWeaknessMaps, {
    props: { missCells: [], lost, singles },
    global: { mocks: { $t: (k: string) => k }, stubs: { StatsCourtZones: true } }
  })
}

describe('StatsWeaknessMaps', () => {
  it('TC-302-01: singles は選手単位の注記 (playerNote)', () => {
    const w = mountMaps(true)
    expect(w.text()).toContain('shotStats.weakness.playerNote')
    expect(w.text()).not.toContain('shotStats.weakness.teamNote')
  })
  it('TC-302-02: doubles は従来のチーム単位注記 (teamNote)', () => {
    const w = mountMaps(false)
    expect(w.text()).toContain('shotStats.weakness.teamNote')
    expect(w.text()).not.toContain('shotStats.weakness.playerNote')
  })
})
