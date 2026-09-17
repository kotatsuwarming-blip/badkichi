/**
 * tempo — K 展開スピードの純関数（TASK-0007 / REQ-015/016/106 + 改修2026-08-12）
 *
 * 2 軸散布図用: x = ラリー全体の平均ショット間隔 / y = 終盤 4 打の平均間隔（いずれも秒/打）。
 * 適格ラリー = ラリー内の全ショットに打点時刻がある（1 本でも欠損なら除外・ユーザ指定
 * 2026-08-03）かつ ショット 4 本以上（終盤 4 打を取るため・ヒアリング2026-08-12）
 * かつ ラリー時間 > 0（EDGE-104）。
 */
import type { FlowRally, StatsSubject, TempoSample } from '~/types/shot-stats'
import { subjectTeamOf } from '~/utils/shot-stats/flow'

/** テンポ集計の適格判定（REQ-106 + 4打以上・ヒアリング2026-08-12） */
export function isTempoEligible(rally: FlowRally): boolean {
  return rally.timedCount === rally.shotCount
    && rally.shotCount >= 4
    && rally.durationMs !== null
    && rally.durationMs > 0
    && rally.last4Ms !== null
    && rally.last4Ms > 0
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
      avgIntervalSec: (r.durationMs! / 1000) / (r.shotCount - 1),
      last4IntervalSec: r.last4Ms! / 1000,
      videoStartMs: r.videoStartMs,
      precise: r.isPrecise
    })
  }
  return { samples, excluded }
}
