/**
 * court-coords — コート図の描画座標⇔正規化座標の変換と out 細分導出の純関数。
 *
 * 関連: TASK-0003 / REQ-005 / REQ-014 / EDGE-002
 * 方針: 保存は絶対正規化座標 (x: 0-1 コート幅 / y: 0-1 全長、y=0 = チームA側
 *       バックバウンダリー)。ライン外は範囲外値 (<0 / >1) をそのまま保存し clamp しない
 *       (「生を保存、解釈は後段」)。court はコート図のライン内側矩形で、描画向き
 *       (どちらの端を y=0 に描くか) はコンポーネント側の責務。
 */
import type { CourtPoint, CourtRect, OutDirection } from '~/types/shot-annotation'

/** 描画座標 → 正規化座標。ライン外は範囲外値で返る（clamp しない、REQ-014） */
export function toNormalized(px: number, py: number, court: CourtRect): CourtPoint {
  return {
    x: (px - court.left) / court.width,
    y: (py - court.top) / court.height
  }
}

/** 正規化座標 → 描画座標（マーカー再描画用）。toNormalized の逆写像 */
export function fromNormalized(p: CourtPoint, court: CourtRect): { px: number, py: number } {
  return {
    px: court.left + p.x * court.width,
    py: court.top + p.y * court.height
  }
}

/**
 * 落下点から out の細分を導出する（REQ-005）。
 * side = x が範囲外 / back = y が範囲外 / both = 両方（コーナー奥）。
 * コート内（ライン上含む）は null — end_reason='out' との組み合わせでは
 * 矛盾のソフト警告の契機になる（EDGE-002）。
 */
export function deriveOutDirection(land: CourtPoint): OutDirection | null {
  const sideOut = land.x < 0 || land.x > 1
  const backOut = land.y < 0 || land.y > 1
  if (sideOut && backOut) return 'both'
  if (sideOut) return 'side'
  if (backOut) return 'back'
  return null
}
