// @vitest-environment happy-dom
/**
 * StatsRallyTable 単体テスト
 * 方針: happy-dom + @vue/test-utils。UButton スタブ、vue-i18n は key 返し。
 * REQ-006 / REQ-007 / EDGE-103 / U-06
 */
import { describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'

vi.mock('vue-i18n', () => ({ useI18n: () => ({ t: (k: string) => k }) }))

// eslint-disable-next-line import/first
import StatsRallyTable from '~/components/stats/StatsRallyTable.vue'
// eslint-disable-next-line import/first
import type { RallyRow, Team } from '~/types/stats-dashboard'

const UButton = {
  props: ['size', 'variant', 'icon', 'ariaLabel'],
  emits: ['click'],
  template: '<button @click="$emit(\'click\', $event)"><slot /></button>'
}
const global = { mocks: { $t: (k: string) => k }, stubs: { UButton } }

function row(id: string, ms: number | null, opts: Partial<RallyRow> = {}): RallyRow {
  return {
    rally_id: id, match_id: 'm', match_name: 'M', match_date: null, set_number: 1, rally_number: 1,
    serving_team: 'A' as Team, server_position: 'right', server_player_id: 'p0', receiver_player_id: 'p2',
    point_winner: 'A', is_let: false, is_point_confirmed: true,
    shot_count: 5, video_start_timestamp_ms: ms,
    video_source_type: 'youtube', video_source_url: 'u',
    score_a: 3, score_b: 2, rally_duration_ms: 8500, ...opts
  }
}

describe('StatsRallyTable', () => {
  it('行クリックで select を emit（再生可能行）', async () => {
    const w = mount(StatsRallyTable, { props: { rows: [row('r1', 1000)] }, global })
    await w.find('[data-testid="rally-row-r1"]').trigger('click')
    expect(w.emitted('select')).toHaveLength(1)
    expect((w.emitted('select')![0][0] as RallyRow).rally_id).toBe('r1')
  })

  it('video_start_timestamp_ms=null の行はクリックしても select しない（非リンク, EDGE-103）', async () => {
    const w = mount(StatsRallyTable, { props: { rows: [row('r2', null)] }, global })
    await w.find('[data-testid="rally-row-r2"]').trigger('click')
    expect(w.emitted('select')).toBeUndefined()
    expect(w.find('[data-testid="rally-play-r2"]').exists()).toBe(false)
  })

  it('0 件は空状態を表示', () => {
    const w = mount(StatsRallyTable, { props: { rows: [] }, global })
    expect(w.find('[data-testid="rally-table-empty"]').exists()).toBe(true)
  })

  it('ラリー開始時スコアとセット列を表示（U-06）', () => {
    const w = mount(StatsRallyTable, { props: { rows: [row('r1', 1000, { set_number: 2 })] }, global })
    expect(w.find('[data-testid="rally-score-r1"]').text()).toBe('3-2')
    expect(w.find('[data-testid="rally-set-r1"]').exists()).toBe(true)
  })

  it('ラリー時間を秒で表示。null は「-」（U-06）', () => {
    const w = mount(StatsRallyTable, {
      props: { rows: [row('r1', 1000, { rally_duration_ms: 8500 }), row('r2', 2000, { rally_duration_ms: null })] },
      global
    })
    expect(w.find('[data-testid="rally-duration-r1"]').text()).toBe('8.5s')
    expect(w.find('[data-testid="rally-duration-r2"]').text()).toBe('-')
  })
})
