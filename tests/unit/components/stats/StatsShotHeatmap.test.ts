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
import { OUT_RING_SLOTS } from '~/types/shot-stats'
// eslint-disable-next-line import/first
import type { PlacementDestCell, PlacementOutRing } from '~/types/shot-stats'

const global = { mocks: { $t: (k: string, p?: Record<string, unknown>) => p ? `${k}:${JSON.stringify(p)}` : k } }

const originCells: PlacementDestCell[] = [
  { row: 2, col: 0, count: 4, ratio: 1, breakdown: [{ type: 'smash', count: 3, miss: 1, net: 0 }, { type: 'hairpin', count: 1, miss: 0, net: 0 }] },
  { row: 0, col: 2, count: 2, ratio: 0.5, breakdown: [{ type: 'clear_high', count: 2, miss: 0, net: 0 }] }
]
const emptyRing = () => Object.fromEntries(OUT_RING_SLOTS.map(slot => [slot, { count: 0, breakdown: [] }])) as PlacementOutRing['ring']
const outRing: PlacementOutRing = {
  net: { count: 2, breakdown: [{ type: 'hairpin', count: 2, miss: 2, net: 2 }] },
  ring: {
    ...emptyRing(),
    left_0: { count: 1, breakdown: [{ type: 'smash', count: 1, miss: 1, net: 0 }] },
    left_back: { count: 2, breakdown: [{ type: 'clear_high', count: 2, miss: 2, net: 0 }] }
  },
  ringTotal: 3
}
const destCells: PlacementDestCell[] = [
  { row: 2, col: 1, count: 5, ratio: 1, breakdown: [{ type: 'smash', count: 3, miss: 0, net: 0 }, { type: 'clear_high', count: 2, miss: 0, net: 0 }] },
  { row: 0, col: 0, count: 1, ratio: 0.2, breakdown: [{ type: 'hairpin', count: 1, miss: 0, net: 0 }] }
]

function mountMap(selected: { row: number, col: number } | null = null) {
  return mount(StatsShotHeatmap, {
    props: { originCells, destCells, outRing, selected, total: 8, pointedTotal: 9 },
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

  it('奥セルは相手半面 (ネットより上) に描画される（回帰: ネット越え描画バグ）', () => {
    // コート全長 H=1340 / ネット y=670 / セル高 = 1340/6 ≈ 223.33
    const w = mountMap()
    // dest row 0 (ネット側) = [446.67, 670] → 上半面
    const nearNet = Number(w.find('[data-testid="dest-0-0"]').attributes('y'))
    expect(nearNet).toBeCloseTo(670 - 1340 / 6, 1)
    expect(nearNet + 1340 / 6).toBeLessThanOrEqual(670 + 0.01)
    // dest row 2 (バック側) = [0, 223.33]
    expect(Number(w.find('[data-testid="dest-2-1"]').attributes('y'))).toBeCloseTo(0, 1)
    // 手前 (origin) は全て下半面
    const originFront = Number(w.find('[data-testid="origin-2-0"]').attributes('y'))
    expect(originFront).toBeCloseTo(670, 1)
  })

  it('手前セルのタップで selectOrigin を emit', async () => {
    const w = mountMap()
    await w.find('[data-testid="origin-2-0"]').trigger('click')
    expect(w.emitted('selectOrigin')![0][0]).toEqual({ row: 2, col: 0 })
  })

  it('手前セルのホバーで球種内訳が出る (#4)', () => {
    const w = mountMap()
    const title = w.find('[data-testid="origin-2-0"]').find('title').text()
    expect(title).toContain('annotation.shotType.smash 3')
    expect(title).toContain('annotation.shotType.hairpin 1')
  })

  it('アウトは位置つきリング枠 (11 枠) + ネット単枠で表示され、ホバーで内訳が出る (stats-miss-out-detail REQ-102/103)', () => {
    const w = mountMap()
    // 全 11 枠が描画される（0 本は淡色で存在は見える）
    for (const slot of OUT_RING_SLOTS) {
      expect(w.find(`[data-testid="out-${slot}"]`).exists(), slot).toBe(true)
    }
    // 本数あり枠は内訳ツールチップ
    expect(w.find('[data-testid="out-left_0"] title').text()).toContain('annotation.shotType.smash 1')
    expect(w.find('[data-testid="out-left_back"]').attributes('opacity')).toBe('1')
    expect(w.find('[data-testid="out-right_2"]').attributes('opacity')).toBe('0.35')
    // ネットは単枠のまま (REQ-105)
    expect(w.find('[data-testid="extra-net"]').text()).toContain('2')
    expect(w.find('[data-testid="extra-net"] title').text()).toContain('annotation.shotType.hairpin 2')
  })

  it('選択時に横のプロファイルグラフが出て、候補の 0 本も表示される (#5)', async () => {
    const w = mountMap()
    expect(w.find('[data-testid="zone-profile"]').exists()).toBe(false) // 未選択時は非表示
    await w.setProps({ selected: { row: 2, col: 0 } }) // 前ゾーン
    expect(w.find('[data-testid="zone-profile"]').exists()).toBe(true)
    // 実打: smash 3 / hairpin 1 (候補外の smash は末尾追加)、候補の push は 0 本表示
    expect(w.find('[data-testid="profile-hairpin"]').text()).toContain('1')
    const push = w.find('[data-testid="profile-push"]')
    expect(push.exists()).toBe(true)
    expect(push.text()).toContain('0')
    expect(push.classes()).toContain('is-zero')
    expect(w.find('[data-testid="profile-smash"]').text()).toContain('3')
  })

  it('プロファイルのミス分が赤バーで表示される (#7)', async () => {
    const w = mountMap()
    await w.setProps({ selected: { row: 2, col: 0 } })
    // smash: count 3 / miss 1 → 赤バーあり。hairpin: miss 0 → 赤バーなし
    expect(w.find('[data-testid="profile-miss-smash"]').exists()).toBe(true)
    expect(w.find('[data-testid="profile-miss-hairpin"]').exists()).toBe(false)
  })

  it('未選択時は選択を促す文言、選択時は解除の案内', async () => {
    const w = mountMap()
    expect(w.find('[data-testid="heatmap-state"]').text()).toContain('promptSelect')
    await w.setProps({ selected: { row: 2, col: 0 } })
    expect(w.find('[data-testid="heatmap-state"]').text()).toContain('selectedCell')
  })
})
