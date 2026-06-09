// @vitest-environment happy-dom
/**
 * StatsBreakdownChart 単体テスト
 * 役割×ポジションのセル表示・ドリルダウン濃淡（is-dim）・トグル emit。
 * 受け入れ2026-06-09
 */
import { describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'

vi.mock('vue-i18n', () => ({ useI18n: () => ({ t: (k: string) => k }) }))

// eslint-disable-next-line import/first
import StatsBreakdownChart from '~/components/stats/StatsBreakdownChart.vue'
// eslint-disable-next-line import/first
import type { EntityBreakdown, StatsDrilldown } from '~/types/stats-dashboard'

const breakdown: EntityBreakdown = {
  serve: { rate: 0.5, denominator: 2, numerator: 1 },
  receive: { rate: null, denominator: 0, numerator: 0 },
  cells: [
    { role: 'serve', position: 'right', rate: { rate: 1, denominator: 1, numerator: 1 } },
    { role: 'serve', position: 'left', rate: { rate: 0, denominator: 1, numerator: 0 } },
    { role: 'receive', position: 'right', rate: { rate: null, denominator: 0, numerator: 0 } },
    { role: 'receive', position: 'left', rate: { rate: null, denominator: 0, numerator: 0 } }
  ]
}
const noDrill: StatsDrilldown = { role: null, position: null, shotBinKeys: [] }
const global = { mocks: { $t: (k: string) => k } }

describe('StatsBreakdownChart', () => {
  it('4 セルを表示し、ドリルダウン未設定では全セル active（非 dim）', () => {
    const w = mount(StatsBreakdownChart, { props: { breakdown, drilldown: noDrill }, global })
    expect(w.find('[data-testid="cell-serve-right"]').exists()).toBe(true)
    expect(w.find('[data-testid="cell-receive-left"]').classes()).not.toContain('is-dim')
  })

  it('role=serve ドリルダウンで receive セルが dim になる', () => {
    const w = mount(StatsBreakdownChart, { props: { breakdown, drilldown: { ...noDrill, role: 'serve' } }, global })
    expect(w.find('[data-testid="cell-serve-right"]').classes()).not.toContain('is-dim')
    expect(w.find('[data-testid="cell-receive-right"]').classes()).toContain('is-dim')
  })

  it('役割トグルクリックで drillRole を emit', async () => {
    const w = mount(StatsBreakdownChart, { props: { breakdown, drilldown: noDrill }, global })
    await w.find('[data-testid="drill-role-serve"]').trigger('click')
    expect(w.emitted('drillRole')![0][0]).toBe('serve')
  })

  it('ポジショントグルクリックで drillPosition を emit', async () => {
    const w = mount(StatsBreakdownChart, { props: { breakdown, drilldown: noDrill }, global })
    await w.find('[data-testid="drill-pos-right"]').trigger('click')
    expect(w.emitted('drillPosition')![0][0]).toBe('right')
  })
})
