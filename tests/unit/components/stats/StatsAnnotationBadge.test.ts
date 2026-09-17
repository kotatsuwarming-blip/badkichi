// @vitest-environment happy-dom
/**
 * StatsAnnotationBadge 単体テスト (TASK-0004 / REQ-003 / NFR-201)
 * 各パスの注釈率表示と、母数 0 の「-」表示。
 */
import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import StatsAnnotationBadge from '~/components/stats/StatsAnnotationBadge.vue'
import type { AnnotationCoverageRow } from '~/types/shot-stats'

const global = { mocks: { $t: (k: string) => k } }

const summary: AnnotationCoverageRow = {
  match_id: '',
  shots_total: 100,
  shots_typed: 72,
  shots_pointed: 40,
  shots_handed: 10,
  shots_attributed: 90,
  rallies_total: 20,
  rallies_ended: 20,
  rallies_fully_timed: 15
}

describe('StatsAnnotationBadge', () => {
  it('各パスの注釈率をパーセントで表示する', () => {
    const w = mount(StatsAnnotationBadge, { props: { summary }, global })
    expect(w.find('[data-testid="badge-ended"]').text()).toContain('100%')
    expect(w.find('[data-testid="badge-typed"]').text()).toContain('72%')
    expect(w.find('[data-testid="badge-pointed"]').text()).toContain('40%')
    expect(w.find('[data-testid="badge-handed"]').text()).toContain('10%')
    expect(w.find('[data-testid="badge-timed"]').text()).toContain('75%')
  })

  it('母数 0 は「-」表示 (EDGE-001)', () => {
    const empty: AnnotationCoverageRow = {
      ...summary, shots_total: 0, shots_typed: 0, rallies_total: 0, rallies_ended: 0, rallies_fully_timed: 0
    }
    const w = mount(StatsAnnotationBadge, { props: { summary: empty }, global })
    expect(w.find('[data-testid="badge-ended"]').text()).toContain('-')
    expect(w.find('[data-testid="badge-typed"]').text()).toContain('-')
  })
})
