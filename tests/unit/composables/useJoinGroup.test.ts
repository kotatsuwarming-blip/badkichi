/**
 * useJoinGroup 単体テスト (TC1 / TC2 / TC3 / TC4)
 *
 * mock 戦略 (方式 A: useNoticeErrors / useErrorMessage は実物、useI18n のみ mock):
 *   - vi.hoisted() で rpcMock / refreshMock / tFn / teFn を先に定義 (TDZ 回避)
 *   - vi.mock('vue-i18n') で useI18n の t/te を制御 (t はキー透過 / te は常に false)
 *     → notice.value を 'errors.xxx' キー文字列で検証可能にする
 *   - vi.mock('@sentry/nuxt') で captureException をスパイ
 *     → TC2 で「詰め替え成功 → Sentry 非報告」を二重証明
 *   - vi.mock('#imports') で ref は vue 実物を維持、useSupabaseClient / useCurrentGroup のみ差し替え
 *     useNoticeErrors / useErrorMessage は #imports から out しない (実物を使う)
 *   - vi.mock('#supabase-client') で Nuxt Vite transform 対応 (useCreateGroup.test.ts 踏襲)
 *   - vi.mock('~/composables/useCurrentGroup') で composable ファイル直接 mock
 *   - beforeEach で vi.clearAllMocks()
 *
 * 【方式 A を採用する理由 (EDGE-005 の核心)】:
 *   DB メッセージ 'invitation_not_found' と App 識別子 'invitation_not_found_by_link' は文字列が異なる。
 *   isAppError は message.includes(code) で判定するため
 *   'invitation_not_found'.includes('invitation_not_found_by_link') === false。
 *   詰め替えをしないと fallthrough して errors.generic + Sentry になる。
 *   方式 A は notice.value の実解決結果を直接 assert できるため、詰め替えの成否を明確に区別できる。
 *
 * 🔵 TASK-0011.md §単体テスト要件 / use-join-group-testcases.md TC1〜TC4 / architecture.md 注2 (EDGE-005)
 */

import { beforeEach, describe, expect, it, vi } from 'vitest'
import * as Sentry from '@sentry/nuxt'

// 【vi.hoisted】: vi.mock ファクトリより先に評価される mock 変数ブロック (TDZ 回避)
const { rpcMock, refreshMock, tFn, teFn } = vi.hoisted(() => ({
  rpcMock: vi.fn(),
  refreshMock: vi.fn().mockResolvedValue(undefined),
  // 【tFn】: t はキー透過 → notice.value が 'errors.xxx' キー文字列になる
  tFn: vi.fn((key: string) => key),
  // 【teFn】: te は常に false (App 識別子は te を使わない)
  teFn: vi.fn((_key: string) => false)
}))

// 【vue-i18n mock】: useI18n の t / te を制御可能にする
// useErrorMessage は vue-i18n 直接 import で useI18n を解決するため、#imports mock では効かない
// useErrorMessage.test.ts で確立済みの同方式を踏襲 🔵
vi.mock('vue-i18n', () => ({
  useI18n: () => ({ t: tFn, te: teFn })
}))

// 【Sentry mock】: captureException をスパイで差し替え
// TC2 で「詰め替え成功 = Sentry 非報告」を担保するために必要
vi.mock('@sentry/nuxt', () => ({
  captureException: vi.fn()
}))

// 【#imports mock】: Nuxt auto-import を差し替える
// - ref: importOriginal で vue 実物を取得 (notice / pending が Ref<T> として機能するため)
// - useSupabaseClient: rpc を rpcMock に差し替え
// - useCurrentGroup: refresh を refreshMock に差し替え
// - useNoticeErrors / useErrorMessage は含めない (実物を使う = 方式 A の肝)
vi.mock('#imports', async (importOriginal) => {
  const vue = await importOriginal<typeof import('vue')>()
  return {
    ref: vue.ref,
    useSupabaseClient: () => ({
      rpc: rpcMock
    }),
    useCurrentGroup: () => ({
      refresh: refreshMock
    })
  }
})

// 【#supabase-client mock】: Nuxt Vite transform が useSupabaseClient を直接パスに変換するため
// '#imports' mock だけでは効かないケースへの保険。useCreateGroup.test.ts 同型。 🔵
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

// composable の import は mock 設定後に行う
// eslint-disable-next-line import/first
import { useJoinGroup } from '~/composables/useJoinGroup'

