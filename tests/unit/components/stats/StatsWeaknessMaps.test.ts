// @vitest-environment happy-dom
/**
 * StatsWeaknessMaps.vue 単体テスト (singles-support TASK-0013 / REQ-302)
 */
import { describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'

vi.mock('vue-i18n', () => ({ useI18n: () => ({ t: (k: string, p?: Record<string, unknown>) => p ? `${k}:${JSON.stringify(p)}` : k }) }))

// eslint-disable-next-line import/first
import StatsWeaknessMaps from '~/components/stats/StatsWeaknessMaps.vue'
// eslint-disable-next-line import/first
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

describe('ミス打点の内訳と割合 (stats-miss-out-detail REQ-001/002)', () => {
  const missCells = [
    { row: 2, col: 0, count: 3, ratio: 1, breakdown: [{ type: 'smash' as const, count: 2, miss: 2, net: 1 }, { type: 'hairpin' as const, count: 1, miss: 1, net: 1 }] },
    { row: 0, col: 1, count: 1, ratio: 0.3, breakdown: [{ type: 'clear_high' as const, count: 1, miss: 1, net: 0 }] }
  ]

  function mountMiss() {
    return mount(StatsWeaknessMaps, {
      props: { missCells, lost, singles: false },
      global: { mocks: { $t: (k: string, p?: Record<string, unknown>) => p ? `${k}:${JSON.stringify(p)}` : k } }
    })
  }

  it('セルは % 表示 (全ミス中の割合) になる', () => {
    const w = mountMiss()
    const map = w.find('[data-testid="weakness-miss-map"]')
    expect(map.text()).toContain('75%') // 3/4
    expect(map.text()).toContain('25%')
  })

  it('セルクリックで内訳 (球種 × ネット/アウト) パネルが開き、再クリックで閉じる', async () => {
    const w = mountMiss()
    await w.find('[data-testid="zone-2-0"]').trigger('click')
    const detail = w.find('[data-testid="miss-detail"]')
    expect(detail.exists()).toBe(true)
    // smash 2本 (ネット1/アウト1), hairpin 1本 (ネット1/アウト0)
    expect(detail.find('[data-testid="miss-detail-smash"]').text()).toContain('"n":2')
    expect(detail.find('[data-testid="miss-detail-smash"]').text()).toContain('"net":1')
    expect(detail.find('[data-testid="miss-detail-smash"]').text()).toContain('"out":1')
    await w.find('[data-testid="zone-2-0"]').trigger('click')
    expect(w.find('[data-testid="miss-detail"]').exists()).toBe(false)
  })

  it('ホバー用ツールチップ (title) に内訳が入る', () => {
    const w = mountMiss()
    expect(w.find('[data-testid="zone-2-0"] title').text()).toContain('missEntry')
  })
})
