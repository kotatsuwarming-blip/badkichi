/**
 * useFormErrors 単体テスト (TC4-a)
 *
 * mock 戦略 (ADR-012 D4):
 *   - vi.mock('~/composables/useErrorMessage') で useErrorMessage を差し替え:
 *     errorToMessage が固定文言 'mocked_message' を返す
 *   - vi.mock('#imports') で vue の実際の ref に差し替え (reactivity を持たせる)
 *   - beforeEach で vi.clearAllMocks()
 *
 * 【テスト修正 (Green フェーズ)】:
 *   - vi.mock('~/composables/useErrorMessage') で直接 mock
 *   - vi.hoisted() で mock 変数を先に定義し TDZ エラーを回避
 *   - #imports の ref は vi.importActual('vue') を使って vue の実際の ref を取得
 *
 * 🔵 error-handling.md §6.4 + interfaces.ts §4 FormErrorsApi + TASK-0007.md TC4
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

// 【#imports mock】: useFormErrors 内の ref を vue の実際の ref に差し替える
// vi.mock ファクトリ内では ESM import が使えないため、vi.hoisted で ref を取得する形で対応
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
import { useFormErrors } from '~/composables/useFormErrors'

describe('useFormErrors', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    errorToMessageMock.mockReturnValue('mocked_message')
  })

  // ===================================================================
  // TC4-a: setFieldError で fieldErrors に文言が載り、clear で削除される
  // ===================================================================
  it('TC4-a: setFieldError で fieldErrors に文言が載り、clear(field) で当該キーが削除される', () => {
    // 【テスト目的】: useFormErrors が errorToMessage の戻りを fieldErrors state に載せ、clear で削除することを確認
    // 🔵 error-handling.md §6.4 + interfaces.ts §4 FormErrorsApi + TASK-0007.md TC4

    const { fieldErrors, setFieldError, clear } = useFormErrors()

    expect(fieldErrors.value).toEqual({}) // 【確認内容】: 初期値が空オブジェクト

    const err = { message: 'some_error' }
    setFieldError('name', err)

    expect(fieldErrors.value['name']).toBe('mocked_message') // 【確認内容】: setFieldError 後に文言が載る
    expect(errorToMessageMock).toHaveBeenCalledWith(err, undefined) // 【確認内容】: errorToMessage が正しく呼ばれる

    clear('name')

    expect(fieldErrors.value['name']).toBeUndefined() // 【確認内容】: clear('name') 後にキーが削除される
  })
})
