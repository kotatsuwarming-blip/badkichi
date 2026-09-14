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

  // シングルス (チーム 1 人): 片側スロットしか与えられないので同一選手で両スロットを埋める。
  // 以降の applyRally / applyOverride の左右入替は同一選手のため無害で、serverPosition の
  // 偶奇規則 (右=偶数/左=奇数) がそのままシングルスのサービスコート規則になる (NFR-201)。
  fillSingleSlot(teamA)
  fillSingleSlot(teamB)

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

function fillSingleSlot(team: { left: string, right: string }): void {
  if (!team.left && team.right) team.left = team.right
  if (!team.right && team.left) team.right = team.left
}
