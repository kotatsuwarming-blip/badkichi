import type { GameState, RallyResult } from './types'

export function applyRally(state: GameState, rally: RallyResult): GameState {
  if (rally.isLet) {
    return state
  }

  const pointWinner = rally.pointWinner!
  const prevServingTeam = state.servingTeam

  // スコア更新
  const score = {
    teamA: state.score.teamA + (pointWinner === 'A' ? 1 : 0),
    teamB: state.score.teamB + (pointWinner === 'B' ? 1 : 0)
  }

  // サーブ権は得点チームへ
  const servingTeam = pointWinner

  // 位置更新: サーブ側が得点した場合のみサーブ側の左右入替
  const positions = { ...state.positions }
  if (pointWinner === prevServingTeam) {
    const team = prevServingTeam === 'A' ? 'teamA' : 'teamB'
    positions[team] = {
      left: state.positions[team].right,
      right: state.positions[team].left
    }
  }

  // サーバー/レシーバーの特定
  const servingTeamKey = servingTeam === 'A' ? 'teamA' : 'teamB' as const
  const receivingTeamKey = servingTeam === 'A' ? 'teamB' : 'teamA' as const
  const servingScore = servingTeam === 'A' ? score.teamA : score.teamB
  const serverPosition = servingScore % 2 === 0 ? 'right' : 'left' as const
  const server = positions[servingTeamKey][serverPosition]
  const receiverPosition = serverPosition === 'right' ? 'left' : 'right' as const
  const receiver = positions[receivingTeamKey][receiverPosition]

  return {
    score,
    servingTeam,
    server,
    receiver,
    serverPosition,
    positions
  }
}
