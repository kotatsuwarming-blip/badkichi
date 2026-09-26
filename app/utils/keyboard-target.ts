/**
 * keyboard-target — グローバルキーハンドラの対象判定（fix/video-seek-focus-keys, 2026-09-26）
 *
 * 記録・注釈・動画のショートカットは window の keydown を拾うが、
 * テキスト入力中のキーを奪ってはいけない。従来の「tagName === 'INPUT' なら無視」は
 * 動画シークバー（input[type=range]）まで弾いてしまい、シーク操作後にフォーカスが
 * range に残ると Space（打った/打点）や J/L（10秒送り）が全て効かなくなるバグの原因だった。
 * 文字入力を受け付ける対象だけを正確に弾く。
 *
 * スタイル: セミコロンなし / no comma dangle
 */

/** 文字入力を受け付けない input type（グローバルショートカットを通してよい） */
const NON_TEXT_INPUT_TYPES = new Set(['range', 'checkbox', 'radio', 'button', 'submit', 'reset', 'color'])

/**
 * グローバルショートカットを無視すべき対象か。
 * true = テキスト入力中（TEXTAREA / contentEditable / SELECT / 文字入力系 INPUT）。
 * input[type=range]（動画シークバー等）は false = ショートカットを通す。
 */
export function isTextEntryTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false
  if (target.isContentEditable) return true
  if (target.tagName === 'TEXTAREA' || target.tagName === 'SELECT') return true
  if (target instanceof HTMLInputElement) return !NON_TEXT_INPUT_TYPES.has(target.type)
  return false
}
