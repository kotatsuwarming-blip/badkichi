import { describe, expect, it } from 'vitest'
import { computeEntityBreakdown } from '~/utils/stats-dashboard/entity-breakdown'
import type { RallyRow, ServePosition, Team } from '~/types/stats-dashboard'

let seq = 0
function row(opts: Partial<RallyRow> & { servingTeam: Team, server: string, receiver: string, pos: ServePosition, winner: Team | null }): RallyRow {
  seq += 1
  return {
    rally_id: `r${seq}`, match_id: 'm', match_name: 'M', match_date: '2026-06-01', set_number: 1, rally_number: seq,
    serving_team: opts.servingTeam, server_position: opts.pos,
    server_player_id: opts.server, receiver_player_id: opts.receiver,
    point_winner: opts.winner, is_let: opts.is_let ?? false, is_point_confirmed: opts.is_point_confirmed ?? (opts.winner !== null),
    shot_count: opts.shot_count ?? 3, video_start_timestamp_ms: 0, video_source_type: 'youtube', video_source_url: 'u'
  }
}

describe('computeEntityBreakdown', () => {
  it('選手の serve/receive × right/left を算出（確定のみ・ポジション別）', () => {
    const rows: RallyRow[] = [
      row({ servingTeam: 'A', server: 'p0', receiver: 'x', pos: 'right', winner: 'A' }), // serve-right 勝
      row({ servingTeam: 'A', server: 'p0', receiver: 'x', pos: 'right', winner: 'B' }), // serve-right 負
      row({ servingTeam: 'A', server: 'p0', receiver: 'x', pos: 'left', winner: 'A' }), // serve-left 勝
      row({ servingTeam: 'A', server: 'y', receiver: 'p0', pos: 'right', winner: 'B' }), // receive-right 勝(B=受け側)
      row({ servingTeam: 'A', server: 'p0', receiver: 'x', pos: 'right', winner: null, is_let: true }) // レット除外
    ]
    const b = computeEntityBreakdown(rows, ['p0'])
    const sr = b.cells.find(c => c.role === 'serve' && c.position === 'right')!
    expect(sr.rate.denominator).toBe(2)
    expect(sr.rate.numerator).toBe(1)
    const sl = b.cells.find(c => c.role === 'serve' && c.position === 'left')!
    expect(sl.rate.denominator).toBe(1)
    expect(sl.rate.numerator).toBe(1)
    const rr = b.cells.find(c => c.role === 'receive' && c.position === 'right')!
    expect(rr.rate.denominator).toBe(1)
    expect(rr.rate.numerator).toBe(1)
    // 合計
    expect(b.serve.denominator).toBe(3)
    expect(b.serve.numerator).toBe(2)
    expect(b.receive.denominator).toBe(1)
  })

  it('ペア（2選手）はいずれかが server/receiver の確定ラリーを集計', () => {
    const rows: RallyRow[] = [
      row({ servingTeam: 'A', server: 'p0', receiver: 'x', pos: 'right', winner: 'A' }),
      row({ servingTeam: 'A', server: 'p1', receiver: 'x', pos: 'left', winner: 'A' })
    ]
    const b = computeEntityBreakdown(rows, ['p0', 'p1'])
    expect(b.serve.denominator).toBe(2)
    expect(b.serve.numerator).toBe(2)
  })
})
