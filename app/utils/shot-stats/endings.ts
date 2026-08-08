/**
 * endings — A 決着分析の純関数（REQ-005/006/007/103, TASK-0010）
 *
 * end_reason（6 値）と最終打者チームから決着を 4 分類する（deriveInOut と同一規則, REQ-406）:
 * - エース獲得: body / floor×最終打者=勝者（in 相当）
 * - 相手ミス獲得: net / not_over / service_fault / floor×最終打者=敗者（out 相当）
 * - 失点側はその鏡像（被エース / 自ミス）
 * - unknown・未注釈・floor×最終打者不明は「不明」別掲（REQ-108 / EDGE-105）
 */
import type {
  DecisiveRankRow, EndingBreakdown, EndingCategoryOrUnknown, EndingEntry,
  LandZoneResult, RallyEndingRow, StatsSubject, ZoneCell
} from '~/types/shot-stats'
import type { Team } from '~/utils/rule-engine/types'
import { deriveOutDirection } from '~/utils/annotation/court-coords'
import { zoneOf } from '~/utils/shot-stats/mirror'

/** RallyEndingRow 上での対象チーム解決（flow.subjectTeamOf と同規則） */
export function endingSubjectTeam(row: RallyEndingRow, subject: StatsSubject): Team | null {
  const teamA = [row.team_a_player1_id, row.team_a_player2_id]
  const teamB = [row.team_b_player1_id, row.team_b_player2_id]
  if (subject.kind === 'player') {
    if (teamA.includes(subject.playerId)) return 'A'
    if (teamB.includes(subject.playerId)) return 'B'
    return null
  }
  if (subject.kind === 'pair') {
    if (teamA.includes(subject.player1Id) && teamA.includes(subject.player2Id)) return 'A'
    if (teamB.includes(subject.player1Id) && teamB.includes(subject.player2Id)) return 'B'
    return null
  }
  return null
}

/** 決着 1 件を対象チーム視点で分類 */
export function classifyEnding(row: RallyEndingRow, subjectTeam: Team): EndingCategoryOrUnknown {
  const won = row.point_winner === subjectTeam
  switch (row.end_reason) {
    case 'body':
      return won ? 'ace' : 'opponent_ace'
    case 'net':
    case 'not_over':
    case 'service_fault':
      // 最終接触者（敗者側）のミス
      return won ? 'opponent_error' : 'own_error'
    case 'floor': {
      if (row.last_hitter_team === null) return 'unknown' // 向き不明（REQ-108）
      const winnerHitLast = row.last_hitter_team === row.point_winner
      if (winnerHitLast) return won ? 'ace' : 'opponent_ace' // in 相当
      return won ? 'opponent_error' : 'own_error' // out 相当
    }
    default:
      return 'unknown' // unknown / 未注釈
  }
}

function emptyBreakdown(): EndingBreakdown {
  return {
    won: { ace: 0, opponent_error: 0 },
    lost: { own_error: 0, opponent_ace: 0 },
    unknown: 0,
    totalRallies: 0,
    annotatedRallies: 0
  }
}

function addTo(b: EndingBreakdown, row: RallyEndingRow, team: Team): void {
  b.totalRallies += 1
  if (row.end_reason !== null) b.annotatedRallies += 1
  const cat = classifyEnding(row, team)
  if (cat === 'unknown') b.unknown += 1
  else if (cat === 'ace' || cat === 'opponent_error') b.won[cat] += 1
  else b.lost[cat] += 1
}

/**
 * 対象ごとの決着内訳（REQ-005）。
 * 選手/ペア選択時はその対象 1 エントリ、all は出場選手ごと。
 */
