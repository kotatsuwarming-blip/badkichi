/**
 * profile.ts 単体テスト（player-profile PR ② TASK-0003）
 * 年齢・歴の導出（境界日・閏日）、逆算保存、検証（EDGE-001/002）
 */
import { describe, expect, it } from 'vitest'
import {
  PLAY_STYLES, PRACTICE_FREQUENCIES,
  deriveAge, deriveCareerYears, sinceFromYears,
  emptyProfileInput, toProfileInput, toProfileColumns, validateProfileInput
} from '~/utils/players/profile'

const TODAY = new Date(2026, 8, 28) // 2026-09-28

describe('deriveAge（誕生日跨ぎ, REQ-105）', () => {
  it('誕生日前日は歳を跨がない・当日で +1', () => {
    expect(deriveAge('2000-09-29', TODAY)).toBe(25) // 明日が誕生日
    expect(deriveAge('2000-09-28', TODAY)).toBe(26) // 今日が誕生日
    expect(deriveAge('2000-09-27', TODAY)).toBe(26)
  })

  it('閏日生まれ（2/29）は平年 3/1 前まで歳を跨がない', () => {
    expect(deriveAge('2000-02-29', new Date(2026, 1, 28))).toBe(25) // 2/28 時点
    expect(deriveAge('2000-02-29', new Date(2026, 2, 1))).toBe(26) // 3/1 で +1
  })

  it('null・不正・未来日は null', () => {
    expect(deriveAge(null, TODAY)).toBeNull()
    expect(deriveAge('invalid', TODAY)).toBeNull()
    expect(deriveAge('2030-01-01', TODAY)).toBeNull()
  })
})

describe('deriveCareerYears / sinceFromYears（歴の導出と逆算, REQ-101）', () => {
  it('経過年数の切り捨て。1 年未満は 0（EDGE-002）', () => {
    expect(deriveCareerYears('2020-09-01', TODAY)).toBe(6)
    expect(deriveCareerYears('2026-04-01', TODAY)).toBe(0)
  })

  it('逆算: 歴 n 年 → today − n 年の月初。0 年は当月初', () => {
    expect(sinceFromYears(6, TODAY)).toBe('2020-09-01')
    expect(sinceFromYears(0, TODAY)).toBe('2026-09-01')
  })

  it('逆算 → 導出のラウンドトリップが一致する', () => {
    for (const years of [0, 1, 3, 10, 25]) {
      expect(deriveCareerYears(sinceFromYears(years, TODAY), TODAY)).toBe(years)
    }
  })
})

describe('validateProfileInput（EDGE-001）', () => {
  function input(over: Partial<ReturnType<typeof emptyProfileInput>>) {
    return { ...emptyProfileInput(), ...over }
  }

  it('全項目未入力は OK（REQ-103）', () => {
    expect(validateProfileInput(emptyProfileInput(), TODAY)).toEqual([])
  })

  it('未来の生年月日・開始時期、birthdate より前の since を拒否', () => {
    expect(validateProfileInput(input({ birthdate: '2030-01-01' }), TODAY)).toContain('players.profile.errors.birthdate')
    expect(validateProfileInput(input({ badmintonSince: '2030-01-01' }), TODAY)).toContain('players.profile.errors.since')
    expect(validateProfileInput(input({ birthdate: '2000-05-01', badmintonSince: '1999-01-01' }), TODAY))
      .toContain('players.profile.errors.sinceBeforeBirth')
  })

  it('身長・体重の範囲（DB CHECK と一致）', () => {
    expect(validateProfileInput(input({ heightCm: 99 }), TODAY)).toContain('players.profile.errors.height')
    expect(validateProfileInput(input({ heightCm: 100, weightKg: 150 }), TODAY)).toEqual([])
    expect(validateProfileInput(input({ weightKg: 151 }), TODAY)).toContain('players.profile.errors.weight')
  })
})

describe('変換・定数', () => {
  it('toProfileInput ⇄ toProfileColumns のラウンドトリップ', () => {
    const cols = {
      sex: 'female' as const, height_cm: 165, weight_kg: 58.5, birthdate: '2000-01-15',
      badminton_since: '2015-04-01', practice_frequency: 'weekly' as const,
      play_styles: ['attacker', 'power'] as ('attacker' | 'power')[]
    }
    expect(toProfileColumns(toProfileInput(cols))).toEqual(cols)
  })

  it('語彙定数: スタイル 9 種（power 含む）・頻度 5 段階（REQ-101/102）', () => {
    expect(PLAY_STYLES).toHaveLength(9)
    expect(PLAY_STYLES).toContain('power')
    expect(PRACTICE_FREQUENCIES).toHaveLength(5)
  })
})
