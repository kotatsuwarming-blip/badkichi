// @vitest-environment happy-dom
/**
 * keyboard-target 単体テスト（fix/video-seek-focus-keys, 2026-09-26）
 * バグ再現: 動画シークバー (input[type=range]) にフォーカスが残ると
 * Space/J/K/L が全て無効になっていた → range はショートカットを通す。
 */
import { describe, expect, it } from 'vitest'
import { isTextEntryTarget } from '~/utils/keyboard-target'

function inputOf(type: string): HTMLInputElement {
  const el = document.createElement('input')
  el.type = type
  return el
}

describe('isTextEntryTarget', () => {
  it('シークバー等の非文字 input はショートカットを通す (false)', () => {
    for (const type of ['range', 'checkbox', 'radio', 'button', 'submit', 'reset', 'color']) {
      expect(isTextEntryTarget(inputOf(type)), type).toBe(false)
    }
  })

  it('文字入力系 input は弾く (true)', () => {
    for (const type of ['text', 'search', 'email', 'password', 'number', 'url', 'tel', 'date']) {
      expect(isTextEntryTarget(inputOf(type)), type).toBe(true)
    }
  })

  it('TEXTAREA / SELECT / contentEditable は弾く', () => {
    expect(isTextEntryTarget(document.createElement('textarea'))).toBe(true)
    expect(isTextEntryTarget(document.createElement('select'))).toBe(true)
    const div = document.createElement('div')
    Object.defineProperty(div, 'isContentEditable', { value: true })
    expect(isTextEntryTarget(div)).toBe(true)
  })

  it('null / 通常要素 / window は通す (false)', () => {
    expect(isTextEntryTarget(null)).toBe(false)
    expect(isTextEntryTarget(document.createElement('div'))).toBe(false)
    expect(isTextEntryTarget(document.body)).toBe(false)
  })
})
