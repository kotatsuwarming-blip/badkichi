/**
 * useToastErrors 単体テスト (TC4-c)
 *
 * mock 戦略 (ADR-012 D4):
 *   - vi.mock('~/composables/useErrorMessage') で useErrorMessage を差し替え
 *     - errorToMessage: 固定文言 'mocked_message' を返す vi.fn()
 *   - vi.mock('@nuxt/ui/composables/useToast') で useToast を差し替え: { add: vi.fn() } を返す
 *   - beforeEach で vi.clearAllMocks()
 *
 * 【テスト修正 (Green フェーズ)】:
 *   - vi.mock('#imports') / vi.mock('@nuxt/ui') では useToast が差し替えられなかった
 *   - useToast の実際の解決パスは @nuxt/ui/composables/useToast (package.json exports 経由)
 *   - vi.mock('@nuxt/ui/composables/useToast') で直接 mock する
 *   - useToastErrors.ts の useToast() は showError 関数内で遅延評価するよう実装変更
 *
 * 目的: showError が toast.add({ title: 文言, color: 'error' }) を呼ぶことのみを検証。
 *
 * 🔵 error-handling.md §6.4 + interfaces.ts §4 ToastErrorsApi + TASK-0007.md TC4
 */

import { beforeEach, describe, expect, it, vi } from 'vitest'

// 【vi.hoisted】: vi.mock ファクトリより先に評価される変数ブロック
const { errorToMessageMock, toastAddMock } = vi.hoisted(() => ({
  errorToMessageMock: vi.fn(() => 'mocked_message'),
  toastAddMock: vi.fn()
}))

// 【useErrorMessage mock】: composable ファイルを直接 mock
vi.mock('~/composables/useErrorMessage', () => ({
  useErrorMessage: () => ({ errorToMessage: errorToMessageMock })
}))

// 【useToast mock】: @nuxt/ui/composables/useToast を直接 mock
// vi.mock('#imports') / vi.mock('@nuxt/ui') では実際の useToast モジュールが差し替えられなかったため、
// package.json exports で解決される @nuxt/ui/composables/useToast を直接 mock する
vi.mock('@nuxt/ui/composables/useToast', () => ({
  useToast: () => ({ add: toastAddMock })
}))

// eslint-disable-next-line import/first
import { useToastErrors } from '~/composables/useToastErrors'

describe('useToastErrors', () => {
  beforeEach(() => {
    // 【テスト前準備】: 各テスト実行前に mock 呼び出し履歴をリセット
    vi.clearAllMocks()
    errorToMessageMock.mockReturnValue('mocked_message')
  })

  // ===================================================================
  // TC4-c: showError で useToast().add が title: 文言, color: 'error' で呼ばれる
  // ===================================================================
  it('TC4-c: showError で useToast().add が { title: 文言, color: \'error\' } で 1 回呼ばれる', () => {
    // 【テスト目的】: useToastErrors が showError 時に toast.add を正しい引数で呼ぶことを確認
    // 🔵 error-handling.md §6.4 + interfaces.ts §4 ToastErrorsApi + TASK-0007.md TC4

    const { showError } = useToastErrors()
    const err = { message: 'some_error' }

    showError(err)

    expect(toastAddMock).toHaveBeenCalledTimes(1) // 【確認内容】: toast.add が 1 回だけ呼ばれる
    expect(toastAddMock).toHaveBeenCalledWith({
      title: 'mocked_message',
      color: 'error'
    }) // 【確認内容】: title に変換文言、color に Nuxt UI v4 の 'error' が設定される
    expect(errorToMessageMock).toHaveBeenCalledWith(err, undefined) // 【確認内容】: errorToMessage が err と pgContext=undefined で呼ばれる
  })
})
