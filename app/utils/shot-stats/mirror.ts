/**
 * mirror — ゾーン変換の純関数（EDGE-101, TASK-0010）
 *
 * 選手視点への向き正規化は camera_near_team ベースで各消費側が行う
 * （REQ-105 改訂 2026-08-08: カメラ手前打者 = y のみ反転 / カメラ奥打者 = x のみ反転）。
 * ゾーンは全長を 2×zones 行 × zones 列に分割し、範囲外はクランプ算入（EDGE-101）。
 */
import type { CourtPoint } from '~/types/shot-annotation'

/** ゾーン化（クランプ算入, EDGE-101）。row: 0=手前バック 〜 zones*2-1=相手コート奥 / col: 0=左 */
export function zoneOf(p: CourtPoint, zones = 3): { row: number, col: number } {
  const cx = Math.min(1, Math.max(0, p.x))
  const cy = Math.min(1, Math.max(0, p.y))
  return {
    row: Math.min(zones * 2 - 1, Math.floor(cy * zones * 2)),
    col: Math.min(zones - 1, Math.floor(cx * zones))
  }
}
