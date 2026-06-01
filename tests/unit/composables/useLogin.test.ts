/**
 * useLogin 単体テスト (TC1 / TC2 / TC3)
 *
 * mock 戦略 (ADR-012 D4 / useNoticeErrors.test.ts 踏襲):
 *   - vi.hoisted() で signInWithOAuth / signOut / navigateTo / setNotice mock を先に定義 (TDZ 回避)
 *   - vi.mock('#imports') で useSupabaseClient / navigateTo / useNoticeErrors を差し替え、ref は vue 実物
 *   - vi.mock('#nuxt-router') / vi.mock('#supabase-client') で Nuxt transform が解決する
 *     実パスを安定エイリアスで上書き (vitest.config.ts に alias 定義済)
 *   - beforeEach で vi.clearAllMocks() + noticeRef.value を null に戻す
 *
 * 【mock エイリアスについて】:
 *   Nuxt Vite transform は auto-import を node_modules 内の実パスに直接変換するため、
 *   '#imports' mock だけでは一部の composable が効かないケースがある。
 *   vitest.config.ts に resolve.alias で '#nuxt-router' / '#supabase-client' を定義し、
 *   pnpm の .pnpm バージョン入りパスをテストコードから隠蔽している。
 *   パッケージ更新時は vitest.config.ts 1 箇所の alias を更新するだけで全テストが追従する。 🔵
 *
 * 🔵 REQ-001 / REQ-008 / EDGE-002 + dataflow.md §2 + interfaces.ts UseLoginReturn
 */

import { beforeEach, describe, expect, it, vi } from 'vitest'

// 【vi.hoisted】: vi.mock ファクトリより先に評価される mock 変数ブロック (TDZ 回避)
// vi.mock のコールバックは巻き上げされるため、通常の変数では TDZ エラーが発生する。
// vi.hoisted で先に評価することで、vi.mock 内から安全に参照できる。
const { signInWithOAuthMock, signOutMock, navigateToMock, setNoticeMock, noticeRef } = vi.hoisted(() => ({
  signInWithOAuthMock: vi.fn().mockResolvedValue({ error: null }),
  signOutMock: vi.fn().mockResolvedValue({ error: null }),
  navigateToMock: vi.fn(),
  setNoticeMock: vi.fn(),
  noticeRef: { value: null as string | null } // ref 互換の最小スタブ
}))

// 【#imports mock】: Nuxt auto-import (#imports) を丸ごと差し替える
// - ref: importOriginal で vue 実物を取得（pending state が Ref<boolean> として機能するため）
// - useSupabaseClient: supabase.auth の signInWithOAuth / signOut を mock に差し替え
// - navigateTo: navigateToMock に差し替え（Nuxt ルーター操作をテストで制御）
// - useNoticeErrors: notice / setNotice / clear を mock に差し替え
vi.mock('#imports', async (importOriginal) => {
  const vue = await importOriginal<typeof import('vue')>()
  return {
    ref: vue.ref,
    useSupabaseClient: () => ({
      auth: {
        signInWithOAuth: signInWithOAuthMock,
        signOut: signOutMock
      }
    }),
    navigateTo: navigateToMock,
    useNoticeErrors: () => ({
      notice: noticeRef,
      setNotice: setNoticeMock,
      clear: vi.fn()
    })
  }
})

// 【#supabase-client mock】: Nuxt Vite transform が auto-import を直接パスに変換するため
// '#imports' mock だけでは効かず、実際に呼ばれる @nuxtjs/supabase のモジュールパスを mock する。
// '#supabase-client' エイリアスは vitest.config.ts で @nuxtjs/supabase の実パスに解決される。
// useNoticeErrors.test.ts での useErrorMessage 直接 mock と同じアプローチ。 🔵
vi.mock(
  '#supabase-client',
  () => ({
    useSupabaseClient: () => ({
      auth: {
        signInWithOAuth: signInWithOAuthMock,
        signOut: signOutMock
      }
    })
  })
)

// 【#nuxt-router mock】: Nuxt Vite transform が navigateTo を Nuxt router.js に直接解決するため
// '#nuxt-router' エイリアスは vitest.config.ts で nuxt/dist/app/composables/router.js の実パスに解決される。
// importOriginal で他エクスポートを保持した上で navigateTo のみ差し替える。 🔵
vi.mock(
  '#nuxt-router',
  async (importOriginal) => {
    const original = await importOriginal<Record<string, unknown>>()
    return {
      ...original,
      navigateTo: navigateToMock
    }
  }
)

// 【useNoticeErrors mock】: composable ファイルを直接 mock（useNoticeErrors.test.ts の useErrorMessage 直接 mock 踏襲）
vi.mock('~/composables/useNoticeErrors', () => ({
  useNoticeErrors: () => ({
    notice: noticeRef,
    setNotice: setNoticeMock,
    clear: vi.fn()
  })
}))

// 【location スタブ】: useLogin.login は redirectTo を絶対 URL 化するため useRequestURL().origin を読む。
// node テスト環境には globalThis.location が無く、実 useRequestURL が new URL(globalThis.location.href) で
// 失敗するため、固定オリジンを stub する (実ブラウザ/SSR では実値が使われる)。 🔵
vi.stubGlobal('location', { href: 'http://localhost:3000/' })

// eslint-disable-next-line import/first
import { useLogin } from '~/composables/useLogin'

