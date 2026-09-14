/**
 * buildSetInput — セット設定フォームの入力から SetSetupInput + SetPositionInput[] を組み立てる純関数。
 *
 * 関連: TASK-0016 / REQ-002 / REQ-003 / EDGE-002
 * 方針: 各チームの「ファースト」(偶数側=最初にサーブ/レシーブする選手) を1人選ぶと残りが自動的に
 *       もう一方になるため、(team,position) スロット重複が構造的に発生しない (EDGE-002 を UI 段階で防ぐ)。
 *       ファースト = 右コート (スコア0=偶数→右、rule-engine createInitialState)。
 *       ロスターは doubles = team A×2 / B×2、singles = A×1 / B×1。singles は right の 1 行だけを出し、
 *       left は rule-engine createInitialState が同一選手で埋める (set_player_positions の UNIQUE(set_id, player_id) 対応)。
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
  if (aPlayers.length !== bPlayers.length || (aPlayers.length !== 1 && aPlayers.length !== 2)) {
    throw new Error('roster must contain 1 (singles) or 2 (doubles) players per team')
  }

  const positions: SetPositionInput[] = [
    ...teamPositions('A', aPlayers, params.aFirstPlayerId),
    ...teamPositions('B', bPlayers, params.bFirstPlayerId)
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

/** ファースト = 右コート (偶数側)。doubles は残りのもう一方が左コート、singles は右 1 行のみ。 */
function teamPositions(team: Team, players: RosterEntry[], firstPlayerId: PlayerId): SetPositionInput[] {
  const first = players.find(p => p.playerId === firstPlayerId)
  if (!first) throw new Error('first player must be one of the team players')
  const rows: SetPositionInput[] = [{ playerId: first.playerId, team, position: 'right' }]
  const second = players.find(p => p.playerId !== firstPlayerId)
  if (second) rows.push({ playerId: second.playerId, team, position: 'left' })
  return rows
}
