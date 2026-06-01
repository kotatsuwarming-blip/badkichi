import { describe, expect, it } from 'vitest'
import { groupNameSchema } from '~/schemas/group-name'

// 境界値 + 分岐のみ (feedback_test_coverage)。冗長ケース (2文字/49文字等) は置かない。
describe('groupNameSchema', () => {
  it('1 文字は受理される (EDGE-101)', () => {
    expect(groupNameSchema.safeParse('a').success).toBe(true)
  })

  it('50 文字は受理される (EDGE-102)', () => {
    expect(groupNameSchema.safeParse('a'.repeat(50)).success).toBe(true)
  })

  it('0 文字 (空) は検証エラー、message は invalid_group_name (EDGE-103)', () => {
    const result = groupNameSchema.safeParse('')
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.issues[0]?.message).toBe('invalid_group_name')
    }
  })

  it('51 文字は検証エラー (EDGE-104)', () => {
    const result = groupNameSchema.safeParse('a'.repeat(51))
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.issues[0]?.message).toBe('invalid_group_name')
    }
  })

  it('空白のみは trim 後 0 文字となり検証エラー (EDGE-105)', () => {
    expect(groupNameSchema.safeParse('   ').success).toBe(false)
  })

  it('前後空白は trim され受理される (trim 適用順の確認)', () => {
    const result = groupNameSchema.safeParse('  チーム  ')
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data).toBe('チーム')
    }
  })
})