describe('useLogin', () => {
  beforeEach(() => {
    // 【テスト前準備】: 各テスト前にスパイ呼び出し履歴をクリアし、テスト間の相互干渉を防ぐ
    // 【環境初期化】: noticeRef.value も null に戻して TC 間で notice 状態が漏れないようにする
    vi.clearAllMocks()
    noticeRef.value = null
  })

  // ===================================================================
  // TC1: login が provider:'google' で signInWithOAuth を呼ぶ
  // ===================================================================
  it('TC1: login が Google OAuth を /confirm?redirect= 付き redirectTo で開始する', async () => {
    // 【テスト目的】: login(redirect) が Google OAuth を redirect クエリ運搬付きで 1 回開始することを確認
    // 【テスト内容】: signInWithOAuth の呼び出し回数・provider・redirectTo 部分一致を検証
    // 【期待される動作】: provider:'google' かつ options.redirectTo に '/confirm?redirect=' を含む
    // 🔵 REQ-001 / A2 + dataflow.md §2

    // 【テストデータ準備】: 成功経路のため signInWithOAuth は { error: null } を返す
    signInWithOAuthMock.mockResolvedValue({ error: null })

    const { login } = useLogin()

    // 【実際の処理実行】: 最終遷移先 '/groups/new' を渡して login を実行
    // 【処理内容】: useLogin.login が supabase.auth.signInWithOAuth を呼び OAuth フローを開始する
    await login('/groups/new')

    // 【結果検証】: signInWithOAuth が 1 回・正しい引数で呼ばれたか
    expect(signInWithOAuthMock).toHaveBeenCalledTimes(1) // 【確認内容】: 1 回だけ呼ばれること 🔵
    const arg = signInWithOAuthMock.mock.calls[0][0]
    expect(arg.provider).toBe('google') // 【確認内容】: OAuth プロバイダが google であること (REQ-001) 🔵
    expect(arg.options.redirectTo).toContain('/confirm?redirect=') // 【確認内容】: redirectTo に /confirm?redirect= が含まれること (A2 部分一致) 🔵
    expect(setNoticeMock).not.toHaveBeenCalled() // 【確認内容】: 成功経路では notice をセットしないこと 🔵
  })

  // ===================================================================
  // TC2: logout が signOut → navigateTo('/login') する
  // ===================================================================
  it('TC2: logout が signOut 成功後に /login へ遷移する（呼び出し順序保証）', async () => {
    // 【テスト目的】: logout が signOut 成功後に navigateTo('/login') を呼ぶ順序を確認
    // 【テスト内容】: signOut → navigateTo('/login') の呼び出しと順序を mock.invocationCallOrder で検証
    // 【期待される動作】: signOut が先、navigateTo('/login') が後（セッション破棄前の遷移を防ぐ）
    // 🔵 REQ-008

    // 【テストデータ準備】: 成功経路のため signOut は { error: null } を返す
    signOutMock.mockResolvedValue({ error: null })

    const { logout } = useLogin()

    // 【実際の処理実行】: ログアウト実行（引数なし）
    // 【処理内容】: useLogin.logout が supabase.auth.signOut を呼び、その後 navigateTo('/login') で遷移する
    await logout()

    // 【結果検証】: signOut と navigateTo の呼び出しと順序
    expect(signOutMock).toHaveBeenCalledTimes(1) // 【確認内容】: signOut が 1 回呼ばれること 🔵
    expect(navigateToMock).toHaveBeenCalledWith('/login') // 【確認内容】: /login を引数に navigateTo が呼ばれること 🔵
    // 【期待値確認】: signOut → navigateTo の順序保証（セッション破棄前遷移防止）
    // invocationCallOrder は Vitest が各 mock 呼び出しに付与する単調増加の連番
    expect(signOutMock.mock.invocationCallOrder[0])
      .toBeLessThan(navigateToMock.mock.invocationCallOrder[0]) // 【確認内容】: signOut が navigateTo より先に呼ばれること 🔵
    expect(setNoticeMock).not.toHaveBeenCalled() // 【確認内容】: 成功経路では notice をセットしないこと 🔵
  })

  // ===================================================================
  // TC3: Auth エラー時に notice をセットし navigateTo を呼ばない
  // ===================================================================
  it('TC3: login の Auth エラー時に setNotice され、リダイレクトは発生しない（EDGE-002）', async () => {
    // 【テスト目的】: Auth エラー時に error を setNotice へ渡し、リダイレクト副作用を起こさないことを確認
    // 【テスト内容】: signInWithOAuth が { error } を返すケースで setNotice 呼び出しと navigateTo 未呼び出しを検証
    // 【期待される動作】: setNotice(error) が呼ばれ、navigateTo は呼ばれない（EDGE-002 notice チャネル）
    // 🔵 EDGE-002

    // 【テストデータ準備】: OAuth キャンセル等を表す error を返すよう mock を上書き
    const authError = { message: 'oauth_cancelled' }
    signInWithOAuthMock.mockResolvedValue({ error: authError })

    const { login } = useLogin()

    // 【実際の処理実行】: 引数なし login（デフォルト redirect 経路も兼ねる）
    // 【処理内容】: signInWithOAuth が error を返した場合、useLogin は setNotice(error) を呼ぶ
    await login()

    // 【結果検証】: error がそのまま setNotice へ渡るか / リダイレクトしないか
    // 文言変換は useNoticeErrors 内部の useErrorMessage 責務のため、
    // useLogin は error オブジェクトをそのまま setNotice に渡すことのみ検証する（責務分離）
    expect(setNoticeMock).toHaveBeenCalledWith(authError) // 【確認内容】: error をそのまま setNotice へ渡すこと (責務分離) 🔵
    expect(navigateToMock).not.toHaveBeenCalled() // 【確認内容】: エラー時にリダイレクトしないこと 🔵
  })
})