describe('useJoinGroup', () => {
  beforeEach(() => {
    // 【テスト前準備】: 各テスト実行前に全 mock の呼び出し履歴をクリアし TC 間の相互干渉を防ぐ
    // 【環境初期化】: refreshMock / t のキー透過 / te の false を再設定する
    vi.clearAllMocks()
    refreshMock.mockResolvedValue(undefined)
    tFn.mockImplementation((key: string) => key)
    teFn.mockReturnValue(false)
  })

  // ===================================================================
  // TC1: 成功 → RPC 引数検証 + refresh 呼出 + notice は null のまま
  // ===================================================================
  it('TC1: join 成功時に RPC を正しい引数で呼び、所属状態を refresh し、notice を null に保ち group_id を返す', async () => {
    // 【テスト目的】: join('abcd1234') が RPC を invite_code 引数で呼び、成功後 refresh() を呼び、
    //              notice を null に保ち、ActionResult を返すことを確認
    // 【テスト内容】: rpc('join_group_with_code', { invite_code:'abcd1234' }) 呼び出し引数 / refresh 1回 /
    //              notice null / 戻り値 { data:'g1', error:null }
    // 【期待される動作】: 成功パスの 4 契約（RPC 引数名・refresh 呼出・通知未使用・戻り値形状）を一括検証
    // 🔵 TASK-0011.md §単体テスト要件 TC1 / use-join-group-testcases.md TC1 / dataflow.md §4 D5-4

    // 【テストデータ準備】: rpc を成功戻り値 { data:'g1', error:null } で固定する（成功パス再現）
    rpcMock.mockResolvedValue({ data: 'g1', error: null })

    // 【実際の処理実行】: useJoinGroup().join('abcd1234') を await
    // 【処理内容】: useJoinGroup.join が rpc('join_group_with_code', { invite_code }) を呼び、
    //             成功時に useCurrentGroup().refresh() を呼び、戻り値を返す
    const { join, notice } = useJoinGroup()
    const result = await join('abcd1234')

    // 【結果検証】: RPC 引数 / refresh 呼出 / notice null / 戻り値を expect で検証
    // 【期待値確認】: dataflow.md §4 D5-4「成功時に useCurrentGroup().refresh() を await して所属状態を最新化」
    expect(rpcMock).toHaveBeenCalledWith(
      'join_group_with_code',
      { invite_code: 'abcd1234' }
    ) // 【確認内容】: 引数名 invite_code で RPC が呼ばれること（p_invite_code 等は誤記） 🔵
    expect(rpcMock).toHaveBeenCalledTimes(1) // 【確認内容】: RPC が 1 回だけ呼ばれること 🔵
    expect(refreshMock).toHaveBeenCalledTimes(1) // 【確認内容】: 成功時に refresh が 1 回呼ばれること (D5-4) 🔵
    expect(notice.value).toBeNull() // 【確認内容】: 成功時 notice は null（エラーチャネル不使用） 🔵
    expect(result).toEqual({ data: 'g1', error: null }) // 【確認内容】: ActionResult<string> 戻り値契約 🔵
  })

  // ===================================================================
  // TC2【核心】: DB 'invitation_not_found' → 明示変換で INVITATION_NOT_FOUND_BY_LINK に詰め替え
  //             notice に正しい文言解決、Sentry 非報告、refresh 非呼出
  // ===================================================================
  it('TC2: DB が invitation_not_found を返したとき明示変換で INVITATION_NOT_FOUND_BY_LINK に詰め替え、notice が errors.invitation_not_found_by_link に解決され refresh を呼ばない', async () => {
    // 【テスト目的】: DB メッセージ 'invitation_not_found' と App 識別子 'invitation_not_found_by_link' の
    //              文字列不一致（EDGE-005）を useJoinGroup の明示変換で吸収することを確認
    // 【テスト内容】: notice.value が 'errors.invitation_not_found_by_link' に解決される /
    //              'errors.generic' でない（fallthrough していない）/ Sentry 非報告 / refresh 非呼出
    // 【期待される動作】: EDGE-005 明示変換ロジックが機能し、ユーザに正しいエラー文言が表示される
    //              （詰め替えが失敗すると errors.generic になり Sentry 報告される = 本 TC が失敗する）
    // 🔵 TASK-0011.md §単体テスト要件 TC2 / use-join-group-testcases.md TC2 / architecture.md 注2 / EDGE-005

    // 【テストデータ準備】: rpc を DB 生メッセージ 'invitation_not_found' のエラーで固定
    // 'invitation_not_found' は 'invitation_not_found_by_link' を includes しないため
    // 詰め替え前は isAppError で INVITATION_NOT_FOUND_BY_LINK に一致しない
    rpcMock.mockResolvedValue({ data: null, error: { message: 'invitation_not_found' } })

    // 【実際の処理実行】: useJoinGroup().join('badcode') を await
    const { join, notice } = useJoinGroup()
    const result = await join('badcode')

    // 【結果検証】: notice が詰め替え後キーに解決 / generic 否定 / Sentry 非報告 / refresh 非呼出
    expect(notice.value).toBe('errors.invitation_not_found_by_link') // 【確認内容】: 詰め替え成功で正しいキーに解決（核心） 🔵
    expect(notice.value).not.toBe('errors.generic') // 【確認内容】: fallthrough していない（核心の否定証明） 🔵
    expect(vi.mocked(Sentry.captureException)).not.toHaveBeenCalled() // 【確認内容】: 詰め替え成功 = fallthrough なし = Sentry 非報告 🔵
    expect(refreshMock).not.toHaveBeenCalled() // 【確認内容】: エラー時に refresh を呼ばない 🔵
    expect(result).toEqual({ data: null, error: { message: 'invitation_not_found' } }) // 【確認内容】: 戻り値の error は元のまま（詰め替えは setNotice 用、戻り値は変えない） 🔵
  })

  // ===================================================================
  // TC3: 'already_in_group' → ALREADY_IN_GROUP notice、refresh 非呼出
  // ===================================================================
  it('TC3: DB が already_in_group を返したとき詰め替え不要で notice が errors.already_in_group に解決され refresh を呼ばない', async () => {
    // 【テスト目的】: 'already_in_group' は App 識別子 ALREADY_IN_GROUP と文字列一致するため
    //              詰め替え不要で notice が正しい文言に解決されることを確認
    // 【テスト内容】: notice.value === 'errors.already_in_group' / Sentry 非報告 / refresh 非呼出
    // 【期待される動作】: 文字列一致パス（詰め替え不要）で ALREADY_IN_GROUP 分岐に一致し、
    //              ja.json の「すでにグループに参加しています」相当のキーが返る
    //              （TC2 と異なり明示変換不要のパス / 明示変換が 'already_in_group' を誤って巻き込まないことも確認）
    // 🔵 TASK-0011.md §単体テスト要件 TC3 / use-join-group-testcases.md TC3 / error-codes.ts ALREADY_IN_GROUP

    // 【テストデータ準備】: rpc を 'already_in_group' エラーで固定
    rpcMock.mockResolvedValue({ data: null, error: { message: 'already_in_group' } })

    // 【実際の処理実行】: useJoinGroup().join('code') を await
    const { join, notice } = useJoinGroup()
    const result = await join('code')

    // 【結果検証】: notice が対応キーに解決 / Sentry 非報告 / refresh 非呼出 / 戻り値を検証
    expect(notice.value).toBe('errors.already_in_group') // 【確認内容】: 文字列一致パスで ALREADY_IN_GROUP 分岐に解決 🔵
    expect(vi.mocked(Sentry.captureException)).not.toHaveBeenCalled() // 【確認内容】: マッピング済のため Sentry 非報告 🔵
    expect(refreshMock).not.toHaveBeenCalled() // 【確認内容】: エラー時に refresh を呼ばない 🔵
    expect(result).toEqual({ data: null, error: { message: 'already_in_group' } }) // 【確認内容】: ActionResult 戻り値契約 🔵
  })

  // ===================================================================
  // TC4: 'invitation_expired' → INVITATION_EXPIRED notice、refresh 非呼出
  // ===================================================================
  it('TC4: DB が invitation_expired を返したとき詰め替え不要で notice が errors.invitation_expired に解決され refresh を呼ばない', async () => {
    // 【テスト目的】: 'invitation_expired' は App 識別子 INVITATION_EXPIRED と文字列一致するため
    //              詰め替え不要で notice が正しい文言に解決されることを確認
    // 【テスト内容】: notice.value === 'errors.invitation_expired' / Sentry 非報告 / refresh 非呼出
    // 【期待される動作】: 文字列一致パス（詰め替え不要）で INVITATION_EXPIRED 分岐に一致し、
    //              ja.json の「招待コードの有効期限が切れています」相当のキーが返る
    // 🔵 TASK-0011.md §単体テスト要件 TC4 / use-join-group-testcases.md TC4 / error-codes.ts INVITATION_EXPIRED

    // 【テストデータ準備】: rpc を 'invitation_expired' エラーで固定
    rpcMock.mockResolvedValue({ data: null, error: { message: 'invitation_expired' } })

    // 【実際の処理実行】: useJoinGroup().join('code') を await
    const { join, notice } = useJoinGroup()
    const result = await join('code')

    // 【結果検証】: notice が対応キーに解決 / Sentry 非報告 / refresh 非呼出 / 戻り値を検証
    expect(notice.value).toBe('errors.invitation_expired') // 【確認内容】: 文字列一致パスで INVITATION_EXPIRED 分岐に解決 🔵
    expect(vi.mocked(Sentry.captureException)).not.toHaveBeenCalled() // 【確認内容】: マッピング済のため Sentry 非報告 🔵
    expect(refreshMock).not.toHaveBeenCalled() // 【確認内容】: エラー時に refresh を呼ばない 🔵
    expect(result).toEqual({ data: null, error: { message: 'invitation_expired' } }) // 【確認内容】: ActionResult 戻り値契約 🔵
  })
})
