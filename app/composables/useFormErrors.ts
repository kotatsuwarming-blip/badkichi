/**
 * 【機能概要】: フォームフィールド単位エラーを管理する composable (<UFormField> inline 表示用)
 * 【実装方針】: error-handling.md §6.4 の実装コードをそのまま採用。useErrorMessage の薄いラッパ (🔵)
 * 【テスト対応】: TC4-a (setFieldError で fieldErrors に文言が載り、clear(field) で削除)
 * 🔵 error-handling.md §6.4 + interfaces.ts §4 FormErrorsApi
 */
import type { ErrorContext } from '~/types/error-codes'

export function useFormErrors() {
  // 【state 初期化】: フィールド名→エラー文言のマップ (初期値は空オブジェクト) 🔵
  const fieldErrors = ref<Record<string, string>>({})
  // 【useErrorMessage 取得】: 内部で errorToMessage を呼ぶ (薄いラッパとして変換ロジックは持たない) 🔵
  const { errorToMessage } = useErrorMessage()

  /**
   * 【機能概要】: 指定フィールドにエラー文言をセットする
   * 【実装方針】: errorToMessage で変換した文言を fieldErrors.value[field] に書き込む
   * 🔵 error-handling.md §6.4
   * @param field - フォームフィールド名 (e.g. 'name', 'email')
   * @param error - エラーオブジェクト (useErrorMessage に渡す)
   * @param pgContext - PG SQLSTATE context (省略可)
   */
  function setFieldError(field: string, error: unknown, pgContext?: ErrorContext) {
    // 【エラー変換・書き込み】: errorToMessage で i18n 文言に変換して state に反映 🔵
    fieldErrors.value[field] = errorToMessage(error, pgContext)
  }

  /**
   * 【機能概要】: フィールドエラーをクリアする (単一フィールドまたは全消去)
   * 【実装方針】: field 指定時はオブジェクトスプレッドで当該キーを除いた新オブジェクトを生成、未指定時は空オブジェクトで全消去 🔵
   * 【ESLint 対応】: @typescript-eslint/no-dynamic-delete を回避するためスプレッド方式を使用 (delete 演算子不使用)
   * 🔵 error-handling.md §6.4
   * @param field - 削除するフィールド名 (省略時は全フィールドをクリア)
   */
  function clear(field?: string) {
    if (field) {
      // 【単一フィールドクリア】: 当該キーを除いた新オブジェクトで上書き (他のフィールドエラーは維持) 🔵
      const { [field]: _removed, ...rest } = fieldErrors.value
      fieldErrors.value = rest
    } else {
      // 【全フィールドクリア】: 空オブジェクトで全消去 🔵
      fieldErrors.value = {}
    }
  }

  // 【戻り値】: FormErrorsApi に従い fieldErrors / setFieldError / clear を expose 🔵
  return { fieldErrors, setFieldError, clear }
}
