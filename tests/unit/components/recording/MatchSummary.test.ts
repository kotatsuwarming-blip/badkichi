// @vitest-environment happy-dom
/**
 * MatchSummary.vue 単体テスト
 * 方針: happy-dom + @vue/test-utils。vue-i18n キー素通し。
 */
import { describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import type { MatchSummary } from '~/types/match-recording'

vi.mock('vue-i18n', () => ({ useI18n: () => ({ t: (k: string) => k }) }))

// eslint-disable-next-line import/first
import MatchSummary from '~/components/recording/MatchSummary.vue'

function mountSummary(summary: MatchSummary) {
  return mount(MatchSummary, { props: { summary }, global: { mocks: { $t: (k: string) => k } } })
}

describe('MatchSummary', () => {
  it('各セットのスコアと試合勝者を表示する', () => {
    const summary: MatchSummary = {
      sets: [
        { setNumber: 1, scoreA: 21, scoreB: 15, winner: 'A' },
        { setNumber: 2, scoreA: 18, scoreB: 21, winner: 'B' },
        { setNumber: 3, scoreA: 21, scoreB: 19, winner: 'A' }
      ],
      setsWonA: 2, setsWonB: 1, matchWinner: 'A'
    }
    const w = mountSummary(summary)
    expect(w.find('[data-testid="summary-winner"]').exists()).toBe(true)
    expect(w.find('[data-testid="summary-set-1"]').text()).toContain('21')
    expect(w.find('[data-testid="summary-set-1"]').text()).toContain('15')
    expect(w.findAll('[data-testid^="summary-set-"]')).toHaveLength(3)
  })

  it('試合未決着なら記録中を表示する', () => {
    const summary: MatchSummary = {
      sets: [{ setNumber: 1, scoreA: 10, scoreB: 8, winner: null }],
      setsWonA: 0, setsWonB: 0, matchWinner: null
    }
    const w = mountSummary(summary)
    expect(w.find('[data-testid="summary-inprogress"]').exists()).toBe(true)
    expect(w.find('[data-testid="summary-winner"]').exists()).toBe(false)
  })
})
