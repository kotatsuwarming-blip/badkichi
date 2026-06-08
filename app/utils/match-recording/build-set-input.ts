/**
 * buildSetInput — セット設定フォームの入力から SetSetupInput + SetPositionInput[] を組み立てる純関数。
 *
 * 関連: TASK-0016 / REQ-002 / REQ-003 / EDGE-002
 * 方針: 各チームの「ファースト」(偶数側=最初にサーブ/レシーブする選手) を1人選ぶと残りが自動的に
 *       もう一方になるため、(team,position) スロット重複が構造的に発生しない (EDGE-002 を UI 段階で防ぐ)。
 *       ファースト = 右コート (スコア0=偶数→右、rule-engine createInitialState)。4 選手ロスターは team A×2 / B×2 固定。
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
  aFirstPlayerId: PlayerId // ファースト = 偶数側 = 右コート
  bFirstPlayerId: PlayerId
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

  // ファースト = 右コート (偶数側)。残りのもう一方が左コート。
  const aSecond = aPlayers.find(p => p.playerId !== params.aFirstPlayerId)
  const bSecond = bPlayers.find(p => p.playerId !== params.bFirstPlayerId)
  if (!aSecond || !bSecond) {
    throw new Error('first player must be one of the team players')
  }

  const positions: SetPositionInput[] = [
    { playerId: params.aFirstPlayerId, team: 'A', position: 'right' },
    { playerId: aSecond.playerId, team: 'A', position: 'left' },
    { playerId: params.bFirstPlayerId, team: 'B', position: 'right' },
    { playerId: bSecond.playerId, team: 'B', position: 'left' }
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
