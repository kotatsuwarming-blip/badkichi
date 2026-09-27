/**
 * receive — レシーブ詳細（サーブ種別 → 返球 → コース）の純関数（2026-08-08 #6）
 *
 * stats_receive_detail の grain 行から、ドリルダウン各段の本数 + レシーブ側得点率を導出する。
 * Level 1: サーブ種別ごと / Level 2: 選択サーブへの返球種別ごと /
 * Level 3: 返球コース（相手半面 3×3 + ネット/アウト/コース不明）ごと。
 */
import { OUT_RING_SLOTS } from '~/types/shot-stats'
import type { OutRingSlot, ReceiveDetailRow } from '~/types/shot-stats'
import type { ShotType } from '~/types/shot-annotation'

export interface RateEntry {
  type: ShotType | null
  total: number
  won: number
}

export interface CourseCell {
  row: number
  col: number
  total: number
  won: number
  ratio: number
}

export interface CourseResult {
  cells: CourseCell[]
  net: { total: number, won: number }
  /** アウト位置リング 11 枠（stats-miss-out-detail REQ-101/102） */
  ring: Record<OutRingSlot, { total: number, won: number }>
  ringTotal: number
  /** コース不明（3打目の打点未注釈・camera_near_team なし等） */
  unknown: { total: number, won: number }
}

/** 選択状態（serveType: undefined = 未選択 / null = 未注釈サーブを選択） */
export interface ReceiveSelection {
  serveType?: ShotType | null
  receiveType?: ShotType | null
}

function matches(r: ReceiveDetailRow, sel: ReceiveSelection): boolean {
  if (sel.serveType !== undefined && r.serve_type !== sel.serveType) return false
  if (sel.receiveType !== undefined && r.receive_type !== sel.receiveType) return false
  return true
}

function aggregateBy(
  rows: ReceiveDetailRow[],
  sel: ReceiveSelection,
  keyOf: (r: ReceiveDetailRow) => ShotType | null
): RateEntry[] {
  const map = new Map<string, RateEntry>()
  for (const r of rows) {
    if (!matches(r, sel)) continue
    const key = keyOf(r) ?? '__null__'
    let e = map.get(key)
    if (!e) {
      e = { type: keyOf(r), total: 0, won: 0 }
      map.set(key, e)
    }
    e.total += r.total
    e.won += r.won
  }
  return [...map.values()]
}

/** Level 1: サーブ種別ごとのレシーブ本数・得点率（固定順: short → long → drive → 未注釈） */
export const SERVE_FACETS: (ShotType | null)[] = ['serve_short', 'serve_long', 'serve_drive', null]

export function buildServeFacets(rows: ReceiveDetailRow[]): RateEntry[] {
  const found = aggregateBy(rows, {}, r => r.serve_type)
  return SERVE_FACETS.map(type =>
    found.find(e => e.type === type) ?? { type, total: 0, won: 0 }
  )
}

/** Level 2: 選択サーブへの返球種別ごと（実打のみ・本数降順） */
export function buildReturnEntries(rows: ReceiveDetailRow[], serveType: ShotType | null): RateEntry[] {
  return aggregateBy(rows, { serveType }, r => r.receive_type)
    .sort((a, b) => b.total - a.total)
}

/** Level 3: 返球コース（選択サーブ × 任意の返球種別で絞り込み） */
export function buildCourses(rows: ReceiveDetailRow[], sel: ReceiveSelection): CourseResult {
  const cells = new Map<string, { total: number, won: number }>()
  const zero = () => ({ total: 0, won: 0 })
  const ring = Object.fromEntries(OUT_RING_SLOTS.map(slot => [slot, zero()])) as CourseResult['ring']
  const result: CourseResult = { cells: [], net: zero(), ring, ringTotal: 0, unknown: zero() }
  for (const r of rows) {
    if (!matches(r, sel)) continue
    if (r.dest_kind === 'in' && r.dest_row !== null && r.dest_col !== null) {
      const key = `${r.dest_row}:${r.dest_col}`
      const acc = cells.get(key) ?? zero()
      acc.total += r.total
      acc.won += r.won
      cells.set(key, acc)
    } else if (r.dest_kind === 'net') {
      result.net.total += r.total
      result.net.won += r.won
    } else if (r.dest_kind === 'out' && r.dest_out !== null) {
      // リング枠へ割当（角はそのまま / back は列 / サイドは相手半面の行, REQ-104）
      const slot: OutRingSlot = r.dest_out === 'left_back' || r.dest_out === 'right_back'
        ? r.dest_out
        : r.dest_out === 'back'
          ? `back_${r.dest_col ?? 1}` as OutRingSlot
          : `${r.dest_out}_${r.dest_row ?? 0}` as OutRingSlot
      result.ring[slot].total += r.total
      result.ring[slot].won += r.won
      result.ringTotal += r.total
    } else {
      result.unknown.total += r.total
      result.unknown.won += r.won
    }
  }
  const max = Math.max(1, ...[...cells.values()].map(c => c.total))
  result.cells = [...cells.entries()].map(([key, acc]) => {
    const [row, col] = key.split(':').map(Number)
    return { row: row!, col: col!, total: acc.total, won: acc.won, ratio: acc.total / max }
  })
  return result
}
