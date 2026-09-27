/**
 * momentum — L セット推移（スコアワーム）の純関数（TASK-0008 / REQ-017/018）
 *
 * 1 セット分の確定ラリーを時系列に並べ、視点チームが取ったら +1 / 取られたら −1 の
 * 階段折れ線を作る。3 連続以上の連取/連失区間と 11 点インターバル位置も導出する。
 */
import type { FlowRally, Run, WormPoint } from '~/types/shot-stats'
import type { Team } from '~/utils/rule-engine/types'

/** 1 セット分のラリー（rallyNumber 昇順）からワーム系列を構築 */
export function buildWorm(rows: FlowRally[], perspective: Team): WormPoint[] {
  const sorted = rows.slice().sort((a, b) => a.rallyNumber - b.rallyNumber)
  const points: WormPoint[] = []
  let diff = 0
  for (const r of sorted) {
    diff += r.pointWinner === perspective ? 1 : -1
    points.push({
      rallyId: r.rallyId,
      rallyNumber: r.rallyNumber,
      diff,
      scoreA: r.scoreA,
      scoreB: r.scoreB,
      videoStartMs: r.videoStartMs
    })
  }
  return points
}

/** 3 連続以上（既定）の連取/連失区間を検出（REQ-018） */
export function detectRuns(points: WormPoint[], minLength = 3): Run[] {
  const runs: Run[] = []
  let start = 0
  let prevKind: 'won' | 'lost' | null = null
  let prevDiff = 0
  for (let i = 0; i < points.length; i++) {
    const kind: 'won' | 'lost' = points[i]!.diff > prevDiff ? 'won' : 'lost'
    prevDiff = points[i]!.diff
    if (kind !== prevKind) {
      if (prevKind !== null && i - start >= minLength) {
        runs.push({ startIndex: start, endIndex: i - 1, kind: prevKind, length: i - start })
      }
      start = i
      prevKind = kind
    }
  }
  if (prevKind !== null && points.length - start >= minLength) {
    runs.push({ startIndex: start, endIndex: points.length - 1, kind: prevKind, length: points.length - start })
  }
  return runs
}

/** 最大連取/連失の長さ（注記用） */
export function maxRunLength(points: WormPoint[], kind: 'won' | 'lost'): number {
  let max = 0
  let cur = 0
  let prevDiff = 0
  for (const p of points) {
    const k: 'won' | 'lost' = p.diff > prevDiff ? 'won' : 'lost'
    prevDiff = p.diff
    cur = k === kind ? cur + 1 : 0
    if (cur > max) max = cur
  }
  return max
}

/** 11 点インターバル明けの最初のラリー index（リード側が 11 点に到達した後）。無ければ null */
export function intervalMarkIndex(points: WormPoint[]): number | null {
  const idx = points.findIndex(p => Math.max(p.scoreA, p.scoreB) >= 11)
  return idx >= 0 ? idx : null
}
