/**
 * 【機能概要】: エラー識別子を i18n 文言に変換する中核 composable
 * 【実装方針】: error-handling.md §5.1 の実装コードをそのまま採用 (🔵)
 * 【テスト対応】: TC1 (App 識別子 1:1 変換) / TC2 (fallthrough + Sentry) / TC3 (PG context 出し分け)
 * 🔵 error-handling.md §5.1 + interfaces.ts §4 ErrorMessageApi
 */
import * as Sentry from '@sentry/nuxt'
import {
  APP_ERROR_CODES,
  PG_ERROR_CODES,
  isAppError,
  isPgError,
  type ErrorContext
} from '~/types/error-codes'

export function useErrorMessage() {
  // 【i18n 取得】: Nuxt auto-import 経由で t (翻訳) / te (キー存在判定) を取得 🔵
  const { t, te } = useI18n()

  /**
   * 【機能概要】: PG SQLSTATE 用 context 出し分け。context キーが i18n に存在すれば context キー、なければ .generic にフォールバック
   * 【実装方針】: te() で存在確認してからキーを決定する (error-handling.md §5.1 / §5.3)
   * 🔵 error-handling.md §5.1 tWithContext
   */
  function tWithContext(base: string, ctx: ErrorContext): string {
    // 【context キー存在確認】: te() で 'errors.unique_violation.join_group' 等のキーが locales に存在するか判定 🔵
    const ctxKey = `${base}.${ctx}`
    return t(te(ctxKey) ? ctxKey : `${base}.generic`)
  }

  /**
   * 【機能概要】: エラーオブジェクトを受け取り i18n 文言 string を返す変換関数
   * 【実装方針】: App 識別子 7 種 → 1:1 flat キー / PG SQLSTATE 4 種 → tWithContext / fallthrough → errors.generic + Sentry
   * 【テスト対応】: TC1 (INVALID_GROUP_NAME) / TC2 (fallthrough) / TC3 (UNIQUE_VIOLATION context)
   * 🔵 error-handling.md §5.1 + TASK-0007.md (ALREADY_IN_GROUP 追加)
   * @param error - 任意のエラーオブジェクト (isAppError / isPgError で識別)
   * @param pgContext - PG SQLSTATE の context (App 識別子では無視される、省略時は 'generic')
   * @returns i18n 文言 string
   */
  function errorToMessage(
    error: unknown,
    pgContext: ErrorContext = 'generic'
  ): string {
    // 【App 識別子分岐 (1:1 マッピング)】: 各識別子を flat i18n キーに変換 🔵
    // context は使わない (error-handling.md §5.2 / 原則 4)
    if (isAppError(error, APP_ERROR_CODES.NOT_AUTHENTICATED)) {
      return t('errors.not_authenticated')
    }
    if (isAppError(error, APP_ERROR_CODES.NOT_A_MEMBER)) {
      return t('errors.not_a_member')
    }
    if (isAppError(error, APP_ERROR_CODES.INVALID_GROUP_NAME)) {
      // 【TC1 対応】: INVALID_GROUP_NAME は 1:1 で errors.invalid_group_name に変換される
      return t('errors.invalid_group_name')
    }
    if (isAppError(error, APP_ERROR_CODES.ALREADY_IN_GROUP)) {
      // 【ALREADY_IN_GROUP 追加】: TASK-0003 で error-codes.ts に追加済 (error-handling.md 設計書は旧版のため本分岐を追加)
      return t('errors.already_in_group')
    }
    if (isAppError(error, APP_ERROR_CODES.INVITATION_NOT_FOUND_BY_LINK)) {
      return t('errors.invitation_not_found_by_link')
    }
    if (isAppError(error, APP_ERROR_CODES.INVITATION_EXPIRED)) {
      return t('errors.invitation_expired')
    }
    if (isAppError(error, APP_ERROR_CODES.INVITATION_CODE_COLLISION_AFTER_RETRY)) {
      return t('errors.invitation_code_collision_after_retry')
    }

    // 【PG SQLSTATE 分岐 (context 出し分け)】: tWithContext で te() 存在確認後に context or .generic を選択 🔵
    if (isPgError(error, PG_ERROR_CODES.UNIQUE_VIOLATION)) {
      // 【TC3 対応】: te 真→ctx キー / 偽→.generic フォールバック
      return tWithContext('errors.unique_violation', pgContext)
    }
    if (isPgError(error, PG_ERROR_CODES.FK_VIOLATION)) {
      return tWithContext('errors.fk_violation', pgContext)
    }
    if (isPgError(error, PG_ERROR_CODES.CHECK_VIOLATION)) {
      return tWithContext('errors.check_violation', pgContext)
    }
    if (isPgError(error, PG_ERROR_CODES.RLS_REJECTED)) {
      // 【RLS_REJECTED】: context 出し分けなし (error-handling.md §5.1)
      return t('errors.rls_rejected')
    }

    // 【fallthrough 分岐】: いずれの識別子にも一致しない想定外エラー → Sentry 報告 + errors.generic 返却 🔵
    // 【TC2 対応】: unmapped エラーは captureException で Sentry に報告し、ユーザには汎用文言を返す (NFR-304)
    Sentry.captureException(error, {
      tags: { reason: 'unmapped_error_code' }
    })
    return t('errors.generic')
  }

  // 【戻り値】: ErrorMessageApi に従い errorToMessage のみを expose 🔵
  return { errorToMessage }
}
