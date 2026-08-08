/**
 * placement — 配球ヒートマップ（手前選択 → 配球先）の純関数（ヒアリング2026-08-08）
 *
 * stats_shot_placement の grain 行から、手前（自陣）セル別の打数と、
 * 選択セル起点（未選択 = 全体）の配球先セル + 球種内訳を導出する。
 */
import type { PlacementDestCell, ShotPlacementRow, ZoneCell } from '~/types/shot-stats'
import type { ShotType } from '~/types/shot-annotation'

/** 手前（自陣）セル別の打数（選択 UI + 薄いヒート用） */
export function buildOriginCells(rows: ShotPlacementRow[]): ZoneCell[] {
  const counts = new Map<string, number>()
  for (const r of rows) {
    const key = `${r.origin_row}:${r.origin_col}`
    counts.set(key, (counts.get(key) ?? 0) + r.shots)
  }
  const max = Math.max(1, ...counts.values())
  return [...counts.entries()].map(([key, count]) => {
    const [row, col] = key.split(':').map(Number)
    return { row: row!, col: col!, count, ratio: count / max }
  })
}

/** 配球先セル + 球種内訳。selected = null は全セル起点の合計 */
export function buildDestCells(
  rows: ShotPlacementRow[],
  selected: { row: number, col: number } | null
): PlacementDestCell[] {
  const byCell = new Map<string, Map<string, number>>()
  for (const r of rows) {
    if (selected !== null && (r.origin_row !== selected.row || r.origin_col !== selected.col)) continue
    const key = `${r.dest_row}:${r.dest_col}`
    let types = byCell.get(key)
    if (!types) {
      types = new Map()
      byCell.set(key, types)
    }
    const tkey = r.shot_type ?? '__null__'
    types.set(tkey, (types.get(tkey) ?? 0) + r.shots)
  }
  const totals = [...byCell.values()].map(m => [...m.values()].reduce((s, v) => s + v, 0))
  const max = Math.max(1, ...totals)
  return [...byCell.entries()].map(([key, types]) => {
    const [row, col] = key.split(':').map(Number)
    const count = [...types.values()].reduce((s, v) => s + v, 0)
    const breakdown = [...types.entries()]
      .map(([tkey, c]) => ({ type: tkey === '__null__' ? null : tkey as ShotType, count: c }))
      .sort((a, b) => b.count - a.count)
    return { row: row!, col: col!, count, ratio: count / max, breakdown }
  })
}
