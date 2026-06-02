/**
 * useNoticeErrors 単体テスト (TC4-b)
 *
 * mock 戦略 (ADR-012 D4):
 *   - vi.mock('~/composables/useErrorMessage') で useErrorMessage を差し替え
 *   - vi.mock('#imports') で vue の実際の ref に差し替え
 *   - beforeEach で vi.clearAllMocks()
 *
 * 【テスト修正 (Green フェーズ)】:
 *   - vi.mock('~/composables/useErrorMessage') で直接 mock
 *   - vi.hoisted() で mock 変数を先に定義し TDZ エラーを回避
 *   - #imports の ref は importOriginal を使って vue の実際の ref を取得
 *
 * 🔵 error-handling.md §6.4 + interfaces.ts §4 NoticeErrorsApi + TASK-0007.md TC4
 */

import { beforeEach, describe, expect, it, vi } from 'vitest'

// 【vi.hoisted】: vi.mock ファクトリより先に評価される変数ブロック
const { errorToMessageMock } = vi.hoisted(() => ({
  errorToMessageMock: vi.fn(() => 'mocked_message')
}))

// 【useErrorMessage mock】: composable ファイルを直接 mock
vi.mock('~/composables/useErrorMessage', () => ({
  useErrorMessage: () => ({ errorToMessage: errorToMessageMock })
}))

// 【#imports mock】: useNoticeErrors 内の ref を vue の実際の ref に差し替える
vi.mock('#imports', async (importOriginal) => {
  const vue = await importOriginal<typeof import('vue')>()
  return {
    ref: vue.ref,
    useErrorMessage: () => ({ errorToMessage: errorToMessageMock }),
    useI18n: vi.fn(),
    useToast: vi.fn()
  }
})

// eslint-disable-next-line import/first
import { useNoticeErrors } from '~/composables/useNoticeErrors'

describe('useNoticeErrors', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    errorToMessageMock.mockReturnValue('mocked_message')
  })

  // ===================================================================
  // TC4-b: setNotice で notice に文言が載り、clear で null に戻る
  // ===================================================================
  it('TC4-b: setNotice で notice に文言が載り、clear で null になる', () => {
    // 【テスト目的】: useNoticeErrors が errorToMessage の戻りを notice state に載せ、clear で null にリセットすることを確認
    // 🔵 error-handling.md §6.4 + interfaces.ts §4 NoticeErrorsApi + TASK-0007.md TC4

    const { notice, setNotice, clear } = useNoticeErrors()

    expect(notice.value).toBeNull() // 【確認内容】: 初期値が null

    const err = { message: 'some_error' }
    setNotice(err)

    expect(notice.value).toBe('mocked_message') // 【確認内容】: setNotice 後に文言が載る
    expect(errorToMessageMock).toHaveBeenCalledWith(err, undefined) // 【確認内容】: errorToMessage が正しく呼ばれる

    clear()

    expect(notice.value).toBeNull() // 【確認内容】: clear() 後に null になる
  })
})
