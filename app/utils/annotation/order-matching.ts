/**
 * order-matching — 種別パスの「順番マッチング」の純関数。
 *
 * 関連: TASK-0003 / REQ-007 / EDGE-003
 * 方針: キー入力はタイミングではなく順番で対応づける（ラリー内 k 回目の入力 =
 *       k 番目のショット）。押下時刻のクロックスキューに依存しない。
 *       超過入力は null（呼び出し側で無視 + 警告表示、ラリー単位でやり直し可能）。
 */

/**
 * ラリー内 inputIndex（0-based の入力順）を対象ショットの 0-based index へ対応づける。
 * ショット数を超えた入力・負のインデックスは null。
 */
export function matchKeyToShot(rallyShotCount: number, inputIndex: number): number | null {
  if (inputIndex < 0 || inputIndex >= rallyShotCount) return null
  return inputIndex
}
