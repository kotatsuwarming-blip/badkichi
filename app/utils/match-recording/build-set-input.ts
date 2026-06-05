/**
 * buildSetInput — セット設定フォームの入力から SetSetupInput + SetPositionInput[] を組み立てる純関数。
 *
 * 関連: TASK-0016 / REQ-002 / REQ-003 / EDGE-002
 * 方針: 各チームの「左の選手」を1人選ぶと残りが自動的に右になるため、(team,position) スロット重複が
 *       構造的に発生しない (EDGE-002 を UI 段階で防ぐ)。4 選手ロスターは team A×2 / B×2 固定。
 */
import type { PlayerId, Team } from '~/utils/rule-engine/types'
import type { SetPositionInput, SetSetupInput } from '~/types/match-recording'

interface RosterEntry { playerId: PlayerId, name: string, team: Team }

export interface BuildSetParams {
  setNumber: number
  targetPoints: number
  enableDeuce: boolean
  deucePointCap: number
  firstServingTeam: Team
  cameraNearTeamAtStart: Team | null
  aLeftPlayerId: PlayerId
  bLeftPlayerId: PlayerId
}

export interface BuildSetResult {
  setup: SetSetupInput
  positions: SetPositionInput[]
}

export function buildSetInput(roster: RosterEntry[], params: BuildSetParams): BuildSetResult {
  const aPlayers = roster.filter(r => r.team === 'A')
  const bPlayers = roster.filter(r => r.team === 'B')
  if (aPlayers.length !== 2 || bPlayers.length !== 2) {
    throw new Error('roster must contain exactly 2 players per team (doubles)')
  }

  const aRight = aPlayers.find(p => p.playerId !== params.aLeftPlayerId)
  const bRight = bPlayers.find(p => p.playerId !== params.bLeftPlayerId)
  if (!aRight || !bRight) {
    throw new Error('left player must be one of the team players')
  }

  const positions: SetPositionInput[] = [
    { playerId: params.aLeftPlayerId, team: 'A', position: 'left' },
    { playerId: aRight.playerId, team: 'A', position: 'right' },
    { playerId: params.bLeftPlayerId, team: 'B', position: 'left' },
    { playerId: bRight.playerId, team: 'B', position: 'right' }
  ]

  const setup: SetSetupInput = {
    setNumber: params.setNumber,
    targetPoints: params.targetPoints,
    enableDeuce: params.enableDeuce,
    deucePointCap: params.deucePointCap,
    firstServingTeam: params.firstServingTeam,
    cameraNearTeamAtStart: params.cameraNearTeamAtStart
  }

  return { setup, positions }
}
