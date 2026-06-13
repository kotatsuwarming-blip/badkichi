import { describe, expect, it } from 'vitest'
import { filterRallies, type MatchRoster } from '~/utils/stats-dashboard/filter-rallies'
import type { RallyRow, StatsFilter, Team } from '~/types/stats-dashboard'

const P0 = 'p0', P1 = 'p1', P2 = 'p2', P3 = 'p3'
const roster: MatchRoster = { pairA: [P0, P1], pairB: [P2, P3] }

function row(n: number, servingTeam: Team, server: string, receiver: string, shots: number): RallyRow {
  return {
    rally_id: `r${n}`, match_id: 'm', match_name: 'M', set_number: 1, rally_number: n,
    serving_team: servingTeam, server_player_id: server, receiver_player_id: receiver,
    point_winner: 'A', is_let: false, is_point_confirmed: true,
    shot_count: shots, video_start_timestamp_ms: 1000 * n,
    video_source_type: 'youtube', video_source_url: 'u'
  }
}

const rows: RallyRow[] = [
  row(1, 'A', P0, P2, 2),
  row(2, 'A', P1, P3, 5),
  row(3, 'B', P2, P0, 10),
  row(4, 'B', P3, P1, 0)
]

const base: StatsFilter = { playerId: null, pair: null, role: null, shotBinKeys: [] }
const ids = (rs: RallyRow[]) => rs.map(r => r.rally_id)

describe('filterRallies — 選手（role 連動）', () => {
  it('role=serve はサーバー一致のみ', () => {
    expect(ids(filterRallies(rows, { ...base, playerId: P0, role: 'serve' }))).toEqual(['r1'])
  })
  it('role=receive はレシーバー一致のみ', () => {
    expect(ids(filterRallies(rows, { ...base, playerId: P0, role: 'receive' }))).toEqual(['r3'])
  })
  it('role=null はサーバー/レシーバーいずれか', () => {
    expect(ids(filterRallies(rows, { ...base, playerId: P0, role: null }))).toEqual(['r1', 'r3'])
  })
})

describe('filterRallies — ペア（role 連動・roster 利用）', () => {
  const pair = { player1Id: P0, player2Id: P1 }
  it('role=serve はペアが serving 側', () => {
    expect(ids(filterRallies(rows, { ...base, pair, role: 'serve' }, roster))).toEqual(['r1', 'r2'])
  })
  it('role=receive はペアが受け側', () => {
    expect(ids(filterRallies(rows, { ...base, pair, role: 'receive' }, roster))).toEqual(['r3', 'r4'])
  })
  it('role=null はペア出場の全ラリー', () => {
    expect(ids(filterRallies(rows, { ...base, pair, role: null }, roster))).toHaveLength(4)
  })
})

describe('filterRallies — ラリー長ビン（和集合）', () => {
  it('単一ビン 1-3（shot0 は除外）', () => {
    expect(ids(filterRallies(rows, { ...base, shotBinKeys: ['1-3'] }))).toEqual(['r1'])
  })
  it('複数ビン 1-3 + 8-12 の和集合', () => {
    expect(ids(filterRallies(rows, { ...base, shotBinKeys: ['1-3', '8-12'] }))).toEqual(['r1', 'r3'])
  })
})

describe('filterRallies — 複合', () => {
  it('選手 serve + ラリー長ビンの AND', () => {
    expect(ids(filterRallies(rows, { ...base, playerId: P0, role: 'serve', shotBinKeys: ['1-3'] }))).toEqual(['r1'])
  })
})
