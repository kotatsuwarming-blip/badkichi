/**
 * flow — ラリー展開タブの行マージと視点解決の純関数（TASK-0005）
 *
 * stats_rallies（スコア・動画）と stats_rally_tempo（テンポ素材・チーム 4 選手）を
 * rally_id でマージする。tempo 側は確定ラリーのみ返すため、マージ結果も
 * 確定ラリーのみになる（レット・未確定の除外 = REQ-101）。
 */
import type { RallyRow } from '~/types/stats-dashboard'
import type { FlowRally, RallyTempoRow, StatsSubject } from '~/types/shot-stats'
import type { Team } from '~/utils/rule-engine/types'

/** stats_rallies × stats_rally_tempo を確定ラリーのみへマージ */
export function mergeFlowRallies(rallies: RallyRow[], tempo: RallyTempoRow[]): FlowRally[] {
  const byId = new Map(rallies.map(r => [r.rally_id, r]))
  const merged: FlowRally[] = []
  for (const t of tempo) {
    const r = byId.get(t.rally_id)
    if (!r || r.point_winner === null) continue
    merged.push({
      rallyId: t.rally_id,
      matchId: t.match_id,
      setNumber: t.set_number,
      rallyNumber: t.rally_number,
      servingTeam: t.serving_team,
      pointWinner: r.point_winner,
      scoreA: r.score_a,
      scoreB: r.score_b,
      videoStartMs: r.video_start_timestamp_ms,
      shotCount: t.shot_count,
      timedCount: t.timed_count,
      durationMs: t.duration_ms,
      last3Ms: t.last3_avg_interval_ms,
      last4Ms: t.last4_avg_interval_ms,
      isPrecise: t.is_precise,
      videoSourceType: r.video_source_type,
      videoSourceUrl: r.video_source_url,
      teamA: [t.team_a_player1_id, t.team_a_player2_id],
      teamB: [t.team_b_player1_id, t.team_b_player2_id]
    })
  }
  merged.sort((a, b) =>
    a.matchId === b.matchId
      ? (a.setNumber - b.setNumber) || (a.rallyNumber - b.rallyNumber)
      : a.matchId.localeCompare(b.matchId)
  )
  return merged
}

/**
 * 対象（選手/ペア）が当該ラリーでどちらのチームだったかを解決する。
 * 選手: 所属チーム / ペア: 両名が同じチームのときのみ / all・不在: null
 */
export function subjectTeamOf(rally: FlowRally, subject: StatsSubject): Team | null {
  if (subject.kind === 'player') {
    if (rally.teamA.includes(subject.playerId)) return 'A'
    if (rally.teamB.includes(subject.playerId)) return 'B'
    return null
  }
  if (subject.kind === 'pair') {
    const inA = rally.teamA.includes(subject.player1Id) && rally.teamA.includes(subject.player2Id)
    if (inA) return 'A'
    const inB = rally.teamB.includes(subject.player1Id) && rally.teamB.includes(subject.player2Id)
    if (inB) return 'B'
    return null
  }
  return null
}
