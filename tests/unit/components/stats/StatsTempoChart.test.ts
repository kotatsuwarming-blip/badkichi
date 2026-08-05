// @vitest-environment happy-dom
/**
 * StatsTempoChart 単体テスト (TASK-0007 / REQ-015/016/106/107)
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
const UButton = { template: '<button @click="$emit(\'click\')"><slot /></button>' }
const global = { mocks: { $t: (k: string, p?: Record<string, unknown>) => p ? `${k}:${JSON.stringify(p)}` : k }, stubs: { ClientOnly, VChart, UButton } }

const samples: TempoSample[] = [
  { rallyId: 'r1', won: true, avgShotsPerSec: 1.0, last3IntervalMs: 500 },
  { rallyId: 'r2', won: false, avgShotsPerSec: 0.6, last3IntervalMs: null }
]

describe('StatsTempoChart', () => {
  it('得点/失点の 2 series を連続値 scatter で構築 (REQ-015)', () => {
    const w = mount(StatsTempoChart, { props: { samples, excluded: 3, measure: 'avg' }, global })
    const option = w.findComponent(VChart).props('option') as { series: { type: string, data: unknown[] }[] }
    expect(option.series).toHaveLength(2)
    expect(option.series.every(s => s.type === 'scatter')).toBe(true)
    expect(option.series[0]!.data).toHaveLength(1) // won
    expect(option.series[1]!.data).toHaveLength(1) // lost
  })

  it('視点なし (won=null) は単一系列', () => {
    const neutral = samples.map(s => ({ ...s, won: null }))
    const w = mount(StatsTempoChart, { props: { samples: neutral, excluded: 0, measure: 'avg' }, global })
    const option = w.findComponent(VChart).props('option') as { series: { data: unknown[] }[] }
    expect(option.series).toHaveLength(1)
    expect(option.series[0]!.data).toHaveLength(2)
  })

  it('measure トグルで update:measure を emit (REQ-016)', async () => {
    const w = mount(StatsTempoChart, { props: { samples, excluded: 0, measure: 'avg' }, global })
    await w.find('[data-testid="tempo-last3"]').trigger('click')
    expect(w.emitted('update:measure')![0][0]).toBe('last3')
  })

  it('last3 では間隔 null のサンプルが落ち、近似注記に対象数を併記 (REQ-106/107)', () => {
    const w = mount(StatsTempoChart, { props: { samples, excluded: 3, measure: 'last3' }, global })
    const option = w.findComponent(VChart).props('option') as { series: { data: unknown[] }[] }
    expect(option.series[0]!.data).toHaveLength(1) // r1 のみ (r2 は last3 null)
    expect(option.series[1]!.data).toHaveLength(0)
    const note = w.find('[data-testid="tempo-note"]').text()
    expect(note).toContain('shotStats.tempo.note')
    expect(note).toContain('"n":1')
    expect(note).toContain('"excluded":3')
  })
})
