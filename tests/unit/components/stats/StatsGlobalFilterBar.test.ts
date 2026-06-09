// @vitest-environment happy-dom
/**
 * StatsGlobalFilterBar 単体テスト
 * 対象（選手/ペア）選択・期間・試合個別トグルの emit。
 * 受け入れ2026-06-09
 */
import { describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'

vi.mock('vue-i18n', () => ({ useI18n: () => ({ t: (k: string) => k }) }))

// eslint-disable-next-line import/first
import StatsGlobalFilterBar from '~/components/stats/StatsGlobalFilterBar.vue'
// eslint-disable-next-line import/first
import type { StatsGlobalFilter } from '~/types/stats-dashboard'

const players = [{ id: 'p0', name: '田中' }, { id: 'p1', name: '佐藤' }]
const matchesMeta = [{ id: 'm1', name: 'A', matchDate: '2026-06-01' }, { id: 'm2', name: 'B', matchDate: '2026-06-10' }]
const gf: StatsGlobalFilter = { entity: { kind: 'all' }, dateFrom: null, dateTo: null, excludedMatchIds: [] }
const global = { mocks: { $t: (k: string) => k } }

function mountBar(showPeriod = true) {
  return mount(StatsGlobalFilterBar, {
    props: { players, matchesMeta, globalFilter: gf, includedMatchIds: ['m1', 'm2'], showPeriod },
    global
  })
}

describe('StatsGlobalFilterBar', () => {
  it('対象=選手 + 選手選択で setEntity(player) を emit', async () => {
    const w = mountBar()
    await w.find('[data-testid="entity-mode"]').setValue('player')
    await w.find('[data-testid="entity-player"]').setValue('p0')
    const emits = w.emitted('setEntity')!
    expect(emits[emits.length - 1][0]).toEqual({ kind: 'player', playerId: 'p0' })
  })

  it('期間 showPeriod=false では日付・試合一覧を出さない', () => {
    const w = mountBar(false)
    expect(w.find('[data-testid="date-from"]').exists()).toBe(false)
  })

  it('試合チェックボックスのトグルで toggleMatch を emit', async () => {
    const w = mountBar()
    await w.find('[data-testid="match-toggle-m1"] input').trigger('change')
    expect(w.emitted('toggleMatch')![0][0]).toBe('m1')
  })

  it('日付変更で setDateRange を emit', async () => {
    const w = mountBar()
    const input = w.find('[data-testid="date-from"]')
    ;(input.element as HTMLInputElement).value = '2026-06-05'
    await input.trigger('change')
    expect(w.emitted('setDateRange')![0]).toEqual(['2026-06-05', null])
  })
})
