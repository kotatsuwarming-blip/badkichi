/**
 * order-matching 単体テスト — TASK-0003 / TC-007 系
 * ラリー内 k 番目対応（タイミング非依存）・超過検出
 */
import { describe, it, expect } from 'vitest'
import { matchKeyToShot } from '~/utils/annotation/order-matching'

describe('matchKeyToShot', () => {
  it('TC-007-01: ショット5件に入力5件 → 順に1対1で対応', () => {
    for (let i = 0; i < 5; i++) {
      expect(matchKeyToShot(5, i)).toBe(i)
    }
  })

  it('TC-007-02: 入力がショット数を超過 → null (無視 + 警告の契機)', () => {
    expect(matchKeyToShot(5, 5)).toBeNull()
    expect(matchKeyToShot(5, 6)).toBeNull()
    expect(matchKeyToShot(0, 0)).toBeNull()
  })

  it('負のインデックスは null', () => {
    expect(matchKeyToShot(5, -1)).toBeNull()
  })
})
