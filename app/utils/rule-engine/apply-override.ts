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
  const receiverPosition = state.serverPosition === 'right' ? 'left' : 'right' as const
  const receiver = positions[receivingTeamKey][receiverPosition]

  return {
    ...state,
    positions,
    server,
    receiver
  }
}
