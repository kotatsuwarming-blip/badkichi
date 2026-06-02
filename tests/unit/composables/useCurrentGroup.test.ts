/**
 * useCurrentGroup 単体テスト (TC1 / TC2)
 *
 * mock 戦略 (ADR-012 D5 / use-current-group-testcases.md §2):
 *   - vi.hoisted() で fromMock / eqMock / maybeSingleMock / useAsyncDataMock / userRef を先に定義 (TDZ 回避)
 *   - vi.mock('#imports') で useSupabaseClient / useSupabaseUser / useAsyncData / ref を差し替え
 *   - vi.mock('#supabase-client') で Nuxt Vite transform が直接パスに変換する @nuxtjs/supabase mock
 *   - vi.mock('#supabase-user') で useSupabaseUser を安定エイリアス経由で差し替え
 *   - vi.mock('#async-data') で useAsyncData を Nuxt core 実パス経由で差し替え
 *   - beforeEach で vi.clearAllMocks() + maybeSingleMock.mockResolvedValue を再設定
 *
 * 【useAsyncData mock 解決方式】:
 *   useAsyncData は Nuxt core (nuxt/dist/app/composables/asyncData.js) の auto-import。
 *   '#imports' mock だけでは効かない可能性があるため、vitest.config.ts に
 *   '#async-data' alias を追加し、実パスを安定エイリアスで上書きする方式を採用。
 *   (useLogin.test.ts の #nuxt-router / #supabase-client と同じアプローチ)
 *
 *   スタブは handler を即時 await 実行し { data: ref(result), pending: ref(false), error: ref(null), refresh } を返す。
 *   これを忘れると data.value が常に null になり TC1 が落ちる。 🔵
 *
 * 🔵 REQ-005 / ADR-006 / ADR-007 / ADR-008 D4 / use-current-group-testcases.md TC1 / TC2
 */

import { beforeEach, describe, expect, it, vi } from 'vitest'

// 【vi.hoisted】: vi.mock ファクトリより先に評価される mock 変数ブロック (TDZ 回避)
// vi.mock はファイル先頭にホイストされるため、vi.hoisted() 内の変数のみが参照可能
const {
  fromMock,
  eqMock,
  maybeSingleMock,
  useAsyncDataMock,
  userRef
} = vi.hoisted(() => {
  const maybeSingleMock = vi.fn()
  const eqMock = vi.fn(() => ({ maybeSingle: maybeSingleMock }))
  // 【selectMock】: fromMock の内部で使用、テスト本体での直接参照不要のため _selectMock としてスコープを閉じる
  const _selectMock = vi.fn(() => ({ eq: eqMock }))
  const fromMock = vi.fn(() => ({ select: _selectMock }))
  const userRef = { value: { sub: 'u1' } as { sub: string } | null }

  // 【useAsyncData 即時実行スタブ】:
  // handler を即時 await 実行し AsyncState 互換オブジェクトを返す。
  // 実装が useAsyncData('current-group', handler) を呼ぶと、このスタブが
  // handler() を即時解決して data.value に結果を格納する。 🔵 testcases.md §2.3
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

  return { fromMock, eqMock, maybeSingleMock, useAsyncDataMock, userRef }
})

// 【#imports mock】: Nuxt auto-import (#imports) を丸ごと差し替える
// - ref: importOriginal で vue 実物を取得（AsyncState の Ref<T> が正しく機能するため）
// - useSupabaseClient: from().select().eq().maybeSingle() チェーンを返すスタブに差し替え
// - useSupabaseUser: userRef スタブ({ value: { sub: 'u1' } })に差し替え
// - useAsyncData: handler 即時実行スタブに差し替え
vi.mock('#imports', async (importOriginal) => {
  const vue = await importOriginal<typeof import('vue')>()
  return {
    ref: vue.ref,
    useSupabaseClient: () => ({ from: fromMock }),
    useSupabaseUser: () => userRef,
    useAsyncData: useAsyncDataMock
  }
})

// 【#supabase-client mock】: Nuxt Vite transform が useSupabaseClient を直接パスに変換するため
// '#imports' mock だけでは効かず、安定エイリアス経由で差し替える。
// useLogin.test.ts の同アプローチを踏襲。 🔵
vi.mock(
  '#supabase-client',
  () => ({
    useSupabaseClient: () => ({ from: fromMock })
  })
)