export function buildEndingEntries(
  rows: RallyEndingRow[],
  subject: StatsSubject,
  nameOf: (id: string) => string
): EndingEntry[] {
  if (subject.kind !== 'all') {
    const breakdown = emptyBreakdown()
    for (const r of rows) {
      const team = endingSubjectTeam(r, subject)
      if (team === null) continue
      addTo(breakdown, r, team)
    }
    const label = subject.kind === 'player'
      ? nameOf(subject.playerId)
      : `${nameOf(subject.player1Id)} / ${nameOf(subject.player2Id)}`
    const subjectId = subject.kind === 'player' ? subject.playerId : `${subject.player1Id}-${subject.player2Id}`
    return [{ subjectId, label, breakdown }]
  }
  const byPlayer = new Map<string, EndingBreakdown>()
  for (const r of rows) {
    const teams: [Team, string[]][] = [
      ['A', [r.team_a_player1_id, r.team_a_player2_id]],
      ['B', [r.team_b_player1_id, r.team_b_player2_id]]
    ]
    for (const [team, ids] of teams) {
      for (const id of ids) {
        let b = byPlayer.get(id)
        if (!b) {
          b = emptyBreakdown()
          byPlayer.set(id, b)
        }
        addTo(b, r, team)
      }
    }
  }
  return [...byPlayer.entries()]
    .map(([subjectId, breakdown]) => ({ subjectId, label: nameOf(subjectId), breakdown }))
    .sort((a, b) => a.label.localeCompare(b.label, 'ja'))
}

/** 決定打球種ランキング（REQ-006。決定打が特定できた決着のみ。null 種別 =「未注釈」, REQ-108） */
export function buildDecisiveRanking(rows: RallyEndingRow[], limit = 8): DecisiveRankRow[] {
  const counts = new Map<string, number>()
  for (const r of rows) {
    // 決定打が存在する決着のみ（body/net/not_over/floor で導出済み。service_fault/unknown は null）
    if (r.end_reason === null || r.end_reason === 'unknown' || r.end_reason === 'service_fault') continue
    if (r.end_reason === 'floor' && r.last_hitter_team === null) continue
    const key = r.decisive_shot_type ?? '__unannotated__'
    counts.set(key, (counts.get(key) ?? 0) + 1)
  }
  return [...counts.entries()]
    .map(([key, count]) => ({ shotType: key === '__unannotated__' ? null : key as DecisiveRankRow['shotType'], count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, limit)
}

/**
 * 決着落下点のゾーン集計（REQ-007）。視点チームへ正規化し 3×3（全長 2×zones 行）へ。
 * 座標は「動画見たまま」= カメラ基準で保存されているため（ユーザ確認 2026-08-08）、
 * **視点チーム = camera_near_team のとき 180° 反転**で選手視点にする。
 * camera_near_team 不明のラリーは向きを決められず unlocated 扱い。
 * land 座標 null のときのみ out_direction を採用（REQ-103, deriveOutDirection と同一規則）。
 * kind: 対象視点の 得点（won）/ 失点（lost）決着で絞る。
 */
export function buildLandZones(
  rows: RallyEndingRow[],
  subject: StatsSubject,
  kind: 'won' | 'lost',
  zones = 3
): LandZoneResult {
  const counts = new Map<string, number>()
  const outFallback = { side: 0, back: 0, both: 0 }
  let unlocated = 0
  for (const r of rows) {
    const team = subject.kind === 'all' ? 'A' : endingSubjectTeam(r, subject)
    if (team === null) continue
    const won = r.point_winner === team
    if ((kind === 'won') !== won) continue
    if (r.end_reason !== 'floor') continue // 落下点は floor 決着のみ（body/net 等は落下しない）
    if (r.land_x !== null && r.land_y !== null) {
      if (r.camera_near_team === null) {
        unlocated += 1 // 向き不明（camera_near_team なし）
        continue
      }
      // 選手視点変換（2026-08-08 修正 #3）: 対象 = カメラ手前 → y のみ反転（映像がすでに選手視点、
      // 前後の基準合わせのみ）/ 対象 = カメラ奥 → x のみ反転（180° 回して見るため左右が入れ替わる）
      const nearSide = r.camera_near_team === team
      const p = nearSide
        ? { x: r.land_x, y: 1 - r.land_y }
        : { x: 1 - r.land_x, y: r.land_y }
      const dir = deriveOutDirection(p)
      if (dir !== null) {
        outFallback[dir] += 1
        continue
      }
      const { row, col } = zoneOf(p, zones)
      const key = `${row}:${col}`
      counts.set(key, (counts.get(key) ?? 0) + 1)
    } else if (r.out_direction !== null) {
      outFallback[r.out_direction] += 1
    } else {
      unlocated += 1
    }
  }
  const max = Math.max(1, ...counts.values())
  const cells: ZoneCell[] = [...counts.entries()].map(([key, count]) => {
    const [row, col] = key.split(':').map(Number)
    return { row: row!, col: col!, count, ratio: count / max }
  })
  return { cells, outFallback, unlocated }
}
