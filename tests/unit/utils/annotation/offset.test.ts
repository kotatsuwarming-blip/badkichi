/**
 * offset 単体テスト — TASK-0003 / TC-010 系 + TC-101-04
 * オフセット校正の平均・非対称ループ窓・負値 clamp
 */
import { describe, it, expect } from 'vitest'
import { averageOffset, loopWindowFor, startFromPreviousShot, extendWindow } from '~/utils/annotation/offset'

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

  it('TC-101-04: 打球探索ループは前後 0.9s (2026-08-05 縮小)', () => {
    expect(loopWindowFor('hitSearch', 5000)).toEqual({ fromMs: 4100, toMs: 5900 })
  })

  it('TC-010-B01 / EDGE-004: 動画開始前になる場合は 0 に clamp', () => {
    expect(loopWindowFor('hitSearch', 500).fromMs).toBe(0)
    expect(loopWindowFor('rallyEnd', 300).fromMs).toBe(0)
  })
})

describe('extendWindow (ループ窓の手動延長、2026-08-29)', () => {
  it('前後を独立に延長する', () => {
    expect(extendWindow({ fromMs: 5000, toMs: 7000 }, 1000, 0)).toEqual({ fromMs: 4000, toMs: 7000 })
    expect(extendWindow({ fromMs: 5000, toMs: 7000 }, 0, 2000)).toEqual({ fromMs: 5000, toMs: 9000 })
    expect(extendWindow({ fromMs: 5000, toMs: 7000 }, 1000, 2000)).toEqual({ fromMs: 4000, toMs: 9000 })
  })
  it('開始は 0 未満に clamp (EDGE-004 準拠)', () => {
    expect(extendWindow({ fromMs: 500, toMs: 2000 }, 1000, 0)).toEqual({ fromMs: 0, toMs: 2000 })
  })
  it('延長 0 は同一窓を返す', () => {
    const w = { fromMs: 5000, toMs: 7000 }
    expect(extendWindow(w, 0, 0)).toBe(w)
  })
})

describe('startFromPreviousShot (直前ショットからの動的開始、2026-08-05)', () => {
  const base = { fromMs: 4100, toMs: 5900 }

  it('直前ショットの時刻が窓内なら、そこを開始点にする', () => {
    expect(startFromPreviousShot(base, 4700, 5000)).toEqual({ fromMs: 4700, toMs: 5900 })
  })

  it('直前時刻が窓開始より前 (既定の方が狭い) は既定のまま', () => {
    expect(startFromPreviousShot(base, 3000, 5000)).toEqual(base)
  })

  it('直前時刻がアンカー以降 (異常値) は既定のまま', () => {
    expect(startFromPreviousShot(base, 5000, 5000)).toEqual(base)
    expect(startFromPreviousShot(base, 5600, 5000)).toEqual(base)
  })

  it('直前ショットなし (null) は既定のまま', () => {
    expect(startFromPreviousShot(base, null, 5000)).toEqual(base)
  })
})
