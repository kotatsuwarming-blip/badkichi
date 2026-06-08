import type { GameState, Team } from './types'

export function applyOverride(state: GameState, team: Team): GameState {
  const teamKey = team === 'A' ? 'teamA' : 'teamB'

  const positions = {
    ...state.positions,
    [teamKey]: {
      left: state.positions[teamKey].right,
      right: state.positions[teamKey].left
    }
  }

  const servingTeamKey = state.servingTeam === 'A' ? 'teamA' : 'teamB' as const
  const receivingTeamKey = state.servingTeam === 'A' ? 'teamB' : 'teamA' as const
  const server = positions[servingTeamKey][state.serverPosition]
  // レシーバーはサーバーの対角＝相手チームの同じサービスコート（同じ position ラベル）
  const receiver = positions[receivingTeamKey][state.serverPosition]

  return {
    ...state,
    positions,
    server,
    receiver
  }
}
