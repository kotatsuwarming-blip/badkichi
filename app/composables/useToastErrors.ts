/**
 * 【機能概要】: トーストエラーを表示する composable (useToast 一過性表示用)
 * 【実装方針】: error-handling.md §6.4 の実装コードをそのまま採用。useErrorMessage の薄いラッパ (🔵)
 * 【テスト対応】: TC4-c (showError で useToast().add が { title: 文言, color: 'error' } で呼ばれる)
 * 🔵 error-handling.md §6.4 + interfaces.ts §4 ToastErrorsApi
 */
import type { ErrorContext } from '~/types/error-codes'

export function useToastErrors() {
  // 【useErrorMessage 取得】: 内部で errorToMessage を呼ぶ (薄いラッパとして変換ロジックは持たない) 🔵
  const { errorToMessage } = useErrorMessage()

  /**
   * 【機能概要】: エラーをトーストで一過性表示する
   * 【実装方針】: errorToMessage で変換した文言を title にセットし、color: 'error' でエラートーストを表示
   * 【色の選択】: Nuxt UI v4 では 'red' は無効。エラー意味論に対応する 'error' を使用 🔴 (設計書は旧 'red' だが型安全性を優先)
   * 【useToast 遅延評価】: useToast() を showError 呼び出し時に実行することで、
   *   Nuxt インスタンス不在環境 (テスト) でのエラーを回避し、mock の注入を可能にする 🔵
   * 🔵 error-handling.md §6.4
   * @param error - エラーオブジェクト (useErrorMessage に渡す)
   * @param pgContext - PG SQLSTATE context (省略可)
   */
  function showError(error: unknown, pgContext?: ErrorContext) {
    // 【useToast 遅延取得】: 関数内で useToast() を呼ぶことで mock 差し替えを可能にする 🔵
    const toast = useToast()
    // 【トースト表示】: 変換文言を title に、Nuxt UI v4 の型安全な色指定 'error' で toast.add を呼ぶ 🔴
    // 【注意】: 設計書は 'red' だが Nuxt UI v4 の color 型は 'error'|'primary'|'secondary'|'success'|'info'|'warning'|'neutral'
    toast.add({
      title: errorToMessage(error, pgContext),
      color: 'error'
    })
  }

  // 【戻り値】: ToastErrorsApi に従い showError のみを expose 🔵
  return { showError }
}
