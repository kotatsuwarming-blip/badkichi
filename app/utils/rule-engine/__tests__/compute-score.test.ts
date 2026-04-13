import { describe, expect, it } from 'vitest'
import type { Rally } from '../types'
import { computeScore } from '../compute-score'

describe('computeScore', () => {
  it('空のラリー配列は 0-0 を返す', () => {
    expect(computeScore([])).toEqual({ teamA: 0, teamB: 0 })
  })

  it('TC-006-01: レット1回 - スコアに影響しない', () => {
    const rallies: Rally[] = [
      { rallyNumber: 1, pointWinner: 'A', isLet: false },
      { rallyNumber: 2, pointWinner: null, isLet: true },
      { rallyNumber: 3, pointWinner: 'B', isLet: false }
    ]
    expect(computeScore(rallies)).toEqual({ teamA: 1, teamB: 1 })
  })

  it('TC-006-02: レット連続 - 3回連続でもスコアは 0-0', () => {
    const rallies: Rally[] = [
      { rallyNumber: 1, pointWinner: null, isLet: true },
      { rallyNumber: 2, pointWinner: null, isLet: true },
      { rallyNumber: 3, pointWinner: null, isLet: true }
    ]
    expect(computeScore(rallies)).toEqual({ teamA: 0, teamB: 0 })
  })

  it('TC-006-03: レットと得点の交互', () => {
    const rallies: Rally[] = [
      { rallyNumber: 1, pointWinner: 'A', isLet: false },
      { rallyNumber: 2, pointWinner: null, isLet: true },
      { rallyNumber: 3, pointWinner: 'B', isLet: false },
      { rallyNumber: 4, pointWinner: null, isLet: true },
      { rallyNumber: 5, pointWinner: 'A', isLet: false }
    ]
    expect(computeScore(rallies)).toEqual({ teamA: 2, teamB: 1 })
  })

  it('全得点が片方のチーム', () => {
    const rallies: Rally[] = Array.from({ length: 5 }, (_, i) => ({
      rallyNumber: i + 1,
      pointWinner: 'A' as const,
      isLet: false
    }))
    expect(computeScore(rallies)).toEqual({ teamA: 5, teamB: 0 })
  })
})
