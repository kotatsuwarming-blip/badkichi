/**
 * coverage 純関数 単体テスト (TASK-0004 / REQ-002/003 / EDGE-001)
 */
import { describe, expect, it } from 'vitest'
import { sumCoverage, coverageRate } from '~/utils/shot-stats/coverage'
import type { AnnotationCoverageRow } from '~/types/shot-stats'

function row(partial: Partial<AnnotationCoverageRow>): AnnotationCoverageRow {
  return {
    match_id: 'm', shots_total: 0, shots_typed: 0, shots_pointed: 0,
    shots_handed: 0, shots_attributed: 0, rallies_total: 0, rallies_ended: 0,
    rallies_fully_timed: 0, ...partial
  }
}

describe('sumCoverage', () => {
  it('複数試合の分母分子を合計する', () => {
    const sum = sumCoverage([
      row({ shots_total: 100, shots_typed: 72, rallies_total: 20, rallies_ended: 20 }),
      row({ shots_total: 50, shots_typed: 8, rallies_total: 10, rallies_ended: 4 })
    ])
    expect(sum.shots_total).toBe(150)
    expect(sum.shots_typed).toBe(80)
    expect(sum.rallies_total).toBe(30)
    expect(sum.rallies_ended).toBe(24)
  })

  it('空配列はゼロ行を返す', () => {
    const sum = sumCoverage([])
    expect(sum.shots_total).toBe(0)
    expect(sum.rallies_total).toBe(0)
  })
})

describe('coverageRate', () => {
  it('注釈率を 0〜1 で返す', () => {
    expect(coverageRate(72, 100)).toBeCloseTo(0.72, 5)
  })
  it('母数 0 は null (0 除算回避, EDGE-001)', () => {
    expect(coverageRate(0, 0)).toBeNull()
  })
})
