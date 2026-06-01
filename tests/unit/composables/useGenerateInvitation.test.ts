/**
 * useGenerateInvitation 単体テスト (TC2 / TC3)
 *
 * mock 戦略 (ADR-012 D4 / useJoinGroup.test.ts + useToastErrors.test.ts 踏襲):
 *   - vi.hoisted() で rpcMock / refreshMock / showErrorMock / toastAddMock を先に定義 (TDZ 回避)
 *   - vi.mock('#imports') で useSupabaseClient / ref を差し替え
 *   - vi.mock('#supabase-client') で Nuxt Vite transform が直接パスに変換するケースへの保険
 *   - vi.mock('vue-i18n') で useI18n を差し替え (キー透過スタブ)
 *     ※ useI18n は vue-i18n から直接解決されるため #imports mock では効かない
 *       (useErrorMessage.test.ts / useJoinGroup.test.ts で確立済みのパターン)
 *   - vi.mock('@nuxt/ui/composables/useToast') で useToast を差し替え
 *     ※ useToast は @nuxt/ui/composables/useToast から直接解決されるため #imports mock では効かない
 *       (useToastErrors.test.ts で確立済みのパターン)
 *   - vi.mock('~/composables/useToastErrors') で useToastErrors を直接 mock
 *     ※ useToastErrors は ~/composables/useToastErrors.ts から直接解決されるため #imports mock では効かない
 *       (useCreateGroup.test.ts の useCurrentGroup / useFormErrors 直接 mock と同型) 🔵
 *   - vi.mock('~/composables/useListInvitations') で composable ファイルを直接 mock
 *     (useCreateGroup.test.ts の useCurrentGroup 直接 mock と同型) 🔵
 *   - beforeEach で vi.clearAllMocks() + refreshMock.mockResolvedValue 再設定
 *
 * 【i18n キー透過スタブ】:
 *   useI18n: () => ({ t: (key: string) => key }) で t をキー透過スタブにする。
 *   成功 toast の title が i18n キー文字列 'groups.settings.invitationGenerated' で
 *   アサートできる。 🔵 testcases.md §7 申し送り1
 *
 * 【useListInvitations refresh 検証】:
 *   generate が同一 groupId で useListInvitations('g1') を呼び、その refresh スパイが
 *   叩かれることをアサートして D5-4 同一キー refresh を代替検証する。
 *   (キー一致の機能的検証は mock では直接見えないため) 🔵 testcases.md §7 申し送り3
 *
 * 🔵 REQ-007 / REQ-110 / TASK-0012.md §TC2/TC3 / auth-onboarding-testcases.md TC2/TC3
 *    / dataflow.md §5 D5-4 / error-handling.md §6.5 代表例 #5
 */

import { beforeEach, describe, expect, it, vi } from 'vitest'

// 【vi.hoisted】: vi.mock ファクトリより先に評価される mock 変数ブロック (TDZ 回避)
// vi.mock はファイル先頭にホイストされるため、vi.hoisted() 内の変数のみが参照可能
const { rpcMock, refreshMock, showErrorMock, toastAddMock } = vi.hoisted(() => ({
  rpcMock: vi.fn(),
  // 【refreshMock】: useListInvitations().refresh スパイ
  // clearAllMocks で消えるため beforeEach で mockResolvedValue を再設定する必要がある
  refreshMock: vi.fn().mockResolvedValue(undefined),
  showErrorMock: vi.fn(),
  toastAddMock: vi.fn()
}))

// 【#imports mock】: Nuxt auto-import を差し替える (ref + useSupabaseClient のみ)
// - ref: importOriginal で vue 実物を取得（pending state が Ref<boolean> として機能するため）
// - useSupabaseClient: rpc を rpcMock に差し替え
// - useI18n / useToastErrors / useToast は #imports では効かないため個別 mock で対処
vi.mock('#imports', async (importOriginal) => {
  const vue = await importOriginal<typeof import('vue')>()
  return {
    ref: vue.ref,
    useSupabaseClient: () => ({
      rpc: rpcMock
    })
  }
})

