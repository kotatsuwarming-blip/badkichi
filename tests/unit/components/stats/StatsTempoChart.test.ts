// @vitest-environment happy-dom
/**
 * StatsTempoChart 単体テスト (TASK-0007 / REQ-015/016/106/107 + 改修2026-08-12)
 * 2 軸散布図: 得点=青丸 / 失点=赤バツ、y=x 対角補助線、点タップで select emit。
 */
import { describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'

vi.mock('vue-i18n', () => ({ useI18n: () => ({ t: (k: string) => k }) }))

// eslint-disable-next-line import/first
import StatsTempoChart from '~/components/stats/StatsTempoChart.vue'
// eslint-disable-next-line import/first
import type { TempoSample } from '~/types/shot-stats'

const ClientOnly = { template: '<div><slot /></div>' }
const VChart = { props: ['option'], template: '<div data-testid="vchart" />' }
const global = { mocks: { $t: (k: string, p?: Record<string, unknown>) => p ? `${k}:${JSON.stringify(p)}` : k }, stubs: { ClientOnly, VChart } }

const samples: TempoSample[] = [
  { rallyId: 'r1', won: true, avgIntervalSec: 1.0, last4IntervalSec: 0.6, videoStartMs: 5000, precise: true },
  { rallyId: 'r2', won: false, avgIntervalSec: 0.8, last4IntervalSec: 1.1, videoStartMs: null, precise: false }
]

interface ScatterSeries { type: string, name?: string, symbol?: string, data: [number, number, string][] }

function seriesOf(w: ReturnType<typeof mount>): ScatterSeries[] {
  return (w.findComponent(VChart).props('option') as { series: ScatterSeries[] }).series
}

describe('StatsTempoChart', () => {
  it('得点/失点の 2 scatter + 対角補助線を構築 (改修2026-08-12)', () => {
    const w = mount(StatsTempoChart, { props: { samples, excluded: 3 }, global })
    const series = seriesOf(w)
    const scatter = series.filter(s => s.type === 'scatter')
    const line = series.filter(s => s.type === 'line')
    expect(scatter).toHaveLength(2)
    expect(line).toHaveLength(1) // y=x 対角
    expect(scatter[0]!.data[0]).toEqual([1.0, 0.6, 'r1']) // [全体平均, 終盤4打, rallyId]
    expect(scatter[1]!.data[0]).toEqual([0.8, 1.1, 'r2'])
    // 失点系列は形でも区別（バツ = カスタム path シンボル）
    expect(scatter[1]!.symbol).toContain('path://')
  })

  it('対角線は両軸共通の max まで引かれる', () => {
    const w = mount(StatsTempoChart, { props: { samples, excluded: 0 }, global })
    const line = seriesOf(w).find(s => s.type === 'line')!
    const [start, end] = line.data as unknown as [number, number][]
    expect(start).toEqual([0, 0])
    expect(end![0]).toBe(end![1]) // y=x
    expect(end![0]).toBeGreaterThanOrEqual(1.1) // 最大値以上
  })

  it('視点なし (won=null) は単一系列', () => {
    const neutral = samples.map(s => ({ ...s, won: null }))
    const w = mount(StatsTempoChart, { props: { samples: neutral, excluded: 0 }, global })
    expect(seriesOf(w).filter(s => s.type === 'scatter')).toHaveLength(1)
    expect(seriesOf(w)[0]!.data).toHaveLength(2)
  })

  it('点タップで rallyId を select emit（scatter 以外は無視）', () => {
    const w = mount(StatsTempoChart, { props: { samples, excluded: 0 }, global })
    const vm = w.vm as unknown as { onPointClick: (p: { seriesType?: string, data?: [number, number, string] }) => void }
    vm.onPointClick({ seriesType: 'scatter', data: [1.0, 0.6, 'r1'] })
    vm.onPointClick({ seriesType: 'line', data: [0, 0, ''] })
    expect(w.emitted('select')).toHaveLength(1)
    expect(w.emitted('select')![0][0]).toBe('r1')
  })

  it('近似注記に対象数・対象外数を併記 (REQ-106/107)', () => {
    const w = mount(StatsTempoChart, { props: { samples, excluded: 3 }, global })
    const note = w.find('[data-testid="tempo-note"]').text()
    expect(note).toContain('shotStats.tempo.note')
    expect(note).toContain('"precise":1')
    expect(note).toContain('"approx":1')
    expect(note).toContain('"excluded":3')
  })
})
