import { describe, expect, it } from 'vitest'
import { createInitialState } from '~/utils/rule-engine/create-initial-state'
import type { SetConfig, SetPlayerPosition } from '~/utils/rule-engine/types'

const positions: SetPlayerPosition[] = [
  { playerId: 'A1', team: 'A', position: 'left' },
  { playerId: 'A2', team: 'A', position: 'right' },
  { playerId: 'B1', team: 'B', position: 'left' },
  { playerId: 'B2', team: 'B', position: 'right' }
]

function makeConfig(firstServingTeam: 'A' | 'B'): SetConfig {
  return {
    targetPoints: 21,
    enableDeuce: true,
    deucePointCap: 30,
    firstServingTeam
  }
}

describe('createInitialState', () => {
  it('チームAサーブ権: スコア0-0、右コートA2がサーバー、対角B1がレシーバー', () => {
    const state = createInitialState(makeConfig('A'), positions)

    expect(state.score).toEqual({ teamA: 0, teamB: 0 })
    expect(state.servingTeam).toBe('A')
    expect(state.server).toBe('A2')
    expect(state.receiver).toBe('B1')
    expect(state.serverPosition).toBe('right')
    expect(state.positions).toEqual({
      teamA: { left: 'A1', right: 'A2' },
      teamB: { left: 'B1', right: 'B2' }
    })
  })

  it('チームBサーブ権: 右コートB2がサーバー、対角A1がレシーバー', () => {
    const state = createInitialState(makeConfig('B'), positions)

    expect(state.servingTeam).toBe('B')
    expect(state.server).toBe('B2')
    expect(state.receiver).toBe('A1')
    expect(state.serverPosition).toBe('right')
  })
})
