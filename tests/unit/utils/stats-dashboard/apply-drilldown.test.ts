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

const base: StatsDrilldown = { position: null, memberId: null, shotBinKeys: [] }
const rows: RallyRow[] = [
  row('A', 'p0', 'x', 'right', 2), // r1
  row('A', 'y', 'p0', 'left', 5), // r2 (p0 receiver)
  row('A', 'z', 'w', 'left', 10) // r3 (p0 不在)
]
const ids = (rs: RallyRow[]) => rs.map(r => r.rally_id)

describe('applyDrilldown', () => {
  it('position=right はサービスポジション一致のみ', () => {
    expect(ids(applyDrilldown(rows, { ...base, position: 'right' }))).toEqual(['r1'])
  })
  it('memberId はその選手が server/receiver のラリーのみ（ペア→個人）', () => {
    expect(ids(applyDrilldown(rows, { ...base, memberId: 'p0' }))).toEqual(['r1', 'r2'])
  })
  it('ラリー長ビンの和集合', () => {
    expect(ids(applyDrilldown(rows, { ...base, shotBinKeys: ['8-12'] }))).toEqual(['r3'])
  })
  it('position + memberId + ビンの AND', () => {
    expect(ids(applyDrilldown(rows, { position: 'left', memberId: 'p0', shotBinKeys: ['4-7'] }))).toEqual(['r2'])
  })
  it('未指定は全件', () => {
    expect(applyDrilldown(rows, base)).toHaveLength(3)
  })
})
