import { describe, expect, it } from 'vitest'
import { computeSubjectRates } from '~/utils/stats-dashboard/compute-subject-rates'
import type { RallyRow, ServePosition, Team } from '~/types/stats-dashboard'

let seq = 0
function row(servingTeam: Team, server: string, receiver: string, pos: ServePosition, winner: Team | null, isLet = false): RallyRow {
  seq += 1
  return {
    rally_id: `r${seq}`, match_id: 'm', match_name: 'M', match_date: '2026-06-01', set_number: 1, rally_number: seq,
    serving_team: servingTeam, server_position: pos, server_player_id: server, receiver_player_id: receiver,
    point_winner: winner, is_let: isLet, is_point_confirmed: winner !== null,
    shot_count: 3, video_start_timestamp_ms: 0, video_source_type: 'youtube', video_source_url: 'u'
  }
}

const nameOf = (id: string) => (id === 'p0' ? '田中' : id === 'p1' ? '佐藤' : id)

describe('computeSubjectRates', () => {
  const rows: RallyRow[] = [
    row('A', 'p0', 'x', 'right', 'A'), // p0 serve 勝
    row('A', 'p0', 'x', 'left', 'B'), // p0 serve 負
    row('A', 'y', 'p1', 'right', 'B'), // p1 receive 勝
    row('A', 'p0', 'x', 'right', null, true) // レット除外
  ]

  it('各 subject の serve/receive 得点率を PlayerRate で返す', () => {
    const res = computeSubjectRates(rows, ['p0', 'p1'], nameOf)
    const p0 = res.find(r => r.playerId === 'p0')!
    expect(p0.playerName).toBe('田中')
    expect(p0.serve.denominator).toBe(2)
    expect(p0.serve.numerator).toBe(1)
    const p1 = res.find(r => r.playerId === 'p1')!
    expect(p1.receive.denominator).toBe(1)
    expect(p1.receive.numerator).toBe(1)
  })

  it('position=right で絞ると右(偶数)のみ集計', () => {
    const res = computeSubjectRates(rows, ['p0'], nameOf, 'right')
    expect(res[0]!.serve.denominator).toBe(1) // right の serve は 1 本
  })
})
