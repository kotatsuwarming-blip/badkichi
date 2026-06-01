import { describe, expect, it } from 'vitest'
import { determineSetWinner } from '~/utils/rule-engine/determine-set-winner'
import type { Score, SetConfig } from '~/utils/rule-engine/types'

function makeConfig(overrides: Partial<SetConfig> = {}): SetConfig {
  return {
    targetPoints: 21,
    enableDeuce: true,
    deucePointCap: 30,
    firstServingTeam: 'A',
    ...overrides
  }
}

function makeScore(teamA: number, teamB: number): Score {
  return { teamA, teamB }
}

describe('determineSetWinner', () => {
  describe('デュース有効時', () => {
    const config = makeConfig()

    it('キャップ到達で勝利 30-29 → A', () => {
      expect(determineSetWinner(makeScore(30, 29), config)).toBe('A')
    })

    it('2点差で勝利 21-19 → A', () => {
      expect(determineSetWinner(makeScore(21, 19), config)).toBe('A')
    })

    it('1点差は未決着 22-21 → null', () => {
      expect(determineSetWinner(makeScore(22, 21), config)).toBeNull()
    })

    it('target未到達は未決着 20-18 → null', () => {
      expect(determineSetWinner(makeScore(20, 18), config)).toBeNull()
    })
  })

  describe('デュース無効時', () => {
    const config = makeConfig({ enableDeuce: false })

    it('target到達で即勝利 21-20 → A', () => {
      expect(determineSetWinner(makeScore(21, 20), config)).toBe('A')
    })

    it('target未到達は未決着 20-20 → null', () => {
      expect(determineSetWinner(makeScore(20, 20), config)).toBeNull()
    })
  })
})
