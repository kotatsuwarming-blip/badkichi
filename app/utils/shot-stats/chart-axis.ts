/**
 * chart-axis — コンボチャート（本数+得点率）の軸目盛り計算
 *
 * 2軸チャートはグリッド線が軸ごとに引かれて横線が倍増するため、
 * 両軸を同じ分割数（既定5）に固定して1組に重ねる。%軸は 0-100 の 20 刻み、
 * 本数軸はここで計算したキリの良い整数間隔（1/2/5×10^k）を使う。
 */

/** 本数軸の目盛り（最大値と間隔）。maxCount を splits 分割で覆う最小のナイス間隔 */
export function countAxisScale(maxCount: number, splits = 5): { max: number, interval: number } {
  if (maxCount <= 0) return { max: splits, interval: 1 }
  const raw = maxCount / splits
  const pow = 10 ** Math.floor(Math.log10(raw))
  for (const m of [1, 2, 5, 10]) {
    const interval = Math.max(1, Math.round(m * pow))
    if (interval >= raw) return { max: interval * splits, interval }
  }
  // raw <= pow*10 のため到達しない（型のためのフォールバック）
  const interval = Math.max(1, Math.ceil(raw))
  return { max: interval * splits, interval }
}
