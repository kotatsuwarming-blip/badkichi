/**
 * derive — 決着注釈からの導出（in/out・勝者・決定打・整合チェック）の純関数。
 *
 * 関連: TASK-0003 / REQ-005 / REQ-006 / REQ-102 / EDGE-005 / ADR-017 §7 (2026-08-02 改訂)
 * 方針: 全ラケット接触がショット行として記録される前提（ADR-017 §7 運用ルール）のため、
 *       最終接触者は打順の偶奇で決まる。in/out は動画から判定できないため入力させず、
 *       「floor（越えて床へ）+ 最終接触者 + point_winner（ライブ記録の実測値）」から導出する。
 */
import type { Team } from '~/utils/rule-engine/types'
import type { EndReason } from '~/types/shot-annotation'

function opponentOf(team: Team): Team {
  return team === 'A' ? 'B' : 'A'
}

/**
 * floor（ネットを越えて床に落ちた）の in/out を導出する（2026-08-02 の中核導出）。
 * 最終接触者 = 勝者 → in（決めた）/ 最終接触者 = 敗者 → out（外した）。
 * point_winner 未確定は導出不能 (null)。
 */
export function deriveInOut(lastHitterTeam: Team, pointWinner: Team | null): 'in' | 'out' | null {
  if (pointWinner === null) return null
  return lastHitterTeam === pointWinner ? 'in' : 'out'
}

/**
 * (最終接触者のチーム, end_reason) → 勝者チーム。
 * body = 打者の得点、net / not_over = 打者の失点、service_fault = サーバーの失点。
 * floor は in/out どちらもあり得るため end_reason からは導出不能 (null) —
 * 逆に point_winner から in/out を導出する側になる（deriveInOut）。
 */
export function deriveWinner(lastHitterTeam: Team, endReason: EndReason): Team | null {
  switch (endReason) {
    case 'body':
      return lastHitterTeam
    case 'net':
    case 'not_over':
    case 'service_fault':
      return opponentOf(lastHitterTeam)
    case 'floor':
    case 'unknown':
      return null
  }
}

/**
 * 決定打 = 勝者チームの最後のショット（REQ-006）。0-based index を返す。
 * floor は勝敗で分岐するため winnerHitLast（最終接触者 = 勝者か）が必要。
 * 1打で終わったミス・service_fault・unknown・導出不能は決定打なし (null)。
 */
export function decisiveShotIndex(
  shotCount: number,
  endReason: EndReason,
  winnerHitLast: boolean | null = null
): number | null {
  if (shotCount <= 0) return null
  switch (endReason) {
    case 'body':
      return shotCount - 1
    case 'net':
    case 'not_over': {
      const idx = shotCount - 2
      return idx >= 0 ? idx : null
    }
    case 'floor': {
      if (winnerHitLast === null) return null
      const idx = winnerHitLast ? shotCount - 1 : shotCount - 2
      return idx >= 0 ? idx : null
    }
    case 'service_fault':
    case 'unknown':
      return null
  }
}

/**
 * 導出勝者と記録済み point_winner の整合チェック（REQ-102）。
 * false = 矛盾（入力ミスの可能性をソフト警告。保存は拒否しない）。
 * 未確定ラリー（EDGE-005）・point_winner なし・導出不能（floor / unknown）は true（スキップ）。
 */
export function checkConsistency(
  lastHitterTeam: Team,
  endReason: EndReason,
  pointWinner: Team | null,
  isPointConfirmed: boolean
): boolean {
  if (!isPointConfirmed || pointWinner === null) return true
  const derived = deriveWinner(lastHitterTeam, endReason)
  if (derived === null) return true
  return derived === pointWinner
}
