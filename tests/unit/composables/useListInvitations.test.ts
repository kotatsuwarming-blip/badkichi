/**
 * useListInvitations 単体テスト (TC1)
 *
 * mock 戦略 (ADR-012 D4 / useCurrentGroup.test.ts 踏襲):
 *   - vi.hoisted() で selectMock / eqMock / isMock / useAsyncDataMock を先に定義 (TDZ 回避)
 *   - vi.mock('#imports') で useSupabaseClient / useAsyncData / ref を差し替え
 *   - vi.mock('#supabase-client') で Nuxt Vite transform が直接パスに変換するケースへの保険
 *   - vi.mock('#async-data') で useAsyncData を Nuxt core 実パス経由で差し替え
 *   - beforeEach で vi.clearAllMocks() + isMock.mockResolvedValue 再設定
 *
 * 【useAsyncData mock 解決方式】:
 *   handler を即時 await 実行し { data: ref(result), pending: ref(false), error: ref(null), refresh } を返す。
 *   これを忘れると data.value が常に null になり TC1 が落ちる。 🔵 (useCurrentGroup.test.ts 教訓)
 *
 * 🔵 REQ-006 / TASK-0012.md §TC1 / auth-onboarding-testcases.md TC1
 *    / interfaces.ts Invitation / note.md §5 TC1
 */

import { beforeEach, describe, expect, it, vi } from 'vitest'

// 【vi.hoisted】: vi.mock ファクトリより先に評価される mock 変数ブロック (TDZ 回避)
// vi.mock はファイル先頭にホイストされるため、vi.hoisted() 内の変数のみが参照可能
const { selectMock, eqMock, isMock, useAsyncDataMock } = vi.hoisted(() => {
  // 【isMock】: select().eq().is() チェーン末端、{ data, error } を返す
  // clearAllMocks で消えるため beforeEach で mockResolvedValue を再設定する必要がある
  const isMock = vi.fn()
  // 【eqMock】: select().eq() チェーン中間、is() を返す
  const eqMock = vi.fn().mockReturnValue({ is: isMock })
  // 【selectMock】: from().select() チェーン始端、eq() を返す
  const selectMock = vi.fn().mockReturnValue({ eq: eqMock })

  // 【useAsyncData 即時実行スタブ】:
  // handler を即時 await 実行し AsyncState 互換オブジェクトを返す。
  // 実装が useAsyncData('invitations-list:{groupId}', handler) を呼ぶと、
  // このスタブが handler() を即時解決して data.value に結果を格納する。
  // 忘れると data.value が常に null になり TC1 が落ちる。 🔵 testcases.md §7 申し送り2
  const useAsyncDataMock = vi.fn(async (_key: string, handler: () => Promise<unknown>) => {
    const { ref } = await import('vue')
    const errorRef = ref<Error | null>(null)
    let data: unknown = null
    try {
      data = await handler()
    } catch (e) {
      errorRef.value = e as Error
    }
    return {
      data: ref(data),
      pending: ref(false),
      error: errorRef,
      refresh: vi.fn()
    }
  })

  return { selectMock, eqMock, isMock, useAsyncDataMock }
})

// 【#imports mock】: Nuxt auto-import (#imports) を丸ごと差し替える
// - ref: importOriginal で vue 実物を取得（AsyncState の Ref<T> が正しく機能するため）
// - useSupabaseClient: from().select().eq().is() チェーンを返すスタブに差し替え
// - useAsyncData: handler 即時実行スタブに差し替え
vi.mock('#imports', async (importOriginal) => {
  const vue = await importOriginal<typeof import('vue')>()
  return {
    ref: vue.ref,
    useSupabaseClient: () => ({
      from: () => ({ select: selectMock })
    }),
    useAsyncData: useAsyncDataMock
  }
})

// 【#supabase-client mock】: Nuxt Vite transform が useSupabaseClient を直接パスに変換するため
// '#imports' mock だけでは効かず、安定エイリアス経由で差し替える。
// useCurrentGroup.test.ts の同アプローチを踏襲。 🔵
vi.mock(
  '#supabase-client',
  () => ({
    useSupabaseClient: () => ({
      from: () => ({ select: selectMock })
    })
  })
)

