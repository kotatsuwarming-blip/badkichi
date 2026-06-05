import { describe, expect, it } from 'vitest'
import { mapGameStateToRallyDenorm } from '~/utils/match-recording/map-game-state'
import { createInitialState } from '~/utils/rule-engine/create-initial-state'
import type { SetConfig, SetPlayerPosition } from '~/utils/rule-engine/types'

const positions: SetPlayerPosition[] = [
  { playerId: 'A1', team: 'A', position: 'left' },
  { playerId: 'A2', team: 'A', position: 'right' },
  { playerId: 'B1', team: 'B', position: 'left' },
  { playerId: 'B2', team: 'B', position: 'right' }
]

const config: SetConfig = {
  targetPoints: 21,
  enableDeuce: true,
  deucePointCap: 30,
  firstServingTeam: 'A'
}

describe('mapGameStateToRallyDenorm', () => {
  it('GameState の server/receiver/位置を rallies の denormalize 列へ写像する', () => {
    const state = createInitialState(config, positions)
    const denorm = mapGameStateToRallyDenorm(state, 'A')

    expect(denorm.servingTeam).toBe(state.servingTeam)
    expect(denorm.serverPosition).toBe(state.serverPosition)
    expect(denorm.serverPlayerId).toBe(state.server)
    expect(denorm.receiverPlayerId).toBe(state.receiver)
    expect(denorm.cameraNearTeam).toBe('A')
  })

  it('cameraNearTeam=null（カメラ向き不明）を許容する', () => {
    const state = createInitialState(config, positions)
    const denorm = mapGameStateToRallyDenorm(state, null)

    expect(denorm.cameraNearTeam).toBeNull()
  })
})
