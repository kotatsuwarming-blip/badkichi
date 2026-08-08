/**
 * placement — 配球ヒートマップ（手前選択 → 配球先）の純関数（ヒアリング2026-08-08）
 *
 * stats_shot_placement の grain 行から、
 * - 手前（自陣）セル別の打数 + 球種内訳（フィードバック #4: ホバーで内訳表示）
 * - 選択セル起点（未選択 = 全体）の配球先セル + 球種内訳
 * - コート外の行き先（ネット / 左右アウト / バックアウト。寄せずに別枠表示, #4）
 * を導出する。
 */
import type {
  PlacementBreakdown, PlacementDestCell, PlacementExtra, PlacementExtras,
  ShotPlacementRow
} from '~/types/shot-stats'
import type { ShotType } from '~/types/shot-annotation'

function toBreakdown(types: Map<string, number>): PlacementBreakdown[] {
  return [...types.entries()]
    .map(([tkey, count]) => ({ type: tkey === '__null__' ? null : tkey as ShotType, count }))
    .sort((a, b) => b.count - a.count)
}

function addType(types: Map<string, number>, row: ShotPlacementRow): void {
  const tkey = row.shot_type ?? '__null__'
  types.set(tkey, (types.get(tkey) ?? 0) + row.shots)
}

/** 手前（自陣）セル別の打数 + 球種内訳（選択 UI・ホバー内訳用） */
export function buildOriginCells(rows: ShotPlacementRow[]): PlacementDestCell[] {
  const byCell = new Map<string, Map<string, number>>()
  for (const r of rows) {
    const key = `${r.origin_row}:${r.origin_col}`
    let types = byCell.get(key)
    if (!types) {
      types = new Map()
      byCell.set(key, types)
    }
    addType(types, r)
  }
  const totals = [...byCell.values()].map(m => [...m.values()].reduce((s, v) => s + v, 0))
  const max = Math.max(1, ...totals)
  return [...byCell.entries()].map(([key, types]) => {
    const [row, col] = key.split(':').map(Number)
    const count = [...types.values()].reduce((s, v) => s + v, 0)
    return { row: row!, col: col!, count, ratio: count / max, breakdown: toBreakdown(types) }
  })
}

function matchesOrigin(r: ShotPlacementRow, selected: { row: number, col: number } | null): boolean {
  return selected === null || (r.origin_row === selected.row && r.origin_col === selected.col)
}

/** コート内の配球先セル + 球種内訳。selected = null は全セル起点の合計 */
export function buildDestCells(
  rows: ShotPlacementRow[],
  selected: { row: number, col: number } | null
): PlacementDestCell[] {
  const byCell = new Map<string, Map<string, number>>()
  for (const r of rows) {
    if (r.dest_kind !== 'in' || r.dest_row === null || r.dest_col === null) continue
    if (!matchesOrigin(r, selected)) continue
    const key = `${r.dest_row}:${r.dest_col}`
    let types = byCell.get(key)
    if (!types) {
      types = new Map()
      byCell.set(key, types)
    }
    addType(types, r)
  }
  const totals = [...byCell.values()].map(m => [...m.values()].reduce((s, v) => s + v, 0))
  const max = Math.max(1, ...totals)
  return [...byCell.entries()].map(([key, types]) => {
    const [row, col] = key.split(':').map(Number)
    const count = [...types.values()].reduce((s, v) => s + v, 0)
    return { row: row!, col: col!, count, ratio: count / max, breakdown: toBreakdown(types) }
  })
}

/** コート外の行き先（ネット / 左右アウト / バックアウト）。selected 連動（#4） */
export function buildDestExtras(
  rows: ShotPlacementRow[],
  selected: { row: number, col: number } | null
): PlacementExtras {
  const maps = {
    net: new Map<string, number>(),
    left: new Map<string, number>(),
    right: new Map<string, number>(),
    back: new Map<string, number>()
  }
  for (const r of rows) {
    if (!matchesOrigin(r, selected)) continue
    if (r.dest_kind === 'net') addType(maps.net, r)
    else if (r.dest_kind === 'out' && r.dest_out !== null) addType(maps[r.dest_out], r)
  }
  const toExtra = (m: Map<string, number>): PlacementExtra => ({
    count: [...m.values()].reduce((s, v) => s + v, 0),
    breakdown: toBreakdown(m)
  })
  return { net: toExtra(maps.net), left: toExtra(maps.left), right: toExtra(maps.right), back: toExtra(maps.back) }
}
