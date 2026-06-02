/**
 * 【機能概要】: 画面通知エラーを管理する composable (<UAlert> 表示用)
 * 【実装方針】: error-handling.md §6.4 の実装コードをそのまま採用。useErrorMessage の薄いラッパ (🔵)
 * 【テスト対応】: TC4-b (setNotice で notice に文言が載り、clear で null に戻る)
 * 🔵 error-handling.md §6.4 + interfaces.ts §4 NoticeErrorsApi
 */
import type { ErrorContext } from '~/types/error-codes'

export function useNoticeErrors() {
  // 【state 初期化】: 通知文言の state (初期値は null = 通知なし) 🔵
  const notice = ref<string | null>(null)
  // 【useErrorMessage 取得】: 内部で errorToMessage を呼ぶ (薄いラッパとして変換ロジックは持たない) 🔵
  const { errorToMessage } = useErrorMessage()

  /**
   * 【機能概要】: 通知エラー文言をセットする
   * 【実装方針】: errorToMessage で変換した文言を notice.value に書き込む
   * 🔵 error-handling.md §6.4
   * @param error - エラーオブジェクト (useErrorMessage に渡す)
   * @param pgContext - PG SQLSTATE context (省略可)
   */
  function setNotice(error: unknown, pgContext?: ErrorContext) {
    // 【エラー変換・書き込み】: errorToMessage で i18n 文言に変換して state に反映 🔵
    notice.value = errorToMessage(error, pgContext)
  }

  /**
   * 【機能概要】: 通知エラーをクリアする
   * 【実装方針】: notice.value を null にリセット (notice なし = null が仕様)
   * 🔵 error-handling.md §6.4
   */
  function clear() {
    // 【state リセット】: null に戻すことで <UAlert> を非表示にする 🔵
    notice.value = null
  }

  // 【戻り値】: NoticeErrorsApi に従い notice / setNotice / clear を expose 🔵
  return { notice, setNotice, clear }
}
