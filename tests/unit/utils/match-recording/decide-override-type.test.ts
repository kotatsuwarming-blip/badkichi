import { describe, expect, it } from 'vitest'
import { decideOverrideType } from '~/utils/match-recording/decide-override-type'

describe('decideOverrideType', () => {
  // 偶数回目（0,2,...）= swapped（入れ替わり）、奇数回目（1,3,...）= restored（戻り）
  it('0 回目（既存 0 件）は swapped', () => {
    expect(decideOverrideType(0)).toBe('swapped')
  })

  it('1 回目（既存 1 件）は restored', () => {
    expect(decideOverrideType(1)).toBe('restored')
  })

  it('2 回目（既存 2 件）は swapped に戻る', () => {
    expect(decideOverrideType(2)).toBe('swapped')
  })
})
