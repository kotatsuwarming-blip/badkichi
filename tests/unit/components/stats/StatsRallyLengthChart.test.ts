// @vitest-environment happy-dom
/**
 * StatsRallyLengthChart 単体テスト
 * 方針: VChart / ClientOnly スタブ。コンボ option と ビン複数選択トグル emit を検証。
 * REQ-005 / REQ-010 / ヒアリング2026-06-09
 */
import { describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'

vi.mock('vue-i18n', () => ({ useI18n: () => ({ t: (k: string) => k }) }))

// eslint-disable-next-line import/first
import StatsRallyLengthChart from '~/components/stats/StatsRallyLengthChart.vue'
// eslint-disable-next-line import/first
import { RALLY_LENGTH_BINS } from '~/types/stats-dashboard'
// eslint-disable-next-line import/first
import type { RallyLengthBin } from '~/types/stats-dashboard'

const ClientOnly = { template: '<div><slot /></div>' }
const VChart = { props: ['option'], template: '<div data-testid="vchart" />' }
const global = { stubs: { ClientOnly, VChart } }

const bins: RallyLengthBin[] = RALLY_LENGTH_BINS.map((bin, i) => ({
  bin,
  rallies: i === 0 ? 6 : 0,
  serveWinRate: i === 0 ? 0.5 : null
}))

describe('StatsRallyLengthChart', () => {
  it('棒(本数)+線(勝率%)のコンボ option を構築', () => {
    const w = mount(StatsRallyLengthChart, { props: { bins, selectedKeys: [] }, global })
    const option = w.findComponent(VChart).props('option') as { series: { type: string }[] }
    expect(option.series[0].type).toBe('bar')
    expect(option.series[1].type).toBe('line')
  })

  it('未選択の棒クリックでビンキーを追加 emit', () => {
    const w = mount(StatsRallyLengthChart, { props: { bins, selectedKeys: [] }, global })
    ;(w.vm as unknown as { onChartClick: (p: { dataIndex: number }) => void }).onChartClick({ dataIndex: 0 })
    expect(w.emitted('selectBins')![0][0]).toEqual(['1-3'])
  })

  it('選択済みの棒クリックでトグル解除（和集合から除外）', () => {
    const w = mount(StatsRallyLengthChart, { props: { bins, selectedKeys: ['1-3', '4-7'] }, global })
    ;(w.vm as unknown as { onChartClick: (p: { dataIndex: number }) => void }).onChartClick({ dataIndex: 0 })
    expect(w.emitted('selectBins')![0][0]).toEqual(['4-7'])
  })
})
