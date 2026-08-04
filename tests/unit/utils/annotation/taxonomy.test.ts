/**
 * taxonomy 単体テスト — TASK-0003 / TC-109-01 ほか
 * キー→種別の固定マッピング・サーブ三択制限・レシーブ文脈・グループ分け
 */
import { describe, it, expect } from 'vitest'
import { keyToShotType, isReceiveContext, groupOf } from '~/utils/annotation/taxonomy'

describe('keyToShotType', () => {
  it('通常ショット: 数字段 + QWE の固定マッピング (REQ-007)', () => {
    expect(keyToShotType('1', 3)).toBe('clear')
    expect(keyToShotType('2', 3)).toBe('smash')
    expect(keyToShotType('3', 3)).toBe('cut')
    expect(keyToShotType('4', 3)).toBe('reverse_cut')
    expect(keyToShotType('5', 3)).toBe('drop')
    expect(keyToShotType('6', 3)).toBe('drive')
    expect(keyToShotType('7', 3)).toBe('push')
    expect(keyToShotType('8', 3)).toBe('half')
    expect(keyToShotType('9', 3)).toBe('hairpin')
    expect(keyToShotType('0', 3)).toBe('lob_high') // lob 分割 (2026-08-05)
    expect(keyToShotType('l', 3)).toBe('lob_low') // L = Low の頭文字
    expect(keyToShotType('q', 3)).toBe('receive_long')
    expect(keyToShotType('w', 3)).toBe('receive_drive')
    expect(keyToShotType('e', 3)).toBe('receive_short')
  })

  it('TC-109-01: 1打目はサーブ三択のみ受け付ける (REQ-109)', () => {
    expect(keyToShotType('s', 1)).toBe('serve_short')
    expect(keyToShotType('l', 1)).toBe('serve_long')
    expect(keyToShotType('d', 1)).toBe('serve_drive')
    // サーブ以外のキーは 1 打目では無効
    expect(keyToShotType('1', 1)).toBeNull()
    expect(keyToShotType('2', 1)).toBeNull()
    expect(keyToShotType('q', 1)).toBeNull()
  })

  it('2打目以降はサーブキーが無効 (L は lob_low に割当済みのため S/D で確認)', () => {
    expect(keyToShotType('s', 2)).toBeNull()
    expect(keyToShotType('d', 5)).toBeNull()
  })

  it('大文字入力も同じ種別に解決される', () => {
    expect(keyToShotType('Q', 3)).toBe('receive_long')
    expect(keyToShotType('S', 1)).toBe('serve_short')
  })

  it('未割当キーは null', () => {
    expect(keyToShotType('z', 3)).toBeNull()
    expect(keyToShotType(' ', 3)).toBeNull()
  })
})

describe('isReceiveContext', () => {
  it('直前がスマッシュ/プッシュ/ドライブ → true (REQ-103)', () => {
    expect(isReceiveContext('smash')).toBe(true)
    expect(isReceiveContext('push')).toBe(true)
    expect(isReceiveContext('drive')).toBe(true)
  })

  it('その他の直前種別・未注釈は false', () => {
    expect(isReceiveContext('clear')).toBe(false)
    expect(isReceiveContext('hairpin')).toBe(false)
    expect(isReceiveContext(null)).toBe(false)
  })
})

describe('groupOf', () => {
  it('UI 表示グループの対応 (ADR-017 §6 の表)', () => {
    expect(groupOf('serve_drive')).toBe('serve')
    expect(groupOf('clear')).toBe('rear')
    expect(groupOf('reverse_cut')).toBe('rear')
    expect(groupOf('drop')).toBe('rear')
    expect(groupOf('hairpin')).toBe('front')
    expect(groupOf('push')).toBe('front')
    expect(groupOf('half')).toBe('front')
    expect(groupOf('lob')).toBe('front') // レガシー
    expect(groupOf('lob_high')).toBe('front')
    expect(groupOf('lob_low')).toBe('front')
    expect(groupOf('drive')).toBe('flat')
    expect(groupOf('receive_short')).toBe('receive')
  })
})
