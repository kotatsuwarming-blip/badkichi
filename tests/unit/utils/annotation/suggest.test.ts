/**
 * suggest 単体テスト — 打点からの種別候補推定 (2026-08-05)
 * ゾーン分割と「自打点 × 行き先」対応表・レシーブ文脈の合成・境界条件
 */
import { describe, it, expect } from 'vitest'
import { suggestShotTypes, zoneOfY } from '~/utils/annotation/suggest'

describe('zoneOfY', () => {
  it('ネット (0.5) 付近は front、コート端は rear、その間は mid', () => {
    expect(zoneOfY(0.5)).toBe('front')
    expect(zoneOfY(0.4)).toBe('front') // d=0.1 < 0.15
    expect(zoneOfY(0.25)).toBe('mid') // d=0.25
    expect(zoneOfY(0.05)).toBe('rear') // d=0.45
    expect(zoneOfY(0.95)).toBe('rear') // 反対サイドも同じ
  })

  it('コート外 (正規化 0-1 の外) も rear に clamp', () => {
    expect(zoneOfY(-0.2)).toBe('rear')
    expect(zoneOfY(1.3)).toBe('rear')
  })
})

describe('suggestShotTypes', () => {
  it('奥 × 奥 → クリア2種', () => {
    expect(suggestShotTypes({ shotNumber: 3, hitY: 0.05, destY: 0.95, prevType: null }))
      .toEqual(['clear_high', 'clear_driven'])
  })

  it('奥 × 前 → ドロップ/カット系', () => {
    expect(suggestShotTypes({ shotNumber: 3, hitY: 0.05, destY: 0.55, prevType: null }))
      .toEqual(['drop', 'cut', 'reverse_cut'])
  })

  it('前 × 奥 → ロブ2種 / 前 × 前 → ヘアピン', () => {
    expect(suggestShotTypes({ shotNumber: 3, hitY: 0.45, destY: 0.95, prevType: null }))
      .toEqual(['lob_high', 'lob_low'])
    expect(suggestShotTypes({ shotNumber: 3, hitY: 0.45, destY: 0.6, prevType: null }))
      .toEqual(['hairpin'])
  })

  it('行き先不明 (destY null) は自打点ゾーンの広めの候補', () => {
    expect(suggestShotTypes({ shotNumber: 3, hitY: 0.05, destY: null, prevType: null }))
      .toEqual(['clear_high', 'clear_driven', 'smash', 'drop', 'cut', 'reverse_cut'])
  })

  it('レシーブ文脈 (直前スマッシュ) はレシーブ3種を候補に加える', () => {
    const out = suggestShotTypes({ shotNumber: 4, hitY: 0.05, destY: 0.95, prevType: 'smash' })
    expect(out).toContain('receive_long')
    expect(out).toContain('clear_high')
  })

  it('打点未入力はレシーブ文脈のみ / 1打目は常に空 (サーブ三択で完結)', () => {
    expect(suggestShotTypes({ shotNumber: 3, hitY: null, destY: null, prevType: 'push' }))
      .toEqual(['receive_long', 'receive_drive', 'receive_short'])
    expect(suggestShotTypes({ shotNumber: 1, hitY: 0.05, destY: 0.95, prevType: null }))
      .toEqual([])
  })
})
