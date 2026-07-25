/**
 * derive — 決着注釈からの導出（勝者・決定打・整合チェック）の純関数。
 *
 * 関連: TASK-0003 / REQ-006 / REQ-102 / EDGE-005 / ADR-017 §7
 * 方針: 全ラケット接触がショット行として記録される前提（ADR-017 §7 運用ルール）のため、
 *       「最終接触者 + end_reason」だけで勝敗の向きが決まる。point_winner はライブ記録の
 *       実測値なので上書きせず、矛盾検出（ソフト警告）にのみ使う。
 */
import type { Team } from '~/utils/rule-engine/types'
import type { EndReason } from '~/types/shot-annotation'

function opponentOf(team: Team): Team {
  return team === 'A' ? 'B' : 'A'
}

/**
 * (最終接触者のチーム, end_reason) → 勝者チーム（ADR-017 §7 の表）。
 * in / body = 打者の得点、out / net / not_over = 打者の失点、
 * service_fault = サーバー（最終接触者）の失点、unknown = 導出不能 (null)。
 */
export function deriveWinner(lastHitterTeam: Team, endReason: EndReason): Team | null {
  switch (endReason) {
    case 'in':
    case 'body':
      return lastHitterTeam
    case 'out':
    case 'net':
    case 'not_over':
    case 'service_fault':
      return opponentOf(lastHitterTeam)
    case 'unknown':
      return null
  }
}

/**
 * 決定打 = 勝者チームの最後のショット（REQ-006）。0-based index を返す。
 * in / body: 最終ショット。out / net / not_over: その1つ前（相手のミスを強いたショット）。
 * 1打で終わったミス・service_fault・unknown は決定打なし (null)。
 */
export function decisiveShotIndex(shotCount: number, endReason: EndReason): number | null {
  if (shotCount <= 0) return null
  switch (endReason) {
    case 'in':
    case 'body':
      return shotCount - 1
    case 'out':
    case 'net':
    case 'not_over': {
      const idx = shotCount - 2
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
 * 未確定ラリー（EDGE-005）・point_winner なし・導出不能は true（チェックスキップ）。
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
