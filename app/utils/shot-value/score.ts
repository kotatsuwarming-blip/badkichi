/**
 * score — SV（ポイント収支）のクライアント集計純関数（TASK-0002）
 *
 * RPC（stats_shot_value）の役割カウント行を、ゾーン選択・フィルタで合算し
 * SV100 / 稼いだ・失った成分 / 95%CI / 球種別内訳へ変換する。
 * 重み合成はここでのみ行う（REQ-002/401: RPC は点数を持たない）。
 *
 * 関連設計: docs/design/shot-value/interfaces.ts / 関連要件: REQ-003, 005〜007, 101
 * スタイル: セミコロンなし / no comma dangle
 */
import { SV_ROLES, zoneKeyOf } from '~/types/shot-value'
import type { ShotValueRow, SvAggregate, SvRole, SvRoleCounts, SvTypeBreakdownRow, SvWeights, SvZoneCell } from '~/types/shot-value'
import { roleScore } from '~/utils/shot-value/weights'

/** n < この値で薄表示 + 本数不足（REQ-007） */
export const SV_LOW_SAMPLE_N = 5

function emptyCounts(): SvRoleCounts {
  return { n: 0, kime: 0, yuhatsu: 0, fuseki1: 0, fuseki2: 0, miss: 0, yurushi1: 0, yurushi2: 0 }
}

function addCounts(acc: SvRoleCounts, row: ShotValueRow): void {
  acc.n += row.n
  for (const role of SV_ROLES) acc[role] += row[role]
}

/**
 * ゾーン選択で行を絞る（REQ-101）。
 * zones = null（未選択 = コート全体）はゾーン null 行も含めた全行。
 * 選択中は zone_row/col が選択セルに一致する行のみ（null 行は対象外）。
 */
export function filterByZones(rows: ShotValueRow[], zones: Set<string> | null): ShotValueRow[] {
  if (zones === null || zones.size === 0) return rows
  return rows.filter(r =>
    r.zone_row !== null && r.zone_col !== null && zones.has(zoneKeyOf(r.zone_row, r.zone_col))
  )
}

/** 行集合を役割カウントへ合算 */
export function aggregateRoles(rows: ShotValueRow[]): SvRoleCounts {
  const acc = emptyCounts()
  for (const r of rows) addCounts(acc, r)
  return acc
}

/**
 * 役割カウント → 収支集計。
 * mean = Σ(count×score)/n / var = Σ(count×score²)/n − mean² / ci95 = 1.96×√(var/n)×100。
 * 役割から score が一意に決まるため、カウントだけで平均も分散も厳密に出る（設計判断）。
 */
export function toAggregate(counts: SvRoleCounts, w: SvWeights): SvAggregate {
  const n = counts.n
  if (n <= 0) return { n: 0, earned100: 0, lost100: 0, sv100: 0, ci95: 0 }
  let sum = 0
  let sumSq = 0
  let earned = 0
  let lost = 0
  for (const role of SV_ROLES) {
    const c = counts[role]
    if (c === 0) continue
    const s = roleScore(role, w)
    sum += c * s
    sumSq += c * s * s
    if (s > 0) earned += c * s
    else lost += c * -s
  }
  const mean = sum / n
  const variance = Math.max(0, sumSq / n - mean * mean)
  return {
    n,
    earned100: 100 * earned / n,
    lost100: 100 * lost / n,
    sv100: 100 * mean,
    ci95: 1.96 * Math.sqrt(variance / n) * 100
  }
}

/** 球種別内訳（n 降順, REQ-005）。rows はゾーン・フィルタ適用済みを渡す */
export function typeBreakdown(rows: ShotValueRow[], w: SvWeights): SvTypeBreakdownRow[] {
  const byType = new Map<string, SvRoleCounts>()
  for (const r of rows) {
    const acc = byType.get(r.shot_type) ?? emptyCounts()
    addCounts(acc, r)
    byType.set(r.shot_type, acc)
  }
  return [...byType.entries()]
    .map(([shotType, counts]) => {
      const agg = toAggregate(counts, w)
      const per100 = {} as Record<SvRole, number>
      for (const role of SV_ROLES) per100[role] = counts.n > 0 ? 100 * counts[role] * Math.abs(roleScore(role, w)) / counts.n : 0
      return { shotType, ...agg, per100, lowSample: counts.n < SV_LOW_SAMPLE_N }
    })
    .sort((a, b) => b.n - a.n)
}

/** コート 3×3 のセル別収支（REQ-004）。rows はフィルタ適用済み（ゾーン選択は適用しない）を渡す */
export function zoneCells(rows: ShotValueRow[], w: SvWeights, zones = 3): SvZoneCell[] {
  const byZone = new Map<string, SvRoleCounts>()
  for (const r of rows) {
    if (r.zone_row === null || r.zone_col === null) continue
    const key = zoneKeyOf(r.zone_row, r.zone_col)
    const acc = byZone.get(key) ?? emptyCounts()
    addCounts(acc, r)
    byZone.set(key, acc)
  }
  const cells: SvZoneCell[] = []
  for (let row = 0; row < zones; row++) {
    for (let col = 0; col < zones; col++) {
      const counts = byZone.get(zoneKeyOf(row, col)) ?? emptyCounts()
      const agg = toAggregate(counts, w)
      cells.push({ zoneRow: row, zoneCol: col, n: agg.n, sv100: agg.sv100 })
    }
  }
  return cells
}