// 【#supabase-user mock】: Nuxt Vite transform が useSupabaseUser を直接パスに変換するため
// @nuxtjs/supabase の useSupabaseUser.js を安定エイリアス経由で差し替える。
vi.mock(
  '#supabase-user',
  () => ({
    useSupabaseUser: () => userRef
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
import { useCurrentGroup } from '~/composables/useCurrentGroup'

describe('useCurrentGroup', () => {
  beforeEach(() => {
    // 【テスト前準備】: 各テスト実行前に全 mock 呼び出し履歴をリセット
    // 【環境初期化】: clearAllMocks で前テストの mock 状態を完全にクリアし相互干渉を防ぐ
    vi.clearAllMocks()
    // 【userRef 初期化】: デフォルト認証済みユーザ (sub: 'u1') の状態に戻す
    // uid は user.sub (user.id ではない) - memory project_mvp_revised_scope 🔵
    userRef.value = { sub: 'u1' }
  })

  // ===================================================================
  // TC1: 所属ありユーザの SELECT 結果が data.value に反映され、uid で絞り込まれる
  // ===================================================================
  it('TC1: 所属ありユーザの SELECT 結果が data.value に反映され、eq(user_id, u1) で呼ばれる', async () => {
    // 【テスト目的】: useSupabaseUser().value.sub = 'u1' のとき、from('group_members').select().eq('user_id','u1').maybeSingle()
    //              が実行され、その data が useCurrentGroup().data.value に返ること
    // 【テスト内容】: maybeSingle が { group_id: 'g1', groups: { id: 'g1', name: 'チームA' } } を返す場合の
    //              data.value 同値検証 + eq('user_id','u1') 呼び出し引数検証
    // 【期待される動作】: handler が PostgREST SELECT を 1 回実行し、eq('user_id','u1') で絞り込み、
    //                  maybeSingle() の data をそのまま返却する。例外は発生しない。
    // 🔵 REQ-005 / ADR-006 / architecture.md §既存 API マッピング / testcases.md TC1

    // 【テストデータ準備】: 所属ありの 1 行をシミュレート
    // group_id: 'g1', groups: { id: 'g1', name: 'チームA' } は ADR-006 単数所属行の代表値
    const mockData = { group_id: 'g1', groups: { id: 'g1', name: 'チームA' } }
    // 【初期条件設定】: clearAllMocks で消えた mockResolvedValue を TC 冒頭で再設定 (testcases.md §2.4 注意5)
    maybeSingleMock.mockResolvedValue({ data: mockData, error: null })

    // 【実際の処理実行】: useCurrentGroup() を呼び、useAsyncData スタブ経由で handler を即時解決する
    // 【処理内容】: handler が from('group_members').select('group_id, groups(id, name)').eq('user_id', uid).maybeSingle() を実行
    const { data, error } = await useCurrentGroup()

    // 【結果検証】: data.value がオブジェクト同値になること + eq の引数検証
    // 【期待値確認】: handler は data をそのまま返すだけの薄いラッパ (TASK-0009.md 実装スケルトン L48-54)
    expect(data.value).toEqual(mockData) // 【確認内容】: SELECT 結果が data.value にそのまま返ること (素通し) 🔵
    expect(eqMock).toHaveBeenCalledWith('user_id', 'u1') // 【確認内容】: uid (= sub) で正しい列名・値の絞り込みが行われること 🔵
    expect(error.value).toBeNull() // 【確認内容】: 所属あり正常経路では例外が発生しないこと 🔵
  })

  // ===================================================================
  // TC2: 0 行（未所属）のとき data.value が null になり例外が発生しない
  // ===================================================================
  it('TC2: 0 行（未所属）のとき data.value が null になり例外が発生しない', async () => {
    // 【テスト目的】: maybeSingle() が { data: null, error: null }（0 行 = 未所属）を返すとき、
    //              useCurrentGroup().data.value が null になり error.value が null のまま（throw されない）であること
    // 【テスト内容】: .maybeSingle() の「0 行 → null」は PostgREST/supabase-js の正常な未所属表現
    //              本 composable は null をそのまま返す（エラーにしない）
    // 【期待される動作】: data.value === null かつ throw が発生しない (error.value が null)
    // 🔵 ADR-006（1 user = 1 group、.maybeSingle() 0 行は正常値）/ testcases.md TC2

    // 【テストデータ準備】: 0 行（未所属）をシミュレート
    // .maybeSingle() の 0 行 → { data: null, error: null } は supabase-js の正常応答
    // 【初期条件設定】: clearAllMocks で消えた mockResolvedValue を TC 冒頭で再設定
    maybeSingleMock.mockResolvedValue({ data: null, error: null })

    // 【実際の処理実行】: useCurrentGroup() を呼び、useAsyncData スタブ経由で handler を即時解決する
    // 【処理内容】: handler は data (= null) をそのまま返す。if (error) throw error の分岐は通らない
    const { data, error } = await useCurrentGroup()

    // 【結果検証】: data.value が null かつ error.value が null であること
    // 【期待値確認】: 未所属は正常値であり composable はそのまま null を返す (requirements.md §4)
    expect(data.value).toBeNull() // 【確認内容】: 未所属（0 行）が null として返ること 🔵
    expect(error.value).toBeNull() // 【確認内容】: 未所属は例外ではなく正常値なため error.value が null であること 🔵
  })
})
