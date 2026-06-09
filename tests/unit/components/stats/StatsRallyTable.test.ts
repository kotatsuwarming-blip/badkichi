// @vitest-environment happy-dom
/**
 * StatsRallyTable 単体テスト
 * 方針: happy-dom + @vue/test-utils。UButton スタブ、vue-i18n は key 返し。
 * REQ-006 / REQ-007 / EDGE-103
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
const names = { p0: '田中', p2: '佐藤' }

function row(id: string, ms: number | null, opts: Partial<RallyRow> = {}): RallyRow {
  return {
    rally_id: id, match_id: 'm', match_name: 'M', set_number: 1, rally_number: 1,
    serving_team: 'A' as Team, server_player_id: 'p0', receiver_player_id: 'p2',
    point_winner: 'A', is_let: false, is_point_confirmed: true,
    shot_count: 5, video_start_timestamp_ms: ms,
    video_source_type: 'youtube', video_source_url: 'u', ...opts
  }
}

describe('StatsRallyTable', () => {
  it('行クリックで select を emit（再生可能行）', async () => {
    const w = mount(StatsRallyTable, { props: { rows: [row('r1', 1000)], names }, global })
    await w.find('[data-testid="rally-row-r1"]').trigger('click')
    expect(w.emitted('select')).toHaveLength(1)
    expect((w.emitted('select')![0][0] as RallyRow).rally_id).toBe('r1')
  })

  it('video_start_timestamp_ms=null の行はクリックしても select しない（非リンク, EDGE-103）', async () => {
    const w = mount(StatsRallyTable, { props: { rows: [row('r2', null)], names }, global })
    await w.find('[data-testid="rally-row-r2"]').trigger('click')
    expect(w.emitted('select')).toBeUndefined()
    expect(w.find('[data-testid="rally-play-r2"]').exists()).toBe(false)
  })

  it('選手名を解決して表示', () => {
    const w = mount(StatsRallyTable, { props: { rows: [row('r1', 1000)], names }, global })
    expect(w.find('[data-testid="rally-row-r1"]').text()).toContain('田中')
  })

  it('0 件は空状態を表示', () => {
    const w = mount(StatsRallyTable, { props: { rows: [], names }, global })
    expect(w.find('[data-testid="rally-table-empty"]').exists()).toBe(true)
  })
})
