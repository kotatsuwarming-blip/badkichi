/**
 * auth.global.ts middleware 単体テスト (TC1〜TC7 / ADR-008 D8 7 分岐)
 *
 * mock 戦略 (TASK-0013.md §単体テスト要件 / useLogin.test.ts 踏襲):
 *   - defineNuxtRouteMiddleware を恒等関数 mock ((fn) => fn) し、default export を
 *     「to を引数に取る async 関数」として直接呼び出す
 *   - useSupabaseUser: { value: null } | { value: <user> } を返す mock (1 段ネスト)
 *   - useCurrentGroup: { data: { value: null } } | { data: { value: <group> } } を返す mock (2 段ネスト)
 *     ⚠️ useSupabaseUser({value}) と useCurrentGroup({data:{value}}) のネスト差に注意
 *   - navigateTo: vi.fn() でスパイ
 *   - beforeEach(vi.clearAllMocks()) でテスト間隔離
 * 🔵 ADR-008 D8 + REQ-101/102/103/108 + dataflow.md §1
 */

import { beforeEach, describe, expect, it, vi } from 'vitest'

// 【vi.hoisted】: vi.mock ファクトリより先に評価される mock 変数ブロック (TDZ 回避)
// vi.mock はファイル先頭にホイストされるため、通常の変数では TDZ エラーが発生する。
// vi.hoisted で先に評価することで、vi.mock 内から安全に参照できる。
const { navigateToMock, userRef, currentGroupRef, useCurrentGroupMock } = vi.hoisted(() => {
  // 【navigateTo spy】: リダイレクト発火の有無・引数を検証するスパイ
  const navigateToMock = vi.fn()

  // 【userRef】: useSupabaseUser の戻り値スタブ
  // ⚠️ 1 段ネスト: { value: User | null } — useCurrentGroup の { data: { value } } と混同しないこと
  const userRef = { value: null as { sub: string } | null }

  // 【currentGroupRef】: useCurrentGroup.data の値スタブ
  // ⚠️ 2 段ネスト: useCurrentGroup は { data: { value } } を返す
  const currentGroupRef = { value: null as { group_id: string, groups: { id: string, name: string } | null } | null }

  // 【useCurrentGroupMock】: useCurrentGroup() を即時解決する mock
  // await useCurrentGroup() → { data: currentGroupRef } を同期的に返す
  const useCurrentGroupMock = vi.fn(() => Promise.resolve({ data: currentGroupRef }))

  return { navigateToMock, userRef, currentGroupRef, useCurrentGroupMock }
})

// 【#imports mock】: Nuxt auto-import (#imports) を丸ごと差し替える
// - defineNuxtRouteMiddleware: 恒等関数 (fn) => fn として mock し、
//   「fn を wrap せずそのまま返す」ことで default export が直接呼び出し可能になる
// - useSupabaseUser: userRef スタブを返す (1 段ネスト)
// - useCurrentGroup: useCurrentGroupMock (即時解決) に差し替え
// - navigateTo: navigateToMock スパイに差し替え
vi.mock('#imports', () => ({
  defineNuxtRouteMiddleware: (fn: (to: unknown) => unknown) => fn,
  useSupabaseUser: () => userRef,
  useCurrentGroup: useCurrentGroupMock,
  navigateTo: navigateToMock
}))

// 【#nuxt-router mock】: Nuxt Vite transform が defineNuxtRouteMiddleware / navigateTo を
// Nuxt router.js に直接解決するため、安定エイリアス経由で差し替える。
// useLogin.test.ts と同じアプローチ。
// importOriginal で他エクスポートを保持した上で必要なもののみ差し替える。 🔵
vi.mock(
  '#nuxt-router',
  async (importOriginal) => {
    const original = await importOriginal<Record<string, unknown>>()
    return {
      ...original,
      defineNuxtRouteMiddleware: (fn: (to: unknown) => unknown) => fn,
      navigateTo: navigateToMock
    }
  }
)

