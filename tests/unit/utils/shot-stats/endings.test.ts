/**
 * endings 純関数 単体テスト (TASK-0010 / REQ-005/006/007/103/108 / TC-005/006/007 系)
 */
import { describe, expect, it } from 'vitest'
import {
  buildDecisiveRanking, buildEndingEntries, buildLandZones, classifyEnding
} from '~/utils/shot-stats/endings'
import type { RallyEndingRow } from '~/types/shot-stats'

function row(partial: Partial<RallyEndingRow>): RallyEndingRow {
  return {
    rally_id: 'r', match_id: 'm', set_number: 1, rally_number: 1,
    serving_team: 'A', point_winner: 'A', end_reason: 'floor',
    last_hitter_team: 'A', decisive_shot_type: 'smash', decisive_hit_player_id: 'p0',
    land_x: 0.5, land_y: 0.9, out_direction: null,
    team_a_player1_id: 'p0', team_a_player2_id: 'p1',
    team_b_player1_id: 'p2', team_b_player2_id: 'p3', ...partial
  }
}

describe('classifyEnding (REQ-005 / EDGE-105)', () => {
  it('floor × 勝者最終打 = in 相当 → エース / 被エース', () => {
    const r = row({})
    expect(classifyEnding(r, 'A')).toBe('ace')
    expect(classifyEnding(r, 'B')).toBe('opponent_ace')
  })
  it('floor × 敗者最終打 = out 相当 → 相手ミス / 自ミス', () => {
    const r = row({ point_winner: 'B', last_hitter_team: 'A' })
    expect(classifyEnding(r, 'B')).toBe('opponent_error')
    expect(classifyEnding(r, 'A')).toBe('own_error')
  })
  it('net / service_fault は最終接触者のミス扱い（TC-005-01）', () => {
    const net = row({ end_reason: 'net', point_winner: 'A' })
    expect(classifyEnding(net, 'A')).toBe('opponent_error')
    const fault = row({ end_reason: 'service_fault', point_winner: 'B' })
    expect(classifyEnding(fault, 'A')).toBe('own_error')
  })
  it('body はエース扱い', () => {
    expect(classifyEnding(row({ end_reason: 'body' }), 'A')).toBe('ace')
  })
  it('TC-005-E01: unknown・未注釈・floor×打者不明は「不明」(REQ-108)', () => {
    expect(classifyEnding(row({ end_reason: 'unknown' }), 'A')).toBe('unknown')
    expect(classifyEnding(row({ end_reason: null }), 'A')).toBe('unknown')
    expect(classifyEnding(row({ last_hitter_team: null }), 'A')).toBe('unknown')
  })
})

describe('buildEndingEntries (TC-005-01)', () => {
  const rows = [
    row({ rally_id: 'r1' }), // A エース
    row({ rally_id: 'r2', point_winner: 'B', last_hitter_team: 'A' }), // A 自ミス
    row({ rally_id: 'r3', end_reason: 'net', point_winner: 'A' }), // A 相手ミス獲得
    row({ rally_id: 'r4', end_reason: null }) // 未注釈
  ]
  it('選手視点の内訳と母数併記', () => {
    const [entry] = buildEndingEntries(rows, { kind: 'player', playerId: 'p0' }, id => id)
    expect(entry!.breakdown.won).toEqual({ ace: 1, opponent_error: 1 })
    expect(entry!.breakdown.lost).toEqual({ own_error: 1, opponent_ace: 0 })
    expect(entry!.breakdown.unknown).toBe(1)
    expect(entry!.breakdown.totalRallies).toBe(4)
    expect(entry!.breakdown.annotatedRallies).toBe(3)
  })
  it('all は出場 4 選手にエントリ', () => {
    expect(buildEndingEntries(rows, { kind: 'all' }, id => id)).toHaveLength(4)
  })
})

describe('buildDecisiveRanking (TC-006-01 / TC-006-E01)', () => {
  it('決定打の球種を数え、未注釈は null で区別', () => {
    const rows = [
      row({ rally_id: 'r1', decisive_shot_type: 'smash' }),
      row({ rally_id: 'r2', decisive_shot_type: 'smash' }),
      row({ rally_id: 'r3', decisive_shot_type: null }), // 未注釈
      row({ rally_id: 'r4', end_reason: 'service_fault', decisive_shot_type: null }) // 決定打なし → 除外
    ]
    const ranking = buildDecisiveRanking(rows)
    expect(ranking[0]).toEqual({ shotType: 'smash', count: 2 })
    expect(ranking[1]).toEqual({ shotType: null, count: 1 })
  })
})

describe('buildLandZones (TC-007-01 / REQ-103)', () => {
  it('得点決着の落下点を視点ミラーしてゾーン算入', () => {
    // p2 (チーム B) 視点: land (0.5, 0.9) → ミラー (0.5, 0.1) → row 0, col 1。
    // ただし r1 は A の得点なので B 視点では lost 側
    const result = buildLandZones([row({})], { kind: 'player', playerId: 'p2' }, 'lost')
    expect(result.cells).toEqual([{ row: 0, col: 1, count: 1, ratio: 1 }])
  })
  it('TC-C-03 相当: 範囲外 land は out 細分バケット (deriveOutDirection 同一規則)', () => {
    const result = buildLandZones(
      [row({ point_winner: 'B', last_hitter_team: 'A', land_x: 1.2, land_y: 0.5 })],
      { kind: 'player', playerId: 'p0' }, 'lost'
    )
    expect(result.outFallback.side).toBe(1)
    expect(result.cells).toHaveLength(0)
  })
  it('TC-C-E01: land null は out_direction フォールバック (REQ-103)', () => {
    const result = buildLandZones(
      [row({ point_winner: 'B', last_hitter_team: 'A', land_x: null, land_y: null, out_direction: 'back' })],
      { kind: 'player', playerId: 'p0' }, 'lost'
    )
    expect(result.outFallback.back).toBe(1)
  })
  it('floor 以外の決着は落下点に含めない', () => {
    const result = buildLandZones([row({ end_reason: 'net' })], { kind: 'player', playerId: 'p0' }, 'won')
    expect(result.cells).toHaveLength(0)
  })
})
