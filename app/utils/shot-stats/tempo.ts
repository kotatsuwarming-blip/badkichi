/**
 * tempo — K 展開スピードの純関数（TASK-0007 / REQ-015/016/106）
 *
 * 適格ラリー = ラリー内の全ショットに打点時刻がある（1 本でも欠損なら除外・ユーザ指定
 * 2026-08-03）かつ ショット 2 本以上 かつ ラリー時間 > 0（EDGE-104）。
 * 終盤テンポ（ラスト 3 打の 2 間隔平均）は 3 本以上のみ。
 */
import type { FlowRally, StatsSubject, TempoMeasure, TempoSample } from '~/types/shot-stats'
import { subjectTeamOf } from '~/utils/shot-stats/flow'

/** 平均テンポの適格判定（REQ-106） */
export function isTempoEligible(rally: FlowRally): boolean {
  return rally.timedCount === rally.shotCount
    && rally.shotCount >= 2
    && rally.durationMs !== null
    && rally.durationMs > 0
}

/**
 * 適格ラリーをテンポサンプルへ変換する。won は対象視点（all は null = 視点なし）。
 * excluded = 確定ラリーのうち対象外になった本数（母数併記, REQ-106）
 */
export function toTempoSamples(
  rows: FlowRally[],
  subject: StatsSubject
): { samples: TempoSample[], excluded: number } {
  const samples: TempoSample[] = []
  let excluded = 0
  for (const r of rows) {
    const team = subject.kind === 'all' ? null : subjectTeamOf(r, subject)
    if (subject.kind !== 'all' && team === null) continue // 対象が出場していないラリーは母数外
    if (!isTempoEligible(r)) {
      excluded += 1
      continue
    }
    samples.push({
      rallyId: r.rallyId,
      won: team === null ? null : r.pointWinner === team,
      avgShotsPerSec: (r.shotCount - 1) / (r.durationMs! / 1000),
      last3IntervalMs: r.last3Ms !== null && r.last3Ms > 0 ? r.last3Ms : null
    })
  }
  return { samples, excluded }
}

/** measure に応じたテンポ値（avg: 打/秒（大きい=速い） / last3: 秒（小さい=速い）） */
export function tempoValueOf(sample: TempoSample, measure: TempoMeasure): number | null {
  if (measure === 'avg') return sample.avgShotsPerSec
  return sample.last3IntervalMs !== null ? sample.last3IntervalMs / 1000 : null
}
