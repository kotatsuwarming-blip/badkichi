/**
 * offset 単体テスト — TASK-0003 / TC-010 系 + TC-101-04
 * オフセット校正の平均・非対称ループ窓・負値 clamp
 */
import { describe, it, expect } from 'vitest'
import { averageOffset, loopWindowFor } from '~/utils/annotation/offset'

describe('averageOffset', () => {
  it('TC-010-01: 校正3件 (-380, -420, -400) → 平均 -400ms', () => {
    expect(averageOffset([-380, -420, -400])).toBe(-400)
  })

  it('平均は整数 ms に丸める', () => {
    expect(averageOffset([-100, -101])).toBe(-101) // Math.round(-100.5) = -100? 丸め方向を固定
  })

  it('サンプル0件は補正なし (0)', () => {
    expect(averageOffset([])).toBe(0)
  })
})

describe('loopWindowFor', () => {
  it('TC-101-04: 決着ループは後ろ長め (前1s / 後2.5s)', () => {
    expect(loopWindowFor('rallyEnd', 5000)).toEqual({ fromMs: 4000, toMs: 7500 })
  })

  it('TC-101-04: 打点探索ループは前長め (前1.2s / 後0.3s) — 向きが逆', () => {
    expect(loopWindowFor('hitSearch', 5000)).toEqual({ fromMs: 3800, toMs: 5300 })
  })

  it('TC-010-B01 / EDGE-004: 動画開始前になる場合は 0 に clamp', () => {
    expect(loopWindowFor('hitSearch', 500).fromMs).toBe(0)
    expect(loopWindowFor('rallyEnd', 300).fromMs).toBe(0)
  })
})
