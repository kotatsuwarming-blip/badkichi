import { describe, expect, it } from 'vitest'
import { applyDrilldown } from '~/utils/stats-dashboard/apply-drilldown'
import type { RallyRow, ServePosition, StatsDrilldown, Team } from '~/types/stats-dashboard'

let seq = 0
function row(servingTeam: Team, server: string, receiver: string, pos: ServePosition, shots: number): RallyRow {
  seq += 1
  return {
    rally_id: `r${seq}`, match_id: 'm', match_name: 'M', match_date: '2026-06-01', set_number: 1, rally_number: seq,
    serving_team: servingTeam, server_position: pos, server_player_id: server, receiver_player_id: receiver,
    point_winner: 'A', is_let: false, is_point_confirmed: true,
    shot_count: shots, video_start_timestamp_ms: 0, video_source_type: 'youtube', video_source_url: 'u'
  }
}

const base: StatsDrilldown = { role: null, position: null, shotBinKeys: [] }
const rows: RallyRow[] = [
  row('A', 'p0', 'x', 'right', 2), // r1 p0 serve right
  row('A', 'y', 'p0', 'left', 5), // r2 p0 receive left
  row('A', 'p0', 'x', 'left', 10) // r3 p0 serve left
]
const ids = (rs: RallyRow[]) => rs.map(r => r.rally_id)

describe('applyDrilldown', () => {
  it('role=serve は member が server のラリーのみ', () => {
    expect(ids(applyDrilldown(rows, { ...base, role: 'serve' }, ['p0']))).toEqual(['r1', 'r3'])
  })
  it('role=receive は member が receiver のラリーのみ', () => {
    expect(ids(applyDrilldown(rows, { ...base, role: 'receive' }, ['p0']))).toEqual(['r2'])
  })
  it('position=right はサービスポジション一致のみ', () => {
    expect(ids(applyDrilldown(rows, { ...base, position: 'right' }, ['p0']))).toEqual(['r1'])
  })
  it('role + position + ラリー長ビンの AND', () => {
    expect(ids(applyDrilldown(rows, { role: 'serve', position: 'left', shotBinKeys: ['8-12'] }, ['p0']))).toEqual(['r3'])
  })
  it('members 空（全体）では role 絞りを無視', () => {
    expect(applyDrilldown(rows, { ...base, role: 'serve' }, [])).toHaveLength(3)
  })
})
