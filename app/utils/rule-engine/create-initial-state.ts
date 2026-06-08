import type { GameState, SetConfig, SetPlayerPosition } from './types'

export function createInitialState(
  config: SetConfig,
  initialPositions: SetPlayerPosition[]
): GameState {
  const teamA = { left: '', right: '' }
  const teamB = { left: '', right: '' }

  for (const p of initialPositions) {
    if (p.team === 'A') {
      teamA[p.position] = p.playerId
    } else {
      teamB[p.position] = p.playerId
    }
  }

  const servingTeam = config.firstServingTeam
  // スコア0（偶数）→ サーバーは右コート
  const serverPosition = 'right' as const
  const server = servingTeam === 'A' ? teamA.right : teamB.right
  // レシーバーはサーバーの対角＝相手チームの同じサービスコート（偶数時は両者とも右コート）
  const receiver = servingTeam === 'A' ? teamB.right : teamA.right

  return {
    score: { teamA: 0, teamB: 0 },
    servingTeam,
    server,
    receiver,
    serverPosition,
    positions: { teamA, teamB }
  }
}
