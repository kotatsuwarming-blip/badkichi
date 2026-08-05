/**
 * momentum 純関数 単体テスト (TASK-0008 / REQ-017/018 / TC-017/018 系)
 */
import { describe, expect, it } from 'vitest'
import { buildWorm, detectRuns, intervalMarkIndex, maxRunLength } from '~/utils/shot-stats/momentum'
import type { FlowRally } from '~/types/shot-stats'

function rally(n: number, winner: 'A' | 'B', scoreA: number, scoreB: number): FlowRally {
  return {
    rallyId: `r${n}`, matchId: 'm', setNumber: 1, rallyNumber: n,
    servingTeam: 'A', pointWinner: winner, scoreA, scoreB,
    videoStartMs: n * 1000, shotCount: 2, timedCount: 2, durationMs: 1000, last3Ms: null,
    teamA: ['p0', 'p1'], teamB: ['p2', 'p3']
  }
}

// TC-017-01: ○○○●●●●○ → +1,+2,+3,+2,+1,0,-1,0
const seq: ('A' | 'B')[] = ['A', 'A', 'A', 'B', 'B', 'B', 'B', 'A']
const rows = seq.map((w, i) => {
  const before = seq.slice(0, i)
  const a = before.filter(x => x === 'A').length
  const b = before.length - a
  return rally(i + 1, w, a, b)
})

describe('buildWorm (REQ-017)', () => {
  it('TC-017-01: 階段折れ線 +1,+2,+3,+2,+1,0,-1,0 (視点 A)', () => {
    const points = buildWorm(rows, 'A')
    expect(points.map(p => p.diff)).toEqual([1, 2, 3, 2, 1, 0, -1, 0])
  })
  it('視点 B では符号反転', () => {
    const points = buildWorm(rows, 'B')
    expect(points.map(p => p.diff)).toEqual([-1, -2, -3, -2, -1, 0, 1, 0])
  })
  it('ラリー番号昇順にソートされる', () => {
    const points = buildWorm(rows.slice().reverse(), 'A')
    expect(points.map(p => p.rallyNumber)).toEqual([1, 2, 3, 4, 5, 6, 7, 8])
  })
})

describe('detectRuns / maxRunLength (REQ-018)', () => {
  it('TC-017-01: 3連取 (1-3) と 4連失 (4-7) を検出', () => {
    const points = buildWorm(rows, 'A')
    const runs = detectRuns(points)
    expect(runs).toEqual([
      { startIndex: 0, endIndex: 2, kind: 'won', length: 3 },
      { startIndex: 3, endIndex: 6, kind: 'lost', length: 4 }
    ])
  })
  it('最大連取 3 / 最大連失 4', () => {
    const points = buildWorm(rows, 'A')
    expect(maxRunLength(points, 'won')).toBe(3)
    expect(maxRunLength(points, 'lost')).toBe(4)
  })
  it('末尾まで続くランも検出', () => {
    const tail = buildWorm(rows.slice(0, 7), 'A') // ○○○●●●●
    const runs = detectRuns(tail)
    expect(runs[runs.length - 1]).toMatchObject({ kind: 'lost', length: 4, endIndex: 6 })
  })
})

describe('intervalMarkIndex (REQ-018)', () => {
  it('TC-018-01: リード側が 11 点に到達した最初のラリー位置', () => {
    const long = Array.from({ length: 15 }, (_, i) => rally(i + 1, 'A', i, 0))
    const points = buildWorm(long, 'A')
    // scoreA が 11 になる最初の行 = index 11 (scoreA は開始時スコア 0..14)
    expect(intervalMarkIndex(points)).toBe(11)
  })
  it('11 点未到達は null', () => {
    const points = buildWorm(rows, 'A')
    expect(intervalMarkIndex(points)).toBeNull()
  })
})
