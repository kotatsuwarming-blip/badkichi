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
  // レシーバーは相手チームの対角（右からサーブ → 左で受ける）
  const receiver = servingTeam === 'A' ? teamB.left : teamA.left

  return {
    score: { teamA: 0, teamB: 0 },
    servingTeam,
    server,
    receiver,
    serverPosition,
    positions: { teamA, teamB }
  }
}
