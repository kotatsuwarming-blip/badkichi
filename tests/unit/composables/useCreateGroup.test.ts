/**
 * useCreateGroup 単体テスト (TC1 / TC2)
 *
 * mock 戦略 (ADR-012 D4 / useLogin.test.ts 踏襲):
 *   - vi.hoisted() で rpcMock / refreshMock / setFieldErrorMock / clearMock / fieldErrorsRef を先に定義 (TDZ 回避)
 *   - vi.mock('#imports') で useSupabaseClient / useCurrentGroup / useFormErrors を差し替え、ref は vue 実物
 *   - vi.mock('#supabase-client') で Nuxt Vite transform が直接パスに変換するケースへの保険
 *     (useLogin.test.ts と同型、alias は vitest.config.ts 定義済)
 *   - vi.mock('~/composables/useCurrentGroup') / vi.mock('~/composables/useFormErrors')
 *     で composable ファイルを直接 mock
 *   - beforeEach で vi.clearAllMocks() + fieldErrorsRef.value を {} にリセット
 *
 * 【RPC mock 解決方式】:
 *   useSupabaseClient は Nuxt Vite transform により auto-import を
 *   @nuxtjs/supabase の実パスに直接変換するため '#imports' mock だけでは効かないケースがある。
 *   '#supabase-client' alias (vitest.config.ts 定義済) 経由で安定的に mock する。
 *   useLogin.test.ts で確立済みのパターンをそのまま踏襲。 🔵
 *
 * 🔵 TASK-0010.md §単体テスト要件 / use-create-group-testcases.md TC1 / TC2
 *    / dataflow.md §3 D5-4 / interfaces.ts §5 UseCreateGroupReturn
 */

import { beforeEach, describe, expect, it, vi } from 'vitest'

// 【vi.hoisted】: vi.mock ファクトリより先に評価される mock 変数ブロック (TDZ 回避)
// vi.mock はファイル先頭にホイストされるため、vi.hoisted() 内の変数のみが参照可能
const { rpcMock, refreshMock, setFieldErrorMock, clearMock, fieldErrorsRef } = vi.hoisted(() => {
  // 【fieldErrorsRef】: ref 互換の最小スタブ (setFieldErrorMock が state 反映を再現するために使用)
  // beforeEach でリセットして TC 間 state 漏れを防ぐ
  const fieldErrorsRef = { value: {} as Record<string, string> }

  return {
    rpcMock: vi.fn(),
    refreshMock: vi.fn().mockResolvedValue(undefined),
    // 【setFieldErrorMock】: state 反映を再現し fieldErrors.value['name'] 非 undefined を成立させる
    // (field, _error) => { fieldErrorsRef.value[field] = 'mocked_message' } で TC2 の fieldErrors 検証を通す
    setFieldErrorMock: vi.fn((field: string) => { fieldErrorsRef.value[field] = 'mocked_message' }),
    clearMock: vi.fn(),
    fieldErrorsRef
  }
})

// 【#imports mock】: Nuxt auto-import (#imports) を丸ごと差し替える
// - ref: importOriginal で vue 実物を取得（pending state が Ref<boolean> として機能するため）
// - useSupabaseClient: rpc を rpcMock に差し替え
// - useCurrentGroup: refresh を refreshMock に差し替え
// - useFormErrors: fieldErrors / setFieldError / clear を mock に差し替え
vi.mock('#imports', async (importOriginal) => {
  const vue = await importOriginal<typeof import('vue')>()
  return {
    ref: vue.ref,
    useSupabaseClient: () => ({
      rpc: rpcMock
    }),
    useCurrentGroup: () => ({
      refresh: refreshMock
    }),
    useFormErrors: () => ({
      fieldErrors: fieldErrorsRef,
      setFieldError: setFieldErrorMock,
      clear: clearMock
    })
  }
})

// 【#supabase-client mock】: Nuxt Vite transform が useSupabaseClient を直接パスに変換するため
// '#imports' mock だけでは効かず、安定エイリアス経由で差し替える。
// useLogin.test.ts の同アプローチを踏襲。 🔵
vi.mock(
  '#supabase-client',
  () => ({
    useSupabaseClient: () => ({
      rpc: rpcMock
    })
  })
)

// 【useCurrentGroup 直接 mock】: composable ファイルを直接 mock
// Nuxt Vite transform が ~/composables/useCurrentGroup を直接解決する場合への対応
vi.mock('~/composables/useCurrentGroup', () => ({
  useCurrentGroup: () => ({
    refresh: refreshMock
  })
}))

// 【useFormErrors 直接 mock】: composable ファイルを直接 mock
// setFieldError / clear / fieldErrors を同じ spy で expose
vi.mock('~/composables/useFormErrors', () => ({
  useFormErrors: () => ({
    fieldErrors: fieldErrorsRef,
    setFieldError: setFieldErrorMock,
    clear: clearMock
  })
}))

// eslint-disable-next-line import/first
import { useCreateGroup } from '~/composables/useCreateGroup'

