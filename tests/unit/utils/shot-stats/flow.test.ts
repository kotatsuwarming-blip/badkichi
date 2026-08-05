/**
 * flow 純関数 単体テスト (TASK-0005 / REQ-101)
 */
import { describe, expect, it } from 'vitest'
import { mergeFlowRallies, subjectTeamOf } from '~/utils/shot-stats/flow'
import type { RallyRow } from '~/types/stats-dashboard'
import type { RallyTempoRow, FlowRally } from '~/types/shot-stats'

function rallyRow(id: string, partial: Partial<RallyRow> = {}): RallyRow {
  return {
    rally_id: id, match_id: 'm1', match_name: 'M', match_date: null,
    set_number: 1, rally_number: 1, serving_team: 'A', server_position: 'right',
    server_player_id: 'p0', receiver_player_id: 'p2', point_winner: 'A',
    is_let: false, is_point_confirmed: true, shot_count: 3,
    video_start_timestamp_ms: 1000, video_source_type: 'youtube', video_source_url: 'u',
    score_a: 0, score_b: 0, rally_duration_ms: null, ...partial
  } as RallyRow
}

function tempoRow(id: string, partial: Partial<RallyTempoRow> = {}): RallyTempoRow {
  return {
    rally_id: id, match_id: 'm1', set_number: 1, rally_number: 1,
    serving_team: 'A', point_winner: 'A', shot_count: 3, timed_count: 3,
    duration_ms: 1400, last3_avg_interval_ms: 700,
    team_a_player1_id: 'p0', team_a_player2_id: 'p1',
    team_b_player1_id: 'p2', team_b_player2_id: 'p3', ...partial
  }
}

describe('mergeFlowRallies', () => {
  it('rally_id でマージし、tempo 側に無いラリー (レット等) は落ちる (REQ-101)', () => {
    const merged = mergeFlowRallies(
      [rallyRow('r1', { score_a: 5, score_b: 3 }), rallyRow('r2', { is_let: true, point_winner: null })],
      [tempoRow('r1')]
    )
    expect(merged).toHaveLength(1)
    expect(merged[0]).toMatchObject({ rallyId: 'r1', scoreA: 5, scoreB: 3, durationMs: 1400, teamA: ['p0', 'p1'] })
  })
  it('セット・ラリー番号順にソート', () => {
    const merged = mergeFlowRallies(
      [rallyRow('r1', { set_number: 2, rally_number: 1 }), rallyRow('r2', { set_number: 1, rally_number: 2 })],
      [tempoRow('r1', { set_number: 2, rally_number: 1 }), tempoRow('r2', { set_number: 1, rally_number: 2 })]
    )
    expect(merged.map(r => r.rallyId)).toEqual(['r2', 'r1'])
  })
})

describe('subjectTeamOf', () => {
  const base = mergeFlowRallies([rallyRow('r1')], [tempoRow('r1')])[0] as FlowRally
  it('選手: 所属チームを返す', () => {
    expect(subjectTeamOf(base, { kind: 'player', playerId: 'p1' })).toBe('A')
    expect(subjectTeamOf(base, { kind: 'player', playerId: 'p3' })).toBe('B')
    expect(subjectTeamOf(base, { kind: 'player', playerId: 'px' })).toBeNull()
  })
  it('ペア: 両名同チームのみ。跨ぎは null', () => {
    expect(subjectTeamOf(base, { kind: 'pair', player1Id: 'p0', player2Id: 'p1' })).toBe('A')
    expect(subjectTeamOf(base, { kind: 'pair', player1Id: 'p0', player2Id: 'p2' })).toBeNull()
  })
  it('all: null (視点なし)', () => {
    expect(subjectTeamOf(base, { kind: 'all' })).toBeNull()
  })
})
