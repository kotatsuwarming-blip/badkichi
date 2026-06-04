/**
 * usePlayers 単体テスト (TC-001-01 / TC-001-02 / TC-NFR-001-01)
 *
 * mock 戦略 (useCurrentGroup.test.ts 確立パターンを踏襲):
 *   - vi.hoisted() で fromMock / selectMock / eqMock / isMock / orderMock /
 *     useAsyncDataMock / groupRef を先に定義 (TDZ 回避)
 *   - vi.mock('#imports') で useSupabaseClient / useAsyncData / ref を差し替え
 *   - vi.mock('#supabase-client') で useSupabaseClient を安定エイリアス経由で差し替え
 *   - vi.mock('#async-data') で useAsyncData を安定エイリアス経由で差し替え
 *   - vi.mock('~/composables/useCurrentGroup') で useCurrentGroup を差し替え
 *   - beforeEach で vi.clearAllMocks() + orderMock.mockResolvedValue を再設定 + groupRef を初期化
 *
 * 【useAsyncData mock 解決方式】:
 *   useCurrentGroup.test.ts と同じく handler を即時 await 実行し
 *   { data: ref(result), pending: ref(false), error: ref(null), refresh } を返す。
 *
 * 🔵 REQ-001 / REQ-201 / NFR-001 / EDGE-005 / usePlayers-testcases.md
 */

import { beforeEach, describe, expect, it, vi } from 'vitest'

// 【vi.hoisted】: vi.mock ファクトリより先に評価される mock 変数ブロック (TDZ 回避)
// vi.mock はファイル先頭にホイストされるため、vi.hoisted() 内の変数のみが参照可能
const {
  fromMock,
  eqMock,
  isMock,
  orderMock,
  useAsyncDataMock,
  groupRef
} = vi.hoisted(() => {
  const orderMock = vi.fn()
  // 【クエリチェーン】: usePlayers のクエリ順 from → select → eq → is → order を構築
  // 末端 orderMock が { data, error } を resolve する (TASK-0002.md 実装スケルトン参照) 🔵
  const isMock = vi.fn(() => ({ order: orderMock }))
  const eqMock = vi.fn(() => ({ is: isMock }))
  const _selectMock = vi.fn(() => ({ eq: eqMock }))
  const fromMock = vi.fn(() => ({ select: _selectMock }))

  // 【groupRef】: useCurrentGroup().data を差し替えるスタブ
  // デフォルトは group_id='g1' の所属あり状態 (beforeEach で初期化)
  const groupRef = { value: { group_id: 'g1' } as { group_id: string } | null }

  // 【useAsyncData 即時実行スタブ】:
  // handler を即時 await 実行し AsyncState 互換オブジェクトを返す。
  // useCurrentGroup.test.ts と同一実装。 🔵 usePlayers-testcases.md §5
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

  return { fromMock, eqMock, isMock, orderMock, useAsyncDataMock, groupRef }
})

// 【#imports mock】: Nuxt auto-import (#imports) を丸ごと差し替える
// - ref: importOriginal で vue 実物を取得（AsyncState の Ref<T> が正しく機能するため）
// - useSupabaseClient: from チェーンを返すスタブに差し替え
// - useAsyncData: handler 即時実行スタブに差し替え
vi.mock('#imports', async (importOriginal) => {
  const vue = await importOriginal<typeof import('vue')>()
  return {
    ref: vue.ref,
    useSupabaseClient: () => ({ from: fromMock }),
    useAsyncData: useAsyncDataMock
  }
})

