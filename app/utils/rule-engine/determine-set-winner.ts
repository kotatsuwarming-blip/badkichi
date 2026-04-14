import type { Score, SetConfig, Team } from './types'

export function determineSetWinner(score: Score, config: SetConfig): Team | null {
  const { teamA: scoreA, teamB: scoreB } = score
  const { targetPoints, enableDeuce, deucePointCap } = config

  if (!enableDeuce) {
    if (scoreA >= targetPoints) return 'A'
    if (scoreB >= targetPoints) return 'B'
    return null
  }

  // デュース有効時: キャップによるサドンデス勝利
  if (scoreA >= deucePointCap) return 'A'
  if (scoreB >= deucePointCap) return 'B'

  // 通常勝利（targetPoints 以上 & 2点差以上）
  if (scoreA >= targetPoints && scoreA - scoreB >= 2) return 'A'
  if (scoreB >= targetPoints && scoreB - scoreA >= 2) return 'B'

  return null
}
