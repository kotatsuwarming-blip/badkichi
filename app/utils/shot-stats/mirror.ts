/**
 * mirror — 選手視点固定ミラーとゾーン変換の純関数（REQ-105 / EDGE-101, TASK-0010）
 *
 * 座標は絶対系（x: 0-1 コート幅 / y: 0-1 全長, y=0 = チーム A 側バックバウンダリー）で
 * 保存されている。視点チームが B のときは x→1−x, y→1−y でミラーする。
 * ゾーンは全長を 2×zones 行 × zones 列に分割し、範囲外はクランプ算入（EDGE-101）。
 */
import type { CourtPoint } from '~/types/shot-annotation'
import type { Team } from '~/utils/rule-engine/types'

/** 視点チームに合わせて座標をミラー（A はそのまま / B は点対称） */
export function mirrorForTeam(p: CourtPoint, perspective: Team): CourtPoint {
  if (perspective === 'A') return p
  return { x: 1 - p.x, y: 1 - p.y }
}

/** ゾーン化（クランプ算入, EDGE-101）。row: 0=手前バック 〜 zones*2-1=相手コート奥 / col: 0=左 */
export function zoneOf(p: CourtPoint, zones = 3): { row: number, col: number } {
  const cx = Math.min(1, Math.max(0, p.x))
  const cy = Math.min(1, Math.max(0, p.y))
  return {
    row: Math.min(zones * 2 - 1, Math.floor(cy * zones * 2)),
    col: Math.min(zones - 1, Math.floor(cx * zones))
  }
}
