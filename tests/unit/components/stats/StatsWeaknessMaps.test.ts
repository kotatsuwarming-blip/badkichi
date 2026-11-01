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
  cells: [
    { row: 1, col: 2, count: 3, ratio: 1, types: [{ type: 'smash', count: 2 }, { type: null, count: 1 }] }
  ],
  outFallback: { side: 0, back: 0, both: 0 },
  unlocated: 0
} as unknown as LandZoneResult

function mountMaps(singles: boolean) {
  return mount(StatsWeaknessMaps, {
    props: { missCells: [], shotTotals: [], lost, singles },
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
  // % の分母 = その地点から打った総本数 (2026-09-29 修正)
  const shotTotals = [
    { row: 2, col: 0, count: 12, ratio: 1, breakdown: [] },
    { row: 0, col: 1, count: 2, ratio: 0.2, breakdown: [] }
  ]

  function mountMiss() {
    return mount(StatsWeaknessMaps, {
      props: { missCells, shotTotals, lost, singles: false },
      global: { mocks: { $t: (k: string, p?: Record<string, unknown>) => p ? `${k}:${JSON.stringify(p)}` : k } }
    })
  }

  it('セルは % 表示 (その地点から打った本数のうちミスの割合) になる', () => {
    const w = mountMiss()
    const map = w.find('[data-testid="weakness-miss-map"]')
    expect(map.text()).toContain('25%') // 3/12
    expect(map.text()).toContain('50%') // 1/2
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
    // サマリ: この位置から 12 本中 3 本ミス (25%)
    expect(detail.find('[data-testid="miss-detail-summary"]').text()).toContain('"miss":3')
    expect(detail.find('[data-testid="miss-detail-summary"]').text()).toContain('"total":12')
    expect(detail.find('[data-testid="miss-detail-summary"]').text()).toContain('"pct":25')
    await w.find('[data-testid="zone-2-0"]').trigger('click')
    expect(w.find('[data-testid="miss-detail"]').exists()).toBe(false)
  })

  it('ホバー用ツールチップ (title) に内訳が入る', () => {
    const w = mountMiss()
    expect(w.find('[data-testid="zone-2-0"] title').text()).toContain('missEntry')
  })

  it('決められた落下点: セルホバーで決定打の球種内訳が出る (2026-09-29)', () => {
    const w = mountMiss()
    const cell = w.find('[data-testid="weakness-conceded-map"] [data-testid="zone-1-2"]')
    expect(cell.find('title').text()).toContain('annotation.shotType.smash 2')
    expect(cell.find('title').text()).toContain('shotStats.endings.unannotated 1')
  })
})
