/**
 * 【機能概要】: Google OAuth ログイン・ログアウトを内包する Write (Auth) composable
 * 【実装方針】: page から supabase.auth を直叩きさせず、認証フローを 1 箇所に集約する (REQ-406 / ADR-007 D9)
 * 【テスト対応】: TC1 (signInWithOAuth 呼び出し) / TC2 (logout 順序) / TC3 (Auth エラー → setNotice)
 * 🔵 interfaces.ts UseLoginReturn + TASK-0008.md 実装詳細 + note.md §2
 */

import type { Database } from '~/types/supabase'

export function useLogin() {
  // 【supabase クライアント取得】: Database 型付きで型安全に auth API を呼ぶ 🔵
  const supabase = useSupabaseClient<Database>()

  // 【notice チャネル取得】: Auth エラーを <UAlert> に流す (EDGE-002) 🔵
  const { notice, setNotice, clear } = useNoticeErrors()

  // 【pending state 初期化】: 二重送信防止 (EDGE-003) のため login/logout 実行中は true 🔵
  const pending = ref<boolean>(false)

  /**
   * 【機能概要】: Google OAuth ログインを開始する
   * 【実装方針】: redirectTo に '/confirm?redirect=...' を組み立て signInWithOAuth を呼ぶ (A2)
   * 【テスト対応】: TC1 (provider:'google' + redirectTo 部分一致) / TC3 (エラー時 setNotice)
   * 🔵 REQ-001 / A2 + dataflow.md §2 + interfaces.ts UseLoginReturn
   * @param redirect - OAuth ラウンドトリップ後の最終遷移先パス (未指定時は '/')
   */
  async function login(redirect?: string): Promise<void> {
    // 【前回通知クリア】: 前回エラー notice を消してから新しいフローを開始する 🔵
    clear()
    // 【二重送信防止開始】: EDGE-003 対策、ボタン disabled に使われる pending を true に 🔵
    pending.value = true

    try {
      // 【redirectTo 組み立て】: A2 redirect クエリ運搬。Supabase signInWithOAuth は OAuth コールバック先に
      // 絶対 URL を要求するため現在オリジン (例: http://localhost:3000) を付与する。
      // useRequestURL() は SSR/CSR 双方で動作 (client では window.location ベース) 🔵
      const origin = useRequestURL().origin
      const redirectTo = `${origin}/confirm?redirect=` + encodeURIComponent(redirect ?? '/')

      // 【OAuth 開始】: Google プロバイダを指定して OAuth フローを開始。成功時は Supabase がリダイレクトする 🔵
      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: { redirectTo }
      })

      if (error) {
        // 【エラー処理】: EDGE-002 - Auth エラーは setNotice へ渡す (文言変換は useNoticeErrors 内部の責務) 🔵
        setNotice(error)
      }
    } finally {
      // 【二重送信防止終了】: 成功・失敗いずれも finally で pending を false に戻す (EDGE-003) 🔵
      pending.value = false
    }
  }

  /**
   * 【機能概要】: ログアウトして /login へ遷移する
   * 【実装方針】: signOut() 完了後に navigateTo('/login') を呼ぶ。順序保証が load-bearing (REQ-008)
   * 【テスト対応】: TC2 (signOut → navigateTo 順序保証)
   * 🔵 REQ-008 + interfaces.ts UseLoginReturn
   */
  async function logout(): Promise<void> {
    // 【二重送信防止開始】: EDGE-003 対策 🔵
    pending.value = true

    try {
      // 【セッション破棄】: signOut でセッション Cookie を削除してから遷移する (順序重要) 🔵
      const { error } = await supabase.auth.signOut()

      if (error) {
        // 【エラー処理】: EDGE-002 - logout 失敗時は setNotice のみ。navigateTo は呼ばない 🔵
        setNotice(error)
      } else {
        // 【ログアウト後遷移】: signOut 成功後に /login へリダイレクト (REQ-008) 🔵
        await navigateTo('/login')
      }
    } finally {
      // 【二重送信防止終了】: 成功・失敗いずれも finally で pending を false に戻す (EDGE-003) 🔵
      pending.value = false
    }
  }

  // 【戻り値】: UseLoginReturn に従い login / logout / pending / notice を expose 🔵
  return { login, logout, pending, notice }
}