// 【#supabase-client mock】: Nuxt Vite transform が useSupabaseClient を直接パスに変換するため
// '#imports' mock だけでは効かず、安定エイリアス経由で差し替える。
// useCreateGroup.test.ts の同アプローチを踏襲。 🔵
vi.mock(
  '#supabase-client',
  () => ({
    useSupabaseClient: () => ({
      rpc: rpcMock
    })
  })
)

// 【vue-i18n mock】: useI18n の t をキー透過スタブにする
// useI18n は vue-i18n から直接解決されるため #imports mock では効かない。
// useErrorMessage.test.ts / useJoinGroup.test.ts で確立済みのパターンを踏襲。 🔵
// t はキー透過スタブ → 成功 toast の title が 'groups.settings.invitationGenerated' でアサート可能
vi.mock('vue-i18n', () => ({
  useI18n: () => ({ t: (key: string) => key })
}))

// 【@nuxt/ui/composables/useToast mock】: useToast を差し替え
// useToast は @nuxt/ui/composables/useToast から直接解決されるため #imports mock では効かない。
// useToastErrors.test.ts で確立済みのパターンを踏襲。 🔵
vi.mock('@nuxt/ui/composables/useToast', () => ({
  useToast: () => ({ add: toastAddMock })
}))

// 【useToastErrors 直接 mock】: composable ファイルを直接 mock
// useToastErrors は ~/composables/useToastErrors.ts から直接解決されるため #imports mock では効かない。
// useCreateGroup.test.ts の useCurrentGroup / useFormErrors 直接 mock と同型。 🔵
vi.mock('~/composables/useToastErrors', () => ({
  useToastErrors: () => ({
    showError: showErrorMock
  })
}))

// 【useListInvitations 直接 mock】: composable ファイルを直接 mock
// Nuxt Vite transform が ~/composables/useListInvitations を直接解決する場合への対応
// useCreateGroup.test.ts の useCurrentGroup 直接 mock と同型 🔵
vi.mock('~/composables/useListInvitations', () => ({
  useListInvitations: (_groupId: string) => ({
    refresh: refreshMock
  })
}))

// eslint-disable-next-line import/first
import { useGenerateInvitation } from '~/composables/useGenerateInvitation'