// 【#supabase-user mock】: Nuxt Vite transform が useSupabaseUser を
// @nuxtjs/supabase の実パスに直接解決するため、安定エイリアス経由で差し替える。
// useCurrentGroup.test.ts と同じアプローチ。 🔵
vi.mock(
  '#supabase-user',
  () => ({
    useSupabaseUser: () => userRef
  })
)

// 【useCurrentGroup composable mock】: composable ファイルを直接 mock
// useCurrentGroup.test.ts の useAsyncData 即時 mock と対称的に、
// middleware から呼ばれる composable を差し替える
vi.mock('~/composables/useCurrentGroup', () => ({
  useCurrentGroup: useCurrentGroupMock
}))

// eslint-disable-next-line import/first
import middleware from '~/middleware/auth.global'

// 【スタブ値定義】: テスト本体で使い回す固定スタブ
// X: 認証済ユーザの最小スタブ (uid は user.sub — memory project_mvp_revised_scope)
const userX = { sub: 'uid-x' }
// G: 所属済 Group の最小スタブ
const groupG = { group_id: 'g1', groups: { id: 'g1', name: 'TeamA' } }

describe('auth.global middleware (TC1〜TC7 / ADR-008 D8)', () => {
  beforeEach(() => {
    // 【テスト前準備】: 各 TC 前にスパイ呼び出し履歴をクリアし TC 間の相互干渉を防ぐ
    // 【環境初期化】: userRef / currentGroupRef を null に戻し、前 TC の状態が漏れないようにする
    vi.clearAllMocks()
    userRef.value = null
    currentGroupRef.value = null
  })

  // ===================================================================
  // TC1: 未認証ユーザーが保護ページにアクセス → /login?redirect=/
  // ===================================================================
  it('TC1: 未認証で保護 page にアクセスすると redirect クエリ付きで /login へリダイレクトする', async () => {
    // 【テスト目的】: user.value === null かつ to が非 public path のとき navigateTo('/login?redirect=/') が呼ばれること
    // 【テスト内容】: REQ-101（未認証→ログイン誘導）+ REQ-108（復帰 redirect クエリ付与）を検証
    // 【期待される動作】: 未認証ユーザーは保護コンテンツに到達できず、復帰用 redirect 付きでログインページへ誘導される
    // 🔵 ADR-008 D8 TC1 + REQ-101 / REQ-108 + dataflow.md §1（非 public + 未認証 分岐）

    // 【テストデータ準備】: user.value = null（未認証の代表ケース）
    // 【初期条件設定】: beforeEach で null に設定済みのため追加操作不要
    userRef.value = null

    // 【to オブジェクト】: 保護ページの代表として試合一覧を使用（'/' は公開 LP 化したため protected ではない / ADR-015）
    // fullPath === '/groups/g1/matches' のため redirect クエリはエンコードされた当該パスになる
    const to = { path: '/groups/g1/matches', fullPath: '/groups/g1/matches' }

    // 【実際の処理実行】: default export (middleware 本体) に to を渡して await 実行
    // 【処理内容】: dataflow.md §1 の「非 public → !user.value → navigateTo」分岐を通る
    await middleware(to as Parameters<typeof middleware>[0])

    // 【結果検証】: navigateTo('/login?redirect=%2Fgroups%2Fg1%2Fmatches') が 1 回呼ばれること
    // 【期待値確認】: encodeURIComponent('/groups/g1/matches') = '%2Fgroups%2Fg1%2Fmatches'
    // 🔵 仕様書 §2 出力値: navigateTo('/login?redirect=' + encodeURIComponent(to.fullPath)) に厳密対応
    expect(navigateToMock).toHaveBeenCalledWith('/login?redirect=%2Fgroups%2Fg1%2Fmatches') // 【確認内容】: redirect クエリ付き /login へ 1 回リダイレクト 🔵
    expect(navigateToMock).toHaveBeenCalledTimes(1) // 【確認内容】: navigateTo が正確に 1 回だけ呼ばれること 🔵
  })

  // ===================================================================
  // TC2: 未認証ユーザーが /login（public）にアクセス → 通過
  // ===================================================================
  it('TC2: 未認証で /login にアクセスすると通過する（リダイレクトなし）', async () => {
    // 【テスト目的】: user.value === null かつ to が public path /login のとき navigateTo が呼ばれないこと
    // 【テスト内容】: public path の /login は早期 return で通す分岐（public + 未認証）を検証
    // 【期待される動作】: 未認証ユーザーがログインページにアクセスできる（ログインの入口を塞がない）
    // 🔵 ADR-008 D8 TC2（8 行目代表集約）+ dataflow.md §1（public + 未認証 分岐）

    // 【テストデータ準備】: user.value = null（未認証）
    // 【初期条件設定】: beforeEach で null 設定済み
    userRef.value = null

    // 【to オブジェクト】: /login は PUBLIC_PATHS に含まれる public path
    const to = { path: '/login', fullPath: '/login' }

    // 【実際の処理実行】: middleware 本体に to を渡して await 実行
    // 【処理内容】: isPublicPath = true → user.value === null のため public 分岐内条件不成立 → return（通過）
    await middleware(to as Parameters<typeof middleware>[0])

    // 【結果検証】: navigateTo が一度も呼ばれないこと
    // 【期待値確認】: public path のため早期 return し、リダイレクト副作用が発生しない
    expect(navigateToMock).not.toHaveBeenCalled() // 【確認内容】: public path のため navigateTo が一度も呼ばれない 🔵
  })

  // ===================================================================
  // TC3: ログイン済・未所属ユーザーが保護ページにアクセス → /onboarding
  // ===================================================================
  it('TC3: ログイン済未所属で保護 page にアクセスするとオンボーディングへリダイレクトする', async () => {
    // 【テスト目的】: user.value あり・currentGroup.value === null・to が非 public かつ非許可 path のとき
    //              navigateTo('/onboarding') が呼ばれること
    // 【テスト内容】: REQ-102（ログイン済未所属→オンボーディング強制）の AND 条件真ケースを検証
    // 【期待される動作】: Group 未所属ユーザーは保護コンテンツの代わりにオンボーディングへ誘導される
    // 🔵 ADR-008 D8 TC3 + REQ-102 + dataflow.md §1（非 public + 未所属 + 非許可 path 分岐）

    // 【テストデータ準備】: ログイン済ユーザー（X）、未所属（null）
    // 【初期条件設定】: user.value = userX（認証済）、currentGroupRef.value = null（未所属）
    userRef.value = userX
    currentGroupRef.value = null

    // 【to オブジェクト】: 保護ページの代表として試合一覧を使用（GROUP_OPTIONAL_PATHS に含まれない非許可 path / '/' は公開 LP 化したため別ケースで検証）
    const to = { path: '/groups/g1/matches', fullPath: '/groups/g1/matches' }

    // 【実際の処理実行】: middleware 本体に to を渡して await 実行
    // 【処理内容】: 非 public → ログイン済 → !currentGroup.value=true && !GROUP_OPTIONAL_PATHS.includes(path)=true → navigateTo('/onboarding')
    await middleware(to as Parameters<typeof middleware>[0])

    // 【結果検証】: navigateTo('/onboarding') が 1 回呼ばれること
    // 【期待値確認】: !currentGroup.value && !GROUP_OPTIONAL_PATHS.includes('/') が真のため onboarding へリダイレクト
    expect(navigateToMock).toHaveBeenCalledWith('/onboarding') // 【確認内容】: /onboarding へ 1 回リダイレクト 🔵
    expect(navigateToMock).toHaveBeenCalledTimes(1) // 【確認内容】: navigateTo が正確に 1 回だけ呼ばれること 🔵
  })

  // ===================================================================
  // TC4: ログイン済・未所属ユーザーが /groups/new（許可 path）にアクセス → 通過
  // ===================================================================
  it('TC4: ログイン済未所属で /groups/new にアクセスすると通過する（未所属許可 path）', async () => {
    // 【テスト目的】: user.value あり・currentGroup.value === null かつ to が GROUP_OPTIONAL_PATHS の /groups/new のとき
    //              navigateTo が呼ばれず通過すること
    // 【テスト内容】: REQ-102 の例外（未所属許可 path での AND 条件偽ケース）を検証
    // 【期待される動作】: 未所属ユーザーが Group 作成ページに到達できる（オンボーディング動線を塞がない）
    // 🔵 ADR-008 D8 TC4 + REQ-102（許可 path）+ dataflow.md §1（非 public + 未所属 + 許可 path 分岐）

    // 【テストデータ準備】: ログイン済（X）、未所属（null）
    // 【初期条件設定】: user.value = userX、currentGroupRef.value = null
    userRef.value = userX
    currentGroupRef.value = null

    // 【to オブジェクト】: /groups/new は GROUP_OPTIONAL_PATHS に含まれる許可 path
    const to = { path: '/groups/new', fullPath: '/groups/new' }

    // 【実際の処理実行】: middleware 本体に to を渡して await 実行
    // 【処理内容】: 非 public → ログイン済 → !currentGroup.value=true だが
    //             !GROUP_OPTIONAL_PATHS.includes('/groups/new')=false → AND 条件偽 → リダイレクトなし → return（通過）
    await middleware(to as Parameters<typeof middleware>[0])

    // 【結果検証】: navigateTo が一度も呼ばれないこと
    // 【期待値確認】: GROUP_OPTIONAL_PATHS.includes('/groups/new') が AND の右辺を偽化し、リダイレクトを抑止する
    expect(navigateToMock).not.toHaveBeenCalled() // 【確認内容】: 許可 path のため navigateTo が一度も呼ばれない 🔵
  })

  // ===================================================================
  // TC5: ログイン済・所属ユーザーが /login にアクセス → /（public 分岐側）
  // ===================================================================
  it('TC5: ログイン済所属で /login にアクセスするとトップへリダイレクトする（public 分岐側で処理）', async () => {
    // 【テスト目的】: to が public path /login かつ user.value あり・currentGroup.value ありのとき
    //              public 分岐の中で navigateTo('/') が呼ばれること
    // 【テスト内容】: REQ-103（所属済→ログインページ不要→トップ誘導）の公開 path 側分岐を検証
    // 【期待される動作】: 既にログイン済・所属済のユーザーが /login に来ても再ログイン不要のためトップへ戻される
    // ⚠️ 罠: この経路は非 public ブランチではなく public ブランチ（PubLogin ノード）で処理される
    // 🔵 ADR-008 D8 TC5 + REQ-103 + dataflow.md §1（public + 所属済 PubLogin 分岐）

    // 【テストデータ準備】: ログイン済（X）、所属済（G）
    // 【初期条件設定】: user.value = userX、currentGroupRef.value = groupG
    userRef.value = userX
    currentGroupRef.value = groupG

    // 【to オブジェクト】: /login は PUBLIC_PATHS に含まれる public path
    const to = { path: '/login', fullPath: '/login' }

    // 【実際の処理実行】: middleware 本体に to を渡して await 実行
    // 【処理内容】: isPublicPath=true → to.path === '/login' && user.value=true →
    //             currentGroup.value=true → navigateTo('/') … public 分岐内で処理される
    await middleware(to as Parameters<typeof middleware>[0])

    // 【結果検証】: navigateTo('/') が 1 回呼ばれること
    // 【期待値確認】: public 分岐の PubLogin ノードで / へリダイレクト（非 public 分岐ではない）
    expect(navigateToMock).toHaveBeenCalledWith('/') // 【確認内容】: public 分岐側で / へ 1 回リダイレクト 🔵
    expect(navigateToMock).toHaveBeenCalledTimes(1) // 【確認内容】: navigateTo が正確に 1 回だけ呼ばれること 🔵
  })

  // ===================================================================
  // TC6: ログイン済・所属ユーザーが /onboarding にアクセス → /
  // ===================================================================
  it('TC6: ログイン済所属で /onboarding にアクセスするとトップへリダイレクトする', async () => {
    // 【テスト目的】: to が非 public path /onboarding かつ user.value あり・currentGroup.value ありのとき
    //              navigateTo('/') が呼ばれること
    // 【テスト内容】: REQ-103（所属済→オンボーディング不要→トップ誘導）の非 public 側分岐を検証
    // 【期待される動作】: 既に Group 所属済のユーザーはオンボーディング不要のためトップへ戻される
    // 🔵 ADR-008 D8 TC6 + REQ-103 + dataflow.md §1（非 public + 所属済 + /onboarding 分岐）

    // 【テストデータ準備】: ログイン済（X）、所属済（G）
    // 【初期条件設定】: user.value = userX、currentGroupRef.value = groupG
    userRef.value = userX
    currentGroupRef.value = groupG

    // 【to オブジェクト】: /onboarding は GROUP_OPTIONAL_PATHS に含まれるが所属済の場合は / へ戻す
    const to = { path: '/onboarding', fullPath: '/onboarding' }

    // 【実際の処理実行】: middleware 本体に to を渡して await 実行
    // 【処理内容】: 非 public → ログイン済 → !currentGroup.value=false → AND 条件偽（スキップ）→
    //             currentGroup.value && to.path === '/onboarding' = true → navigateTo('/')
    await middleware(to as Parameters<typeof middleware>[0])

    // 【結果検証】: navigateTo('/') が 1 回呼ばれること
    // 【期待値確認】: 未所属 AND 条件は偽でスキップ、所属済 + /onboarding 条件で / へ飛ぶ
    expect(navigateToMock).toHaveBeenCalledWith('/') // 【確認内容】: /onboarding から / へ 1 回リダイレクト 🔵
    expect(navigateToMock).toHaveBeenCalledTimes(1) // 【確認内容】: navigateTo が正確に 1 回だけ呼ばれること 🔵
  })

  // ===================================================================
  // TC7: ログイン済・所属ユーザーが保護ページにアクセス → 通過
  // ===================================================================
  it('TC7: ログイン済所属で保護 page にアクセスすると通過する（通常利用の正常系）', async () => {
    // 【テスト目的】: user.value あり・currentGroup.value あり かつ to が非 public・非 /onboarding のとき
    //              navigateTo が呼ばれず通過すること
    // 【テスト内容】: 通常利用ユーザーの保護コンテンツアクセス（全リダイレクト条件が偽→通過）を検証
    // 【期待される動作】: 正規ユーザーが保護コンテンツに正常にアクセスできる（ガードが正規ユーザーを妨げない）
    // 🔵 ADR-008 D8 TC7 + dataflow.md §1（非 public + 所属済 + 非 onboarding 分岐）

    // 【テストデータ準備】: ログイン済（X）、所属済（G）
    // 【初期条件設定】: user.value = userX、currentGroupRef.value = groupG
    userRef.value = userX
    currentGroupRef.value = groupG

    // 【to オブジェクト】: 保護ページの代表として試合一覧を使用（認証・所属が整った正規ユーザーの一般的なアクセス / '/' は公開 LP 化したため別ケースで検証）
    const to = { path: '/groups/g1/matches', fullPath: '/groups/g1/matches' }

    // 【実際の処理実行】: middleware 本体に to を渡して await 実行
    // 【処理内容】: 非 public → ログイン済 → !currentGroup.value=false（AND 条件偽・スキップ）→
    //             to.path === '/onboarding'=false（所属済条件偽・スキップ）→ return（通過）
    await middleware(to as Parameters<typeof middleware>[0])

    // 【結果検証】: navigateTo が一度も呼ばれないこと
    // 【期待値確認】: 全分岐をすり抜けて何もリダイレクトせず、正規ユーザーへの誤リダイレクトがない
    expect(navigateToMock).not.toHaveBeenCalled() // 【確認内容】: 通常利用では navigateTo が一度も呼ばれない 🔵
  })

  // ===================================================================
  // TC8: 未認証ユーザーが / (公開 LP) にアクセス → 通過（リダイレクトなし）
  // ===================================================================
  it('TC8: 未認証で / (公開LP) にアクセスすると通過する（リダイレクトなし）', async () => {
    // 【テスト目的】: '/' を PUBLIC_PATHS に追加したため、未認証ユーザーが LP を閲覧できること (ADR-015)
    // 【テスト内容】: 初見の訪問者に「何のアプリか」を見せる入口を塞がない（public + 未認証 分岐）
    // 🔵 ADR-015 + dataflow.md §1（public + 未認証 分岐）

    // 【初期条件設定】: beforeEach で null（未認証）
    userRef.value = null

    // 【to オブジェクト】: '/' は PUBLIC_PATHS に含まれる公開 LP
    const to = { path: '/', fullPath: '/' }

    await middleware(to as Parameters<typeof middleware>[0])

    // 【結果検証】: navigateTo が一度も呼ばれず LP がそのまま表示される
    expect(navigateToMock).not.toHaveBeenCalled() // 【確認内容】: 公開 LP のため navigateTo が一度も呼ばれない 🔵
  })

  // ===================================================================
  // TC9: ログイン済・所属ユーザーが / (公開 LP) にアクセス → アプリホーム（試合一覧）へ
  // ===================================================================
  it('TC9: ログイン済所属で / にアクセスすると本来のホーム（試合一覧）へリダイレクトする', async () => {
    // 【テスト目的】: ログイン済ユーザーには LP を見せず本来の居場所へ送る (ADR-015)
    // 【テスト内容】: 所属済 → /groups/{group_id}/matches へ誘導（public 分岐内で処理）
    // 🔵 ADR-015 + dataflow.md §1（public + / + ログイン済所属 分岐）

    // 【初期条件設定】: ログイン済（X）、所属済（G = group_id 'g1'）
    userRef.value = userX
    currentGroupRef.value = groupG

    // 【to オブジェクト】: '/' は公開 LP だがログイン済はアプリホームへ転送される
    const to = { path: '/', fullPath: '/' }

    await middleware(to as Parameters<typeof middleware>[0])

    // 【結果検証】: navigateTo('/groups/g1/matches') が 1 回呼ばれること
    expect(navigateToMock).toHaveBeenCalledWith('/groups/g1/matches') // 【確認内容】: アプリホーム（試合一覧）へ 1 回リダイレクト 🔵
    expect(navigateToMock).toHaveBeenCalledTimes(1) // 【確認内容】: navigateTo が正確に 1 回だけ呼ばれること 🔵
  })

  // ===================================================================
  // TC10: ログイン済・未所属ユーザーが / (公開 LP) にアクセス → /onboarding へ
  // ===================================================================
  it('TC10: ログイン済未所属で / にアクセスするとオンボーディングへリダイレクトする', async () => {
    // 【テスト目的】: ログイン済だが未所属のユーザーは LP ではなくオンボーディングへ送る (ADR-015)
    // 【テスト内容】: public + / + ログイン済未所属 → navigateTo('/onboarding')
    // 🔵 ADR-015 + dataflow.md §1（public + / + ログイン済未所属 分岐）

    // 【初期条件設定】: ログイン済（X）、未所属（null）
    userRef.value = userX
    currentGroupRef.value = null

    // 【to オブジェクト】: '/' は公開 LP だがログイン済未所属はオンボーディングへ転送される
    const to = { path: '/', fullPath: '/' }

    await middleware(to as Parameters<typeof middleware>[0])

    // 【結果検証】: navigateTo('/onboarding') が 1 回呼ばれること
    expect(navigateToMock).toHaveBeenCalledWith('/onboarding') // 【確認内容】: オンボーディングへ 1 回リダイレクト 🔵
    expect(navigateToMock).toHaveBeenCalledTimes(1) // 【確認内容】: navigateTo が正確に 1 回だけ呼ばれること 🔵
  })
})
