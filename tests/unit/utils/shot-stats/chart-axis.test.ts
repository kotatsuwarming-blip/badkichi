/**
 * chart-axis 純関数 単体テスト（コンボチャートの本数軸目盛り）
 */
import { describe, expect, it } from 'vitest'
import { countAxisScale } from '~/utils/shot-stats/chart-axis'

describe('countAxisScale', () => {
  it('0 以下は 1 刻み・最大 5（空データのフォールバック）', () => {
    expect(countAxisScale(0)).toEqual({ max: 5, interval: 1 })
    expect(countAxisScale(-3)).toEqual({ max: 5, interval: 1 })
  })

  it('小さい最大値は 1 刻みで覆う', () => {
    expect(countAxisScale(3)).toEqual({ max: 5, interval: 1 })
    expect(countAxisScale(5)).toEqual({ max: 5, interval: 1 })
  })

  it('ナイス間隔（1/2/5×10^k）に切り上げる', () => {
    expect(countAxisScale(18)).toEqual({ max: 25, interval: 5 })
    expect(countAxisScale(40)).toEqual({ max: 50, interval: 10 })
    expect(countAxisScale(100)).toEqual({ max: 100, interval: 20 })
    expect(countAxisScale(350)).toEqual({ max: 500, interval: 100 })
  })

  it('分割数は常に 5 分割で %軸（20 刻み）とグリッド線が一致する', () => {
    for (const n of [1, 7, 18, 33, 99, 101, 999]) {
      const s = countAxisScale(n)
      expect(s.max / s.interval).toBe(5)
      expect(s.max).toBeGreaterThanOrEqual(n)
    }
  })
})
