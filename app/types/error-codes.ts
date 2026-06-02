// App 側ドメインエラー (DB 側 RAISE EXCEPTION のメッセージと 1:1)
export const APP_ERROR_CODES = {
  NOT_AUTHENTICATED: 'not_authenticated',
  NOT_A_MEMBER: 'not_a_member',
  INVALID_GROUP_NAME: 'invalid_group_name',
  // MVP: URL 直リンク着地のみ。将来手入力フォームを追加する場合は _BY_CODE を別識別子として定義
  INVITATION_NOT_FOUND_BY_LINK: 'invitation_not_found_by_link',
  INVITATION_EXPIRED: 'invitation_expired',
  INVITATION_CODE_COLLISION_AFTER_RETRY: 'invitation_code_collision_after_retry',
  // auth-onboarding 追加 (REQ-105 / DB 例外 already_in_group と 1:1、interfaces.ts §1)
  ALREADY_IN_GROUP: 'already_in_group'
} as const

export type AppErrorCode = typeof APP_ERROR_CODES[keyof typeof APP_ERROR_CODES]

// PostgreSQL SQLSTATE (PG 標準コード、変わらない)
export const PG_ERROR_CODES = {
  UNIQUE_VIOLATION: '23505',
  FK_VIOLATION: '23503',
  CHECK_VIOLATION: '23514',
  RLS_REJECTED: '42501'
} as const

export type PgErrorCode = typeof PG_ERROR_CODES[keyof typeof PG_ERROR_CODES]

// PG エラーで context による出し分けが必要な場合に使う
// App 識別子は 1:1 マッピングのため context を使わない
export type ErrorContext = 'join_group' | 'create_group' | 'generic'

export function isAppError(error: unknown, code: AppErrorCode): boolean {
  return typeof error === 'object'
    && error !== null
    && 'message' in error
    && typeof (error as { message: unknown }).message === 'string'
    && (error as { message: string }).message.includes(code)
}

export function isPgError(error: unknown, code: PgErrorCode): boolean {
  return typeof error === 'object'
    && error !== null
    && 'code' in error
    && (error as { code: unknown }).code === code
}