// 【#async-data mock】: Nuxt core の useAsyncData を安定エイリアス経由で差し替える。
// nuxt/dist/app/composables/asyncData.js を vitest.config.ts の alias で '#async-data' に解決する。
vi.mock(
  '#async-data',
  () => ({
    useAsyncData: useAsyncDataMock
  })
)

// eslint-disable-next-line import/first
import { useListInvitations } from '~/composables/useListInvitations'

describe('useListInvitations', () => {
  beforeEach(() => {
    // 【テスト前準備】: 各テスト実行前に全 mock 呼び出し履歴をリセット
    // 【環境初期化】: clearAllMocks で前テストの mock 状態を完全にクリアし相互干渉を防ぐ
    vi.clearAllMocks()
    // 【isMock 再設定】: clearAllMocks で消えた mockResolvedValue を beforeEach で再設定
    // clearAllMocks 後は mockResolvedValue が消えるため TC ごとに再定義が必要 🔵 testcases.md §7 申し送り4
    isMock.mockResolvedValue({ data: [{ id: 'inv1', code: 'a1b2c3d4', created_at: '2026-06-01T00:00:00Z', expires_at: '2026-06-08T00:00:00Z' }], error: null })
    // 【eqMock 再設定】: clearAllMocks で消えた mockReturnValue を再設定
    eqMock.mockReturnValue({ is: isMock })
    // 【selectMock 再設定】: clearAllMocks で消えた mockReturnValue を再設定
    selectMock.mockReturnValue({ eq: eqMock })
  })

  // ===================================================================
  // TC1: useListInvitations が group_id + deleted_at is null で絞り込み、Invitation[] を data.value に返す
  // ===================================================================
  it('TC1: useListInvitations が group_id + deleted_at is null で絞り込み、Invitation[] を data.value に返す', async () => {
    // 【テスト目的】: useListInvitations('g1') が from('group_invitations').select('id, code, created_at, expires_at')
    //              .eq('group_id','g1').is('deleted_at', null) を実行し、結果を data.value に格納すること
    // 【テスト内容】: クエリ絞り込み条件（eq + is）の引数検証 + data.value が Invitation[] で素通しされること
    // 【期待される動作】: handler が PostgREST SELECT を 1 回実行し、eq('group_id','g1') と is('deleted_at', null) で
    //                  絞り込んだ上で、返ってきた 1 件の行が Invitation[] として data.value に反映される
    // 🔵 REQ-006 / TASK-0012.md §TC1 / interfaces.ts Invitation / note.md §6 deleted_at フィルタ明示

    // 【テストデータ準備】: Invitation 型の 1 件行をシミュレート（Pick<group_invitations, 'id'|'code'|'created_at'|'expires_at'> の代表値）
    // 【初期条件設定】: isMock が { data: [...], error: null } を返す状態は beforeEach で設定済み
    const expectedInvitation = {
      id: 'inv1',
      code: 'a1b2c3d4',
      created_at: '2026-06-01T00:00:00Z',
      expires_at: '2026-06-08T00:00:00Z'
    }

    // 【実際の処理実行】: useListInvitations('g1') を呼び、useAsyncData スタブ経由で handler を即時解決する
    // 【処理内容】: handler が from('group_invitations').select('id, code, created_at, expires_at')
    //              .eq('group_id', 'g1').is('deleted_at', null) を実行
    const { data, error } = await useListInvitations('g1')

    // 【結果検証】: data.value が Invitation[] で返ること + クエリ絞り込み引数検証
    // 【期待値確認】: SELECT 列は id/code/created_at/expires_at のみ (status 列なし)、
    //              deleted_at is null でソフトデリート行を除外する (note.md §6 deleted_at フィルタ)
    expect(data.value).toEqual([expectedInvitation]) // 【確認内容】: SELECT 結果が Invitation[] として data.value にそのまま返ること 🔵
    expect(eqMock).toHaveBeenCalledWith('group_id', 'g1') // 【確認内容】: group_id 絞り込みが引数 'g1' で呼ばれること 🔵
    expect(isMock).toHaveBeenCalledWith('deleted_at', null) // 【確認内容】: deleted_at is null フィルタが明示的に呼ばれること (ソフトデリート対応) 🔵
    expect(error.value).toBeNull() // 【確認内容】: 正常経路では error.value が null であること 🔵
  })
})