describe('useCreateGroup', () => {
  beforeEach(() => {
    // 【テスト前準備】: 各テスト実行前にスパイ呼び出し履歴をクリアし、テスト間の相互干渉を防ぐ
    // 【環境初期化】: fieldErrorsRef.value を空オブジェクトに戻し、前 TC の state 漏れを防ぐ
    vi.clearAllMocks()
    fieldErrorsRef.value = {}
    // 【refreshMock 再設定】: clearAllMocks で消えた mockResolvedValue を beforeEach で再設定
    refreshMock.mockResolvedValue(undefined)
    // 【setFieldErrorMock 再設定】: state 反映実装を clearAllMocks 後に再適用
    setFieldErrorMock.mockImplementation((field: string) => {
      fieldErrorsRef.value[field] = 'mocked_message'
    })
  })

  // ===================================================================
  // TC1: 成功 → RPC 引数検証 + refresh 呼出 + 戻り値 { data:'g1', error:null }
  // ===================================================================
  it('TC1: create 成功時に RPC を正しい引数で呼び、所属状態を refresh し、group_id を返す', async () => {
    // 【テスト目的】: create('チームA') が RPC を group_name 引数で呼び、成功後 refresh() を呼び、ActionResult を返すことを確認
    // 【テスト内容】: rpc('create_group_with_owner', { group_name:'チームA' }) 呼び出し引数 / refresh 1回 / 戻り値 { data:'g1', error:null }
    // 【期待される動作】: 成功パスの 4 契約（RPC 引数名・refresh 呼出・エラーチャネル不使用・戻り値形状）を一括検証
    // 🔵 TASK-0010.md §単体テスト要件 TC1 / use-create-group-testcases.md TC1 / dataflow.md §3 D5-4

    // 【テストデータ準備】: rpc を成功戻り値 { data:'g1', error:null } で固定する（成功パス再現）
    rpcMock.mockResolvedValue({ data: 'g1', error: null })

    // 【実際の処理実行】: useCreateGroup().create('チームA') を await
    // 【処理内容】: useCreateGroup.create が rpc('create_group_with_owner', { group_name }) を呼び、
    //             成功時に useCurrentGroup().refresh() を呼び、戻り値を返す
    const { create } = useCreateGroup()
    const result = await create('チームA')

    // 【結果検証】: rpc 引数 / refresh 呼出 / setFieldError 非呼出 / 戻り値を expect で検証
    // 【期待値確認】: dataflow.md §3 D5-4 「成功時に useCurrentGroup().refresh() を await して所属状態を最新化」
    expect(rpcMock).toHaveBeenCalledWith(
      'create_group_with_owner',
      { group_name: 'チームA' }
    ) // 【確認内容】: 引数名 group_name で RPC が呼ばれること（p_group_name は誤記） 🔵
    expect(rpcMock).toHaveBeenCalledTimes(1) // 【確認内容】: RPC が 1 回だけ呼ばれること 🔵
    expect(refreshMock).toHaveBeenCalledTimes(1) // 【確認内容】: 成功時に refresh が 1 回呼ばれること (D5-4) 🔵
    expect(setFieldErrorMock).not.toHaveBeenCalled() // 【確認内容】: 成功経路ではエラーチャネルを使わないこと 🔵
    expect(result).toEqual({ data: 'g1', error: null }) // 【確認内容】: ActionResult<string> 戻り値契約 🔵
  })

  // ===================================================================
  // TC2: invalid_group_name → setFieldError 呼出 + fieldErrors 反映 + refresh 非呼出
  // ===================================================================
  it('TC2: create が invalid_group_name エラー時に inline フィールドエラーを載せ、refresh を呼ばない', async () => {
    // 【テスト目的】: RPC が invalid_group_name を返したとき、setFieldError('name', error) で inline に載せ、
    //              refresh を呼ばないことを確認（否定アサーション）
    // 【テスト内容】: setFieldError 呼び出し / fieldErrors['name'] 非 undefined / refresh 非呼出 / 戻り値 { data:null, error }
    // 【期待される動作】: 失敗パスの 3 契約（setFieldError 呼出・fieldErrors 反映・refresh 非呼出）を検証
    // 🔵 TASK-0010.md §単体テスト要件 TC2 / use-create-group-testcases.md TC2 / REQ-109

    // 【テストデータ準備】: rpc を invalid_group_name エラーで固定する（CHECK 制約違反の二重防御再現）
    const rpcError = { message: 'invalid_group_name' }
    rpcMock.mockResolvedValue({ data: null, error: rpcError })

    // 【実際の処理実行】: useCreateGroup().create('') を await（Zod 事前検証をすり抜けた空文字の RPC 側二重防御再現）
    // 【処理内容】: useCreateGroup.create が rpc を呼び、error 戻りを受けて setFieldError('name', error) を呼ぶ
    const { create, fieldErrors } = useCreateGroup()
    const result = await create('')

    // 【結果検証】: setFieldError 呼出 / fieldErrors 反映 / refresh 非呼出 / 戻り値を expect で検証
    // 【期待値確認】: error をそのまま setFieldError へ渡す（文言変換は useFormErrors → useErrorMessage の責務、責務分離）
    expect(setFieldErrorMock).toHaveBeenCalledWith('name', rpcError) // 【確認内容】: name フィールドへ error をそのまま渡すこと (責務分離) 🔵
    expect(fieldErrors.value['name']).not.toBeUndefined() // 【確認内容】: fieldErrors['name'] に値が載ること 🔵
    expect(refreshMock).not.toHaveBeenCalled() // 【確認内容】: エラー時に refresh を呼ばないこと（否定アサーション） 🔵
    expect(result).toEqual({ data: null, error: rpcError }) // 【確認内容】: ActionResult 戻り値契約 🔵
  })
})
