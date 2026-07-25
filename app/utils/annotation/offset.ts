/**
 * offset — タイムスタンプ補正（校正平均）と非対称ループ窓の純関数。
 *
 * 関連: TASK-0003 / REQ-004 / REQ-010 / REQ-101 / EDGE-004
 * 方針: 「打った」押下は実打より遅れる（反応遅延 0.2〜0.5s）ため、窓は用途で非対称にする:
 *       決着を見るループ = 後ろ長め（決着イベントは最終打の後に起きる）、
 *       打球瞬間を探すループ = 前長め（実打は押下より過去にある）。ヒアリング2026-07-19。
 */
import type { LoopPurpose, LoopWindow } from '~/types/shot-annotation'

/** 用途別の非対称窓 (ms)。初期値は design-interview D6（試用後に調整） */
const WINDOWS: Record<LoopPurpose, { before: number, after: number }> = {
  rallyEnd: { before: 1000, after: 2500 },
  hitSearch: { before: 1200, after: 300 }
}

/**
 * 校正サンプル（押下時刻 → 真の打球時刻の差分 ms、負値 = 実打は押下より過去）の平均。
 * 0.5ms 丸めは away-from-zero（-100.5 → -101）で固定し、環境差を避ける。
 * サンプル 0 件は補正なし (0)。
 */
export function averageOffset(samplesMs: number[]): number {
  if (samplesMs.length === 0) return 0
  const mean = samplesMs.reduce((sum, v) => sum + v, 0) / samplesMs.length
  return Math.sign(mean) * Math.round(Math.abs(mean))
}

/**
 * アンカー時刻（補正後の打球時刻 or 最終ショット押下時刻）の周囲に用途別の
 * 非対称ループ窓を張る。動画開始前は 0 に clamp（EDGE-004）。
 */
export function loopWindowFor(purpose: LoopPurpose, anchorMs: number): LoopWindow {
  const w = WINDOWS[purpose]
  return {
    fromMs: Math.max(0, anchorMs - w.before),
    toMs: anchorMs + w.after
  }
}
