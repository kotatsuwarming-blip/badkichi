// @vitest-environment happy-dom
/**
 * StatsShotHeatmap 単体テスト (配球ヒートマップ改訂, ヒアリング2026-08-08)
 * 手前 = 打った本数 + タップ選択 / 奥 = 配球先本数 + 球種内訳ツールチップ / 未選択時の促し文言。
 */
import { describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'

vi.mock('vue-i18n', () => ({ useI18n: () => ({ t: (k: string, p?: Record<string, unknown>) => p ? `${k}:${JSON.stringify(p)}` : k }) }))

// eslint-disable-next-line import/first
import StatsShotHeatmap from '~/components/stats/StatsShotHeatmap.vue'
// eslint-disable-next-line import/first
import type { PlacementDestCell, ZoneCell } from '~/types/shot-stats'

const global = { mocks: { $t: (k: string, p?: Record<string, unknown>) => p ? `${k}:${JSON.stringify(p)}` : k } }

const originCells: ZoneCell[] = [
  { row: 2, col: 0, count: 4, ratio: 1 },
  { row: 0, col: 2, count: 2, ratio: 0.5 }
]
const destCells: PlacementDestCell[] = [
  { row: 2, col: 1, count: 5, ratio: 1, breakdown: [{ type: 'smash', count: 3 }, { type: 'clear_high', count: 2 }] }
]

function mountMap(selected: { row: number, col: number } | null = null) {
  return mount(StatsShotHeatmap, {
    props: { originCells, destCells, selected, total: 5, pointedTotal: 9 },
    global
  })
}

describe('StatsShotHeatmap', () => {
  it('手前セルに打った本数の数字を表示する（0 は非表示）', () => {
    const w = mountMap()
    expect(w.find('[data-testid="origin-count-2-0"]').text()).toBe('4')
    expect(w.find('[data-testid="origin-count-0-2"]').text()).toBe('2')
    expect(w.find('[data-testid="origin-count-1-1"]').exists()).toBe(false)
  })

  it('奥セルに配球先の本数と球種内訳ツールチップを表示する', () => {
    const w = mountMap()
    const dest = w.find('[data-testid="dest-2-1"]')
    expect(dest.exists()).toBe(true)
    expect(dest.find('title').text()).toContain('annotation.shotType.smash 3')
    expect(dest.find('title').text()).toContain('annotation.shotType.clear_high 2')
  })

  it('手前セルのタップで selectOrigin を emit', async () => {
    const w = mountMap()
    await w.find('[data-testid="origin-2-0"]').trigger('click')
    expect(w.emitted('selectOrigin')![0][0]).toEqual({ row: 2, col: 0 })
  })

  it('未選択時は選択を促す文言、選択時は解除の案内', async () => {
    const w = mountMap()
    expect(w.find('[data-testid="heatmap-state"]').text()).toContain('promptSelect')
    await w.setProps({ selected: { row: 2, col: 0 } })
    expect(w.find('[data-testid="heatmap-state"]').text()).toContain('selectedCell')
  })
})
