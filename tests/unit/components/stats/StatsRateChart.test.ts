// @vitest-environment happy-dom
/**
 * StatsRateChart 単体テスト
 * 方針: VChart / ClientOnly をスタブ。option 構築と選択 emit の分岐を検証。
 * REQ-003 / REQ-004 / REQ-012 / NFR-201
 */
import { describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'

vi.mock('vue-i18n', () => ({ useI18n: () => ({ t: (k: string) => k }) }))

// eslint-disable-next-line import/first
import StatsRateChart from '~/components/stats/StatsRateChart.vue'
// eslint-disable-next-line import/first
import type { PairRate, PlayerRate } from '~/types/stats-dashboard'

const ClientOnly = { template: '<div><slot /></div>' }
const VChart = { props: ['option'], template: '<div data-testid="vchart" />' }
const global = { mocks: { $t: (k: string) => k }, stubs: { ClientOnly, VChart } }

const players: PlayerRate[] = [
  { playerId: 'p0', playerName: '田中', serve: { rate: 0.75, denominator: 4, numerator: 3 }, receive: { rate: null, denominator: 0, numerator: 0 } }
]
const pairs: PairRate[] = [
  { player1Id: 'p0', player2Id: 'p1', pairLabel: '田中 / 佐藤', serve: { rate: 0.5, denominator: 2, numerator: 1 }, receive: { rate: 0.5, denominator: 2, numerator: 1 } }
]

describe('StatsRateChart', () => {
  it('option に serve/receive 系列を構築（母数0は null）', () => {
    const w = mount(StatsRateChart, { props: { entries: players, mode: 'player' }, global })
    const option = w.findComponent(VChart).props('option') as { series: { data: (number | null)[] }[] }
    expect(option.series[0].data).toEqual([75]) // serve 75%
    expect(option.series[1].data).toEqual([null]) // receive 母数0
  })

  it('選手モード: 棒クリックで playerId + role を emit', () => {
    const w = mount(StatsRateChart, { props: { entries: players, mode: 'player' }, global })
    ;(w.vm as unknown as { onChartClick: (p: { seriesIndex: number, dataIndex: number }) => void })
      .onChartClick({ seriesIndex: 0, dataIndex: 0 })
    expect(w.emitted('select')![0][0]).toEqual({ playerId: 'p0', role: 'serve' })
  })

  it('ペアモード: 棒クリックで pair + role(receive) を emit', () => {
    const w = mount(StatsRateChart, { props: { entries: pairs, mode: 'pair' }, global })
    ;(w.vm as unknown as { onChartClick: (p: { seriesIndex: number, dataIndex: number }) => void })
      .onChartClick({ seriesIndex: 1, dataIndex: 0 })
    expect(w.emitted('select')![0][0]).toEqual({ pair: { player1Id: 'p0', player2Id: 'p1' }, role: 'receive' })
  })
})
