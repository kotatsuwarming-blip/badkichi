/**
 * coverage — 注釈率（バッジ・母数併記）の純関数（REQ-002/003, TASK-0004）
 *
 * stats_annotation_coverage は試合ごと 1 行を返す。スコープ全体のバッジ表示には
 * ここで合計してから率を出す。母数 0 は null（「-」表示, EDGE-001）。
 */
import type { AnnotationCoverageRow } from '~/types/shot-stats'

/** スコープ合計（match_id は合計行では空文字にする） */
export function sumCoverage(rows: AnnotationCoverageRow[]): AnnotationCoverageRow {
  const zero: AnnotationCoverageRow = {
    match_id: '',
    shots_total: 0,
    shots_typed: 0,
    shots_pointed: 0,
    shots_handed: 0,
    shots_attributed: 0,
    rallies_total: 0,
    rallies_ended: 0,
    rallies_fully_timed: 0
  }
  return rows.reduce<AnnotationCoverageRow>((acc, r) => ({
    match_id: '',
    shots_total: acc.shots_total + r.shots_total,
    shots_typed: acc.shots_typed + r.shots_typed,
    shots_pointed: acc.shots_pointed + r.shots_pointed,
    shots_handed: acc.shots_handed + r.shots_handed,
    shots_attributed: acc.shots_attributed + r.shots_attributed,
    rallies_total: acc.rallies_total + r.rallies_total,
    rallies_ended: acc.rallies_ended + r.rallies_ended,
    rallies_fully_timed: acc.rallies_fully_timed + r.rallies_fully_timed
  }), zero)
}

/** 注釈率（0〜1）。母数 0 は null（0 除算回避, EDGE-001） */
export function coverageRate(numerator: number, denominator: number): number | null {
  if (denominator <= 0) return null
  return numerator / denominator
}
