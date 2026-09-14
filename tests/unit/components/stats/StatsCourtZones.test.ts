// @vitest-environment happy-dom
/**
 * StatsCourtZones.vue 単体テスト (singles-support TASK-0012 / REQ-301a)
 */
import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import StatsCourtZones from '~/components/stats/StatsCourtZones.vue'

describe('StatsCourtZones', () => {
  it('TC-301-02: シングルスサイドライン (左右 46cm 内側) を常に描く', () => {
    const w = mount(StatsCourtZones, { props: { cells: [] }, global: { mocks: { $t: (k: string) => k } } })
    const lines = w.findAll('[data-testid="singles-sideline"]')
    expect(lines).toHaveLength(2)
    expect(lines.map(l => Number(l.attributes('x1')))).toEqual([46, 564])
  })
})