// 【#supabase-client mock】: Nuxt Vite transform が useSupabaseClient を直接パスに変換するため
// '#imports' mock だけでは効かず、安定エイリアス経由で差し替える。
// useCurrentGroup.test.ts / useLogin.test.ts の同アプローチを踏襲。 🔵
vi.mock(
  '#supabase-client',
  () => ({
    useSupabaseClient: () => ({ from: fromMock })
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

// 【useCurrentGroup mock】: usePlayers が直接 import する ~/composables/useCurrentGroup を差し替え。
// useCurrentGroup.test.ts が #imports で useCurrentGroup を差し替えるのと対称的に、
// 本テストでは usePlayers の依存先 composable を vi.mock で差し替える。 🔵 usePlayers-testcases.md §5
vi.mock('~/composables/useCurrentGroup', () => ({
  useCurrentGroup: () => ({ data: groupRef })
}))

// eslint-disable-next-line import/first
import { usePlayers } from '~/composables/usePlayers'

describe('usePlayers', () => {
  beforeEach(() => {
    // 【テスト前準備】: 各テスト実行前に全 mock 呼び出し履歴をリセット
    // 【環境初期化】: clearAllMocks で前テストの mock 状態を完全にクリアし相互干渉を防ぐ
    vi.clearAllMocks()
    // 【groupRef 初期化】: デフォルト所属あり (group_id: 'g1') の状態に戻す 🔵
    groupRef.value = { group_id: 'g1' }
    // 【orderMock 初期化】: clearAllMocks で消えた mockResolvedValue を TC 冒頭で再設定
    // 末端 order が { data: [Player行], error: null } を resolve する (testcases.md §5) 🔵
    orderMock.mockResolvedValue({ data: [{ id: 'p1', name: 'A', handedness: 'right' }], error: null })
  })

  // ===================================================================
  // TC-001-01: 自 Group のみ eq(group_id) で取得する
  // ===================================================================
  it('TC-001-01: 自 Group のみ eq(group_id) で取得する', async () => {
    // 【テスト目的】: useCurrentGroup().data.value = { group_id: 'g1' } のとき、
    //              handler が from('players')→eq('group_id','g1') を実行し取得行配列を返すこと
    // 【テスト内容】: beforeEach デフォルト groupData='g1'、orderMock が 1 行 resolve
    // 【期待される動作】: SELECT 結果配列を素通しで返す (TASK-0002.md 実装スケルトン L97)
    // 🔵 REQ-001 / NFR-101 / players_select RLS

    // 【実際の処理実行】: usePlayers() → useAsyncData スタブ経由で handler を即時解決
    const { data } = await usePlayers()

    // 【結果検証】: from('players') 呼出 + eq('group_id','g1') 呼出 + 取得行配列返却
    expect(fromMock).toHaveBeenCalledWith('players') // 【確認内容】: players テーブルへの SELECT 発行 🔵
    expect(eqMock).toHaveBeenCalledWith('group_id', 'g1') // 【確認内容】: 自 Group 絞り込み列名・値の正確性 🔵
    expect(data.value).toEqual([{ id: 'p1', name: 'A', handedness: 'right' }]) // 【確認内容】: SELECT 結果素通し 🔵
  })

  // ===================================================================
  // TC-001-02: deleted_at IS NULL でフィルタし name 昇順で取得する (EDGE-005)
  // ===================================================================
  it('TC-001-02: deleted_at IS NULL でフィルタし name 昇順で取得する (EDGE-005)', async () => {
    // 【テスト目的】: group_id='g1' のとき handler が is('deleted_at', null) と order('name') を実行すること
    // 【テスト内容】: beforeEach デフォルト groupData='g1'（TC-001-01 と同じ前提）
    // 【期待される動作】: 部分インデックス対象 is('deleted_at', null) + name 昇順ソートが必ずクエリに含まれる
    // 🔵 EDGE-005 / REQ-001 / NFR-001

    // 【実際の処理実行】: usePlayers() → useAsyncData スタブ経由で handler を即時解決
    await usePlayers()

    // 【結果検証】: is('deleted_at', null) 呼出 + order('name') 呼出
    expect(isMock).toHaveBeenCalledWith('deleted_at', null) // 【確認内容】: 未削除フィルタ EDGE-005 🔵
    expect(orderMock).toHaveBeenCalledWith('name') // 【確認内容】: name 昇順ソート 🔵
  })

  // ===================================================================
  // TC-NFR-001-01: group_id 未取得は空配列を返しクエリを発行しない
  // ===================================================================
  it('TC-NFR-001-01: group_id 未取得は空配列を返しクエリを発行しない', async () => {
    // 【テスト目的】: useCurrentGroup().data.value = null のとき、
    //              handler が [] を返し from('players') が一度も呼ばれないこと
    // 【テスト内容】: groupRef.value を null に設定して未所属/未認証をシミュレート
    // 【期待される動作】: ガード if (!gid) return [] が機能し無駄なクエリを抑止する
    // 🔵 REQ-201 / NFR-001 / 未所属ガード

    // 【初期条件設定】: group_id 未取得をシミュレート (beforeEach の 'g1' を上書き)
    groupRef.value = null

    // 【実際の処理実行】: usePlayers() → useAsyncData スタブ経由で handler を即時解決
    const { data } = await usePlayers()

    // 【結果検証】: 空配列返却 + from が一度も呼ばれない
    expect(data.value).toEqual([]) // 【確認内容】: 未取得時は空配列を正常値として返す 🔵
    expect(fromMock).not.toHaveBeenCalled() // 【確認内容】: 無駄な PostgREST クエリを抑止 🔵
  })
})
