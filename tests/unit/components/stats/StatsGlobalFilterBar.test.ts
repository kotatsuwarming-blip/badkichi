// @vitest-environment happy-dom
/**
 * StatsGlobalFilterBar 単体テスト
 * 対象モード（選手別/ペア別）・選手/ペア選択・セット・期間・試合個別トグルの emit。
 * 受け入れ2026-06-09 + フィルタ再編2026-08-08
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
const global = {
  mocks: { $t: (k: string) => k },
  stubs: { UButton: { props: ['variant'], template: '<button v-bind="$attrs"><slot /></button>' } }
}

function gfOf(partial: Partial<StatsGlobalFilter> = {}): StatsGlobalFilter {
  return {
    subjectMode: 'player', playerId: null, pair1Id: null, pair2Id: null,
    setNumber: null, dateFrom: null, dateTo: null, excludedMatchIds: [], ...partial
  }
}

function mountBar(showPeriod = true, gf: StatsGlobalFilter = gfOf()) {
  return mount(StatsGlobalFilterBar, {
    props: {
      players, matchesMeta, globalFilter: gf,
      includedMatchIds: ['m1', 'm2'], setNumbers: [1, 2], showPeriod
    },
    global
  })
}

describe('StatsGlobalFilterBar', () => {
  it('モードボタンで setSubjectMode を emit', async () => {
    const w = mountBar()
    await w.find('[data-testid="mode-pair"]').trigger('click')
    expect(w.emitted('setSubjectMode')![0][0]).toBe('pair')
  })

  it('選手別: 選手選択で setPlayer を emit（空選択は null）', async () => {
    const w = mountBar()
    await w.find('[data-testid="entity-player"]').setValue('p0')
    expect(w.emitted('setPlayer')![0][0]).toBe('p0')
    await w.find('[data-testid="entity-player"]').setValue('')
    expect(w.emitted('setPlayer')![1][0]).toBeNull()
  })

  it('ペア別: 2 選手の選択で setPair1/setPair2 を emit', async () => {
    const w = mountBar(true, gfOf({ subjectMode: 'pair' }))
    await w.find('[data-testid="entity-pair1"]').setValue('p0')
    await w.find('[data-testid="entity-pair2"]').setValue('p1')
    expect(w.emitted('setPair1')![0][0]).toBe('p0')
    expect(w.emitted('setPair2')![0][0]).toBe('p1')
  })

  it('セット選択で setSetNumber を emit（全セットは null）', async () => {
    const w = mountBar()
    await w.find('[data-testid="filter-set"]').setValue('2')
    expect(w.emitted('setSetNumber')![0][0]).toBe(2)
    await w.find('[data-testid="filter-set"]').setValue('')
    expect(w.emitted('setSetNumber')![1][0]).toBeNull()
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
