// @vitest-environment happy-dom
/**
 * StatsSetFlowChart 単体テスト (TASK-0008 / REQ-017/018/019)
 */
import { describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'

vi.mock('vue-i18n', () => ({ useI18n: () => ({ t: (k: string) => k }) }))

// eslint-disable-next-line import/first
import StatsSetFlowChart from '~/components/stats/StatsSetFlowChart.vue'
// eslint-disable-next-line import/first
import type { WormPoint } from '~/types/shot-stats'

const ClientOnly = { template: '<div><slot /></div>' }
const VChart = { props: ['option'], template: '<div data-testid="vchart" />' }
const global = { mocks: { $t: (k: string, p?: Record<string, unknown>) => p ? `${k}:${JSON.stringify(p)}` : k }, stubs: { ClientOnly, VChart } }

// ○○○●●●● (+11点到達を含む長い系列は intervalMarkIndex 側でテスト済み)
const points: WormPoint[] = [1, 2, 3, 2, 1, 0, -1].map((diff, i) => ({
  rallyId: `r${i + 1}`, rallyNumber: i + 1, diff,
  scoreA: Math.min(i, 3), scoreB: Math.max(0, i - 3),
  videoStartMs: i === 0 ? null : i * 1000
}))

describe('StatsSetFlowChart', () => {
  it('階段折れ線 (step) の diff 系列と連取/連失の markArea 帯 (REQ-017/018)', () => {
    const w = mount(StatsSetFlowChart, { props: { points }, global })
    const option = w.findComponent(VChart).props('option') as {
      series: { step: string, data: number[], markArea: { data: unknown[][] } }[]
    }
    expect(option.series[0]!.step).toBe('end')
    expect(option.series[0]!.data).toEqual([1, 2, 3, 2, 1, 0, -1])
    expect(option.series[0]!.markArea.data).toHaveLength(2) // 3連取 + 4連失
  })

  it('最大連取/連失の注記を表示 (REQ-018)', () => {
    const w = mount(StatsSetFlowChart, { props: { points }, global })
    const note = w.find('[data-testid="run-note"]').text()
    expect(note).toContain('"won":3')
    expect(note).toContain('"lost":4')
  })

  it('点タップで select を emit (REQ-019)', () => {
    const w = mount(StatsSetFlowChart, { props: { points }, global })
    ;(w.vm as unknown as { onChartClick: (p: { dataIndex: number }) => void }).onChartClick({ dataIndex: 2 })
    expect((w.emitted('select')![0][0] as WormPoint).rallyId).toBe('r3')
  })
})
