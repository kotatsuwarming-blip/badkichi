/**
 * score.ts 単体テスト（TASK-0002）
 * 検算例: docs/spec/shot-value/requirements.md「採点の検算例」
 */
import { describe, expect, it } from 'vitest'
import { aggregateRoles, filterByZones, toAggregate, typeBreakdown, zoneCells, SV_LOW_SAMPLE_N } from '~/utils/shot-value/score'
import { SV_WEIGHTS, roleScore } from '~/utils/shot-value/weights'
import type { ShotValueRow, SvWeights } from '~/types/shot-value'

const W: SvWeights = { induce: 1.0, setback: [0.7, 0.5] }

function row(over: Partial<ShotValueRow>): ShotValueRow {
  return {
    hit_player_id: 'p1', shot_type: 'smash', hand: null, zone_row: 0, zone_col: 0,
    n: 0, kime: 0, yuhatsu: 0, fuseki1: 0, fuseki2: 0, miss: 0, yurushi1: 0, yurushi2: 0,
    ...over
  }
}

describe('roleScore / SV_WEIGHTS', () => {
  it('既定重み: 決め+1 / 誘発+1.0 / 布石+0.7,+0.5 / 自ミス−1 / 許した−0.7,−0.5', () => {
    expect(roleScore('kime', SV_WEIGHTS)).toBe(1)
    expect(roleScore('yuhatsu', SV_WEIGHTS)).toBe(1.0)
    expect(roleScore('fuseki1', SV_WEIGHTS)).toBe(0.7)
    expect(roleScore('fuseki2', SV_WEIGHTS)).toBe(0.5)
    expect(roleScore('miss', SV_WEIGHTS)).toBe(-1)
    expect(roleScore('yurushi1', SV_WEIGHTS)).toBe(-0.7)
    expect(roleScore('yurushi2', SV_WEIGHTS)).toBe(-0.5)
  })
})

describe('toAggregate — 検算例（ミス決着5打の勝ちチーム側）', () => {
  // B チーム: 布石(+0.7) + ミス誘発(+1.0) = 2 打で +1.7
  it('稼いだ/失った成分と SV100', () => {
    const counts = aggregateRoles([row({ n: 2, yuhatsu: 1, fuseki1: 1 })])
    const agg = toAggregate(counts, W)
    expect(agg.n).toBe(2)
    expect(agg.earned100).toBeCloseTo(100 * 1.7 / 2)
    expect(agg.lost100).toBe(0)
    expect(agg.sv100).toBeCloseTo(85)
  })

  // A チーム: 許した(−0.5) + 許した(−0.7) + 自ミス(−1) = 3 打で −2.2
  it('負けチーム側の収支', () => {
    const counts = aggregateRoles([row({ n: 3, miss: 1, yurushi1: 1, yurushi2: 1 })])
    const agg = toAggregate(counts, W)
    expect(agg.earned100).toBe(0)
    expect(agg.lost100).toBeCloseTo(100 * 2.2 / 3)
    expect(agg.sv100).toBeCloseTo(-100 * 2.2 / 3)
  })

  it('スマッシュ20本の説明例: +2 +2 +1.4 −3 −0.7 = +1.7 → SV100 +8.5', () => {
    const counts = aggregateRoles([
      row({ n: 20, kime: 2, yuhatsu: 2, fuseki1: 2, miss: 3, yurushi1: 1 })
    ])
    const agg = toAggregate(counts, W)
    expect(agg.earned100).toBeCloseTo(100 * (2 + 2 + 1.4) / 20)
    expect(agg.lost100).toBeCloseTo(100 * 3.7 / 20)
    expect(agg.sv100).toBeCloseTo(100 * 1.7 / 20)
  })

  it('CI95: 分散ゼロ（全て 0 点）なら 0、混在なら正の値で n 増で縮む', () => {
    expect(toAggregate(aggregateRoles([row({ n: 10 })]), W).ci95).toBe(0)
    const small = toAggregate(aggregateRoles([row({ n: 5, kime: 1, miss: 1 })]), W)
    const large = toAggregate(aggregateRoles([row({ n: 50, kime: 10, miss: 10 })]), W)
    expect(small.ci95).toBeGreaterThan(0)
    expect(large.ci95).toBeLessThan(small.ci95)
  })

  it('重み差し替え（誘発 0.5）で再計算される（REQ-002）', () => {
    const counts = aggregateRoles([row({ n: 2, yuhatsu: 1 })])
    expect(toAggregate(counts, { induce: 0.5, setback: [0.7, 0.5] }).sv100).toBeCloseTo(25)
    expect(toAggregate(counts, W).sv100).toBeCloseTo(50)
  })

  it('n=0 は全て 0（ゼロ除算なし）', () => {
    const agg = toAggregate(aggregateRoles([]), W)
    expect(agg).toEqual({ n: 0, earned100: 0, lost100: 0, sv100: 0, ci95: 0 })
  })
})

