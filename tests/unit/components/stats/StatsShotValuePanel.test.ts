// @vitest-environment happy-dom
/**
 * SV 画面コンポーネント単体テスト（shot-value TASK-0003〜0005）
 * Court の選択トグル/行一括、Summary の等式表示、Breakdown の n<5 薄表示・空状態、
 * Panel のゾーン合算（RPC 再実行なし = props 由来のみ）を検証。
 */
import { describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'

vi.mock('vue-i18n', () => ({ useI18n: () => ({ t: (k: string, p?: Record<string, unknown>) => p ? `${k}:${JSON.stringify(p)}` : k }) }))

// eslint-disable-next-line import/first
import StatsShotValueCourt from '~/components/stats/StatsShotValueCourt.vue'
// eslint-disable-next-line import/first
import StatsShotValueSummary from '~/components/stats/StatsShotValueSummary.vue'
// eslint-disable-next-line import/first
import StatsShotValueBreakdown from '~/components/stats/StatsShotValueBreakdown.vue'
// eslint-disable-next-line import/first
import StatsShotValuePanel from '~/components/stats/StatsShotValuePanel.vue'
// eslint-disable-next-line import/first
import { zoneCells } from '~/utils/shot-value/score'
// eslint-disable-next-line import/first
import { SV_WEIGHTS } from '~/utils/shot-value/weights'
// eslint-disable-next-line import/first
import type { ShotValueRow, SvTypeBreakdownRow } from '~/types/shot-value'

const global = {
  mocks: { $t: (k: string, p?: Record<string, unknown>) => p ? `${k}:${JSON.stringify(p)}` : k }
}

function row(over: Partial<ShotValueRow>): ShotValueRow {
  return {
    hit_player_id: 'p1', shot_type: 'smash', hand: null, zone_row: 0, zone_col: 0,
    n: 0, kime: 0, yuhatsu: 0, fuseki1: 0, fuseki2: 0, miss: 0, yurushi1: 0, yurushi2: 0,
    ...over
  }
}

describe('StatsShotValueCourt', () => {
  const cells = zoneCells([row({ n: 10, kime: 3, zone_row: 0, zone_col: 0 })], SV_WEIGHTS)

  it('9 セル描画・タップで選択キーを emit（複数選択の和集合, REQ-004）', async () => {
    const w = mount(StatsShotValueCourt, { props: { cells, selected: ['r1c1'] }, global })
    expect(w.findAll('.cell')).toHaveLength(9)
    await w.find('[data-testid="sv-cell-0-0"]').trigger('click')
    expect(w.emitted('update:selected')![0]![0]).toEqual(['r1c1', 'r0c0'])
  })

  it('選択済みセルのタップで解除・aria-pressed 反映', async () => {
    const w = mount(StatsShotValueCourt, { props: { cells, selected: ['r0c0'] }, global })
    const cell = w.find('[data-testid="sv-cell-0-0"]')
    expect(cell.attributes('aria-pressed')).toBe('true')
    await cell.trigger('click')
    expect(w.emitted('update:selected')![0]![0]).toEqual([])
  })

  it('行ラベルで一列一括トグル（全選択済みなら解除）', async () => {
    const w = mount(StatsShotValueCourt, { props: { cells, selected: ['r0c1'] }, global })
    await w.find('[data-testid="sv-row-0"]').trigger('click')
    expect(w.emitted('update:selected')![0]![0]).toEqual(['r0c1', 'r0c0', 'r0c2'])
    const w2 = mount(StatsShotValueCourt, { props: { cells, selected: ['r0c0', 'r0c1', 'r0c2'] }, global })
    await w2.find('[data-testid="sv-row-0"]').trigger('click')
    expect(w2.emitted('update:selected')![0]![0]).toEqual([])
  })
})

describe('StatsShotValueSummary', () => {
  it('等式（稼いだ − 失った = 収支±CI）と母数・平易文（REQ-003/402）', () => {
    const w = mount(StatsShotValueSummary, {
      props: {
        agg: { n: 42, earned100: 24.3, lost100: 31.1, sv100: -6.8, ci95: 17.2 },
        totalN: 310,
        selectionLabel: null
      },
      global
    })
    expect(w.find('[data-testid="sv-earned"]').text()).toBe('+24')
    expect(w.find('[data-testid="sv-lost"]').text()).toBe('31')
    expect(w.find('[data-testid="sv-net"]').text()).toContain('−7')
    expect(w.find('[data-testid="sv-net"]').text()).toContain('±17')
    expect(w.find('[data-testid="sv-denominator"]').text()).toContain('42')
    expect(w.find('[data-testid="sv-plain"]').text()).toContain('plainLoss')
  })

  it('n=0 は平易文なし・±2 未満はトントン文言', () => {
    const zero = mount(StatsShotValueSummary, {
      props: { agg: { n: 0, earned100: 0, lost100: 0, sv100: 0, ci95: 0 }, totalN: 0, selectionLabel: null },
      global
    })
    expect(zero.find('[data-testid="sv-plain"]').exists()).toBe(false)
    const even = mount(StatsShotValueSummary, {
      props: { agg: { n: 10, earned100: 10, lost100: 9, sv100: 1, ci95: 20 }, totalN: 10, selectionLabel: null },
      global
    })
    expect(even.find('[data-testid="sv-plain"]').text()).toContain('plainEven')
  })
})

describe('StatsShotValueBreakdown', () => {
  function brkRow(over: Partial<SvTypeBreakdownRow>): SvTypeBreakdownRow {
    return {
      shotType: 'smash', n: 10, earned100: 20, lost100: 10, sv100: 10, ci95: 15, lowSample: false,
      per100: { kime: 10, yuhatsu: 5, fuseki1: 5, fuseki2: 0, miss: 10, yurushi1: 0, yurushi2: 0 },
      ...over
    }
  }

  it('行描画: セグメント・収支±CI・n<5 薄表示（REQ-005〜007）', () => {
    const w = mount(StatsShotValueBreakdown, {
      props: { rows: [brkRow({}), brkRow({ shotType: 'drop', n: 3, lowSample: true })] },
      global
    })
    const smash = w.find('[data-testid="sv-type-smash"]')
    expect(smash.exists()).toBe(true)
    expect(smash.findAll('.seg').length).toBeGreaterThan(0)
    expect(smash.find('.whisker').exists()).toBe(true)
    const drop = w.find('[data-testid="sv-type-drop"]')
    expect(drop.classes()).toContain('is-dim')
    expect(drop.text()).toContain('lowSample')
  })

  it('空状態（EDGE-003）', () => {
    const w = mount(StatsShotValueBreakdown, { props: { rows: [] }, global })
    expect(w.find('[data-testid="sv-breakdown-empty"]').exists()).toBe(true)
  })
})

describe('StatsShotValuePanel', () => {
  const rows = [
    row({ shot_type: 'smash', n: 10, kime: 3, zone_row: 0, zone_col: 0 }),
    row({ shot_type: 'hairpin', n: 6, miss: 2, zone_row: 2, zone_col: 1 }),
    row({ shot_type: 'lob_high', n: 4, zone_row: null, zone_col: null })
  ]

  it('未選択 = 全体（null ゾーン含む n）→ セル選択でゾーン合算に切替（REQ-004/101, NFR-001）', async () => {
    const w = mount(StatsShotValuePanel, { props: { rows }, global })
    // 全体: n=20
    expect(w.find('[data-testid="sv-denominator"]').text()).toContain('"n":20')
    // 後・左（r0c0）を選択 → n=10
    await w.find('[data-testid="sv-cell-0-0"]').trigger('click')
    expect(w.find('[data-testid="sv-denominator"]').text()).toContain('"n":10')
    // 内訳は選択ゾーンの球種のみ
    expect(w.find('[data-testid="sv-type-smash"]').exists()).toBe(true)
    expect(w.find('[data-testid="sv-type-hairpin"]').exists()).toBe(false)
  })

  it('選択ゾーン 0 件 → 内訳は空状態（EDGE-003）', async () => {
    const w = mount(StatsShotValuePanel, { props: { rows }, global })
    await w.find('[data-testid="sv-cell-1-1"]').trigger('click')
    expect(w.find('[data-testid="sv-breakdown-empty"]').exists()).toBe(true)
  })
})
