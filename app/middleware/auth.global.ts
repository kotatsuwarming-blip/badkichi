/**
 * 【機能概要】: 認証・Group 所属チェック グローバル middleware
 * 【実装方針】: dataflow.md §1 フローチャートの 7 分岐を 1 ファイルで集約 (ADR-008 D1)
 * 【テスト対応】: TC1〜TC7 (ADR-008 D8 表) を全て通す実装
 * 【isomorphic 原則】: window / document / serverSupabaseClient 不使用。SSR/CSR 双方で動作 (ADR-008 D6)
 * 🔵 note.md §4 実装テンプレート + TASK-0013.md 実装詳細コードに厳密に対応
 */

// 【auto-import】: Nuxt 4 の auto-import により以下をグローバル利用
//   defineNuxtRouteMiddleware / useSupabaseUser / useCurrentGroup / navigateTo

// 【PUBLIC_PATHS】: 認証チェックをスキップする固定パス一覧 🔵
// /join/** は動的パスのため startsWith で別途判定 (dataflow.md §1)
// '/' = 公開ランディングページ (LP)。未ログインの初見ユーザーに「何のアプリか」を見せる入口 (ADR-015)。
const PUBLIC_PATHS = ['/', '/login', '/confirm']

// 【GROUP_OPTIONAL_PATHS】: ログイン済・未所属でも通過を許可するパス一覧 🔵
// REQ-102 例外: Group 作成・オンボーディング動線は未所属のままアクセス可能にする
const GROUP_OPTIONAL_PATHS = ['/onboarding', '/groups/new']

export default defineNuxtRouteMiddleware(async (to) => {
  // 【public path 判定】: 固定パスか /join/** で始まるかを判定 🔵
  const isPublicPath = PUBLIC_PATHS.includes(to.path) || to.path.startsWith('/join/')

  // 【ユーザー状態取得】: useSupabaseUser は { value: User | null } を返す 🔵
  const user = useSupabaseUser()

  // ===================================================================
  // public path ブランチ (dataflow.md §1 上半分)
  // ===================================================================
  if (isPublicPath) {
    // 【/login + 所属済チェック】: REQ-103 — 所属済ユーザーが /login に来たらトップへ誘導 🔵
    // ⚠️ この分岐は public ブランチ (PubLogin ノード) で処理。非 public 側ではない
    if (to.path === '/login' && user.value) {
      // キャッシュ共有: useAsyncData('current-group') キーで 1 ナビゲーション 1 クエリ (ADR-008 D4)
      const { data: currentGroup } = await useCurrentGroup()
      if (currentGroup.value) return navigateTo('/')
    }
    // 【/ (公開LP) + ログイン済】: ADR-015 — ログイン済ユーザーには LP を見せず本来の居場所へ送る。
    // 所属済 → 試合一覧 (アプリホーム) / 未所属 → オンボーディング。未ログインはそのまま LP を表示する。
    if (to.path === '/' && user.value) {
      const { data: currentGroup } = await useCurrentGroup()
      if (currentGroup.value) return navigateTo(`/groups/${currentGroup.value.group_id}/matches`)
      return navigateTo('/onboarding')
    }
    // /login+未所属、/ (未ログイン LP)、/confirm、/join/** などは何もせず通す
    return
  }

  // ===================================================================
  // 非 public path ブランチ (dataflow.md §1 下半分)
  // ===================================================================

  // 【未認証チェック】: REQ-101/108 — 未認証ユーザーは redirect クエリ付きで /login へ誘導 🔵
  if (!user.value) {
    return navigateTo(`/login?redirect=${encodeURIComponent(to.fullPath)}`)
  }

  // 【Group 所属チェック】: ログイン済ユーザーの Group 所属を確認 🔵
  // キャッシュ共有: public 分岐で await 済みの場合も同一キー 'current-group' で再利用 (ADR-008 D4)
  const { data: currentGroup } = await useCurrentGroup()

  // 【未所属 + 非許可 path】: REQ-102 — 未所属ユーザーを /onboarding へ誘導 🔵
  if (!currentGroup.value && !GROUP_OPTIONAL_PATHS.includes(to.path)) {
    return navigateTo('/onboarding')
  }

  // 【所属済 + /onboarding】: REQ-103 — 所属済ユーザーが /onboarding に来たらトップへ誘導 🔵
  if (currentGroup.value && to.path === '/onboarding') {
    return navigateTo('/')
  }

  // 【通過】: ログイン済・所属済・通常保護ページの正規ユーザーは通す (TC7 カバー) 🔵
})