describe('filterByZones（REQ-101）', () => {
  const rows = [
    row({ n: 3, zone_row: 0, zone_col: 0 }),
    row({ n: 2, zone_row: 2, zone_col: 1 }),
    row({ n: 4, zone_row: null, zone_col: null }) // 座標なし/向き不明
  ]
  it('未選択（null / 空）は null ゾーン行も含む全行', () => {
    expect(aggregateRoles(filterByZones(rows, null)).n).toBe(9)
    expect(aggregateRoles(filterByZones(rows, new Set())).n).toBe(9)
  })
  it('選択中は一致セルのみ（null 行は対象外）', () => {
    expect(aggregateRoles(filterByZones(rows, new Set(['r0c0']))).n).toBe(3)
    expect(aggregateRoles(filterByZones(rows, new Set(['r0c0', 'r2c1']))).n).toBe(5)
  })
})

describe('typeBreakdown（REQ-005/007）', () => {
  it('n 降順・lowSample・per100 セグメント値（重み込み）', () => {
    const rows = [
      row({ shot_type: 'smash', n: 10, kime: 2, miss: 1 }),
      row({ shot_type: 'drop', n: 3, fuseki1: 1 })
    ]
    const brk = typeBreakdown(rows, W)
    expect(brk.map(b => b.shotType)).toEqual(['smash', 'drop'])
    expect(brk[0]!.lowSample).toBe(false)
    expect(brk[1]!.lowSample).toBe(true)
    expect(SV_LOW_SAMPLE_N).toBe(5)
    // per100 は点数量（重み込み絶対値）: fuseki1 1本 → 0.7 点 /3本 → 23.3/100本
    expect(brk[1]!.per100.fuseki1).toBeCloseTo(100 * 0.7 / 3)
    expect(brk[0]!.per100.kime).toBeCloseTo(20)
    expect(brk[0]!.per100.miss).toBeCloseTo(10)
  })

  it('同一球種の複数 grain（hand/ゾーン違い）が合算される', () => {
    const rows = [
      row({ shot_type: 'smash', hand: 'fore', n: 4, kime: 1 }),
      row({ shot_type: 'smash', hand: 'back', zone_row: 1, n: 6, miss: 1 })
    ]
    const brk = typeBreakdown(rows, W)
    expect(brk).toHaveLength(1)
    expect(brk[0]!.n).toBe(10)
    expect(brk[0]!.sv100).toBeCloseTo(0)
  })
})

describe('zoneCells（REQ-004）', () => {
  it('9 セル固定で返り、null ゾーン行は含まれない', () => {
    const cells = zoneCells([
      row({ n: 4, kime: 2, zone_row: 0, zone_col: 0 }),
      row({ n: 3, zone_row: null, zone_col: null })
    ], W)
    expect(cells).toHaveLength(9)
    const c00 = cells.find(c => c.zoneRow === 0 && c.zoneCol === 0)!
    expect(c00.n).toBe(4)
    expect(c00.sv100).toBeCloseTo(50)
    expect(cells.filter(c => c.n > 0)).toHaveLength(1)
  })
})
