/**
 * placement 純関数 単体テスト (配球ヒートマップ改訂, ヒアリング2026-08-08)
 */
import { describe, expect, it } from 'vitest'
import { buildDestCells, buildOriginCells } from '~/utils/shot-stats/placement'
import type { ShotPlacementRow } from '~/types/shot-stats'

const rows: ShotPlacementRow[] = [
  // 左前 (origin 2,0) から: スマッシュ 3 本 → 奥バック中央 (dest 2,1)
  { hit_player_id: 'p0', shot_type: 'smash', origin_row: 2, origin_col: 0, dest_row: 2, dest_col: 1, shots: 3 },
  // 左前から: ヘアピン 1 本 → 奥ネット左 (dest 0,0)
  { hit_player_id: 'p0', shot_type: 'hairpin', origin_row: 2, origin_col: 0, dest_row: 0, dest_col: 0, shots: 1 },
  // 右後 (origin 0,2) から: クリア 2 本 → 奥バック中央 (dest 2,1)
  { hit_player_id: 'p0', shot_type: 'clear_high', origin_row: 0, origin_col: 2, dest_row: 2, dest_col: 1, shots: 2 }
]

describe('buildOriginCells', () => {
  it('手前セル別の打数を集計', () => {
    const cells = buildOriginCells(rows)
    expect(cells.find(c => c.row === 2 && c.col === 0)!.count).toBe(4)
    expect(cells.find(c => c.row === 0 && c.col === 2)!.count).toBe(2)
  })
})

describe('buildDestCells', () => {
  it('未選択時は全セル起点の合計 + 球種内訳', () => {
    const cells = buildDestCells(rows, null)
    const back = cells.find(c => c.row === 2 && c.col === 1)!
    expect(back.count).toBe(5) // smash 3 + clear 2
    expect(back.breakdown).toEqual([
      { type: 'smash', count: 3 },
      { type: 'clear_high', count: 2 }
    ])
  })

  it('手前セル選択時はそのセル起点の配球のみ (左前 → smash/hairpin だけ)', () => {
    const cells = buildDestCells(rows, { row: 2, col: 0 })
    const back = cells.find(c => c.row === 2 && c.col === 1)!
    expect(back.count).toBe(3) // clear は右後起点なので落ちる
    expect(back.breakdown).toEqual([{ type: 'smash', count: 3 }])
    expect(cells.find(c => c.row === 0 && c.col === 0)!.count).toBe(1)
  })

  it('未注釈種別は type null として内訳に出る', () => {
    const cells = buildDestCells(
      [{ hit_player_id: 'p0', shot_type: null, origin_row: 1, origin_col: 1, dest_row: 1, dest_col: 1, shots: 2 }],
      null
    )
    expect(cells[0]!.breakdown).toEqual([{ type: null, count: 2 }])
  })
})