describe('useGenerateInvitation', () => {
  beforeEach(() => {
    // 【テスト前準備】: 各テスト実行前に全 mock 呼び出し履歴をリセット
    // 【環境初期化】: clearAllMocks で前テストの mock 状態を完全にクリアし相互干渉を防ぐ
    vi.clearAllMocks()
    // 【refreshMock 再設定】: clearAllMocks で消えた mockResolvedValue を beforeEach で再設定
    refreshMock.mockResolvedValue(undefined)
  })

  // ===================================================================
  // TC2: generate 成功 → RPC 引数検証 + refresh 呼出 + 成功 toast 表示
  // ===================================================================
  it('TC2: generate 成功時に RPC を正しい引数で呼び、refresh を呼び、成功 toast を出す', async () => {
    // 【テスト目的】: generate('g1') が rpc('generate_invitation_code', { target_group_id: 'g1' }) を呼び、
    //              成功後に useListInvitations('g1').refresh() と toast.add(成功 toast) を呼ぶことを確認
    // 【テスト内容】: RPC 引数名 target_group_id の確認 / refresh 1 回呼出 / 成功 toast i18n キー確認 / showError 非呼出
    // 【期待される動作】: 成功パスの 4 契約
    //   (RPC 引数名 target_group_id / refresh 呼出 D5-4 / 成功 toast が i18n キー由来 NFR-204 / showError 非呼出) を一括検証
    // 🔵 REQ-007 / TASK-0012.md §TC2 / dataflow.md §5 D5-4 / NFR-204

    // 【テストデータ準備】: rpc を成功戻り値 { data: 'a1b2c3d4', error: null } で固定する（成功パス再現）
    // 【初期条件設定】: 'a1b2c3d4' は RPC が返す 8 hex 招待コードの代表値 (data-foundation CSPRNG 出力形式)
    rpcMock.mockResolvedValue({ data: 'a1b2c3d4', error: null })

    // 【実際の処理実行】: useGenerateInvitation().generate('g1') を await
    // 【処理内容】: generate が rpc('generate_invitation_code', { target_group_id: 'g1' }) を呼び、
    //             成功時に useListInvitations('g1').refresh() を呼び、成功 toast を出す
    const { generate } = useGenerateInvitation()
    const result = await generate('g1')

    // 【結果検証】: rpc 引数 / refresh 呼出 / 成功 toast / showError 非呼出 / 戻り値を expect で検証
    // 【期待値確認】: dataflow.md §5 D5-4 「成功時に useListInvitations(groupId).refresh() で一覧キャッシュ更新」
    expect(rpcMock).toHaveBeenCalledWith(
      'generate_invitation_code',
      { target_group_id: 'g1' }
    ) // 【確認内容】: 引数名 target_group_id で RPC が呼ばれること（p_target_group_id 等の誤記でない） 🔵
    expect(rpcMock).toHaveBeenCalledTimes(1) // 【確認内容】: RPC が 1 回だけ呼ばれること 🔵
    expect(refreshMock).toHaveBeenCalledTimes(1) // 【確認内容】: 成功時に useListInvitations('g1').refresh が 1 回呼ばれること (D5-4) 🔵
    expect(toastAddMock).toHaveBeenCalledWith({
      title: 'groups.settings.invitationGenerated'
    }) // 【確認内容】: 成功 toast の title が i18n キー由来であること（t がキー透過スタブのためキー文字列でアサート、NFR-204） 🔵
    expect(showErrorMock).not.toHaveBeenCalled() // 【確認内容】: 成功経路で showError を使わないこと 🔵
    expect(result).toEqual({ data: 'a1b2c3d4', error: null }) // 【確認内容】: ActionResult<string> 戻り値契約 🔵
  })

  // ===================================================================
  // TC3: not_a_member → showError(error) / refresh と成功 toast は呼ばれない
  // ===================================================================
  it('TC3: not_a_member エラー時に showError(error) を呼び、refresh と成功 toast を呼ばない', async () => {
    // 【テスト目的】: generate('g1') が not_a_member エラー時に showError(error) で一過性 toast に流し、
    //              refresh と成功 toast を呼ばないことを確認（否定アサーション）
    // 【テスト内容】: showError 呼出 + error 素通し確認 / refresh 非呼出 / 成功 toast 非呼出 / 戻り値形状
    // 【期待される動作】: 失敗パスのエラーチャネル分岐
    //   (showError で一過性 toast チャネル / 成功パス副作用ゼロ) を検証
    // 🔵 REQ-110 / TASK-0012.md §TC3 / error-handling.md §6.5 代表例 #5

    // 【テストデータ準備】: rpc を not_a_member エラーで固定する（非メンバーユーザの権限拒否再現）
    // 【初期条件設定】: error.message が 'not_a_member' は RLS / RPC 内権限チェックで拒否された場合の識別子
    const rpcError = { message: 'not_a_member' }
    rpcMock.mockResolvedValue({ data: null, error: rpcError })

    // 【実際の処理実行】: useGenerateInvitation().generate('g1') を await
    // 【処理内容】: generate が rpc を呼び、error 戻りを受けて showError(error) を呼ぶ
    //             refresh と成功 toast は呼ばない
    const { generate } = useGenerateInvitation()
    const result = await generate('g1')

    // 【結果検証】: showError 呼出 + 引数素通し / refresh 非呼出 / 成功 toast 非呼出 / 戻り値
    // 【期待値確認】: composable は文言変換せず error をそのまま showError へ渡す
    //              （文言変換は useToastErrors → useErrorMessage → errors.not_a_member の責務、責務分離）
    expect(showErrorMock).toHaveBeenCalledWith(rpcError) // 【確認内容】: error を素通しで showError へ渡すこと (責務分離) 🔵
    expect(refreshMock).not.toHaveBeenCalled() // 【確認内容】: エラー時に refresh を呼ばないこと（否定アサーション） 🔵
    expect(toastAddMock).not.toHaveBeenCalled() // 【確認内容】: エラー時に成功 toast を出さないこと（否定アサーション） 🔵
    expect(result).toEqual({ data: null, error: rpcError }) // 【確認内容】: ActionResult<string> エラー時の戻り値契約 🔵
  })
})
