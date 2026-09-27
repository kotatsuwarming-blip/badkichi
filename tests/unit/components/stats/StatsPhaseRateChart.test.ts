// @vitest-environment happy-dom
/**
 * StatsPhaseRateChart 単体テスト (TASK-0006 / REQ-013/014)
 */
import { describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'

vi.mock('vue-i18n', () => ({ useI18n: () => ({ t: (k: string) => k }) }))

// eslint-disable-next-line import/first
import StatsPhaseRateChart from '~/components/stats/StatsPhaseRateChart.vue'
// eslint-disable-next-line import/first
import type { PhaseRateEntry } from '~/types/shot-stats'

const ClientOnly = { template: '<div><slot /></div>' }
const VChart = { props: ['option'], template: '<div data-testid="vchart" />' }
const global = { mocks: { $t: (k: string) => k }, stubs: { ClientOnly, VChart } }

const entries: PhaseRateEntry[] = [{
  subjectId: 'p0',
  label: '田中',
  rates: [
    { phase: 'early', total: 4, won: 2, clutchTotal: 0, clutchWon: 0 },
    { phase: 'mid', total: 0, won: 0, clutchTotal: 0, clutchWon: 0 },
    { phase: 'late', total: 5, won: 4, clutchTotal: 2, clutchWon: 2 }
  ]
}]

describe('StatsPhaseRateChart', () => {
  it('序盤/中盤/終盤/接戦 の 4 カテゴリ × 対象ごとの棒 series を構築', () => {
    const w = mount(StatsPhaseRateChart, { props: { entries }, global })
    const option = w.findComponent(VChart).props('option') as {
      xAxis: { data: string[] }
      series: { name: string, data: (number | null)[] }[]
    }
    expect(option.xAxis.data).toHaveLength(4)
    expect(option.series).toHaveLength(1)
    expect(option.series[0]!.name).toBe('田中')
    // 序盤 50% / 中盤 母数0 は null (「-」相当, REQ-202) / 終盤 80% / 接戦 100%
    expect(option.series[0]!.data).toEqual([50, null, 80, 100])
  })
})
