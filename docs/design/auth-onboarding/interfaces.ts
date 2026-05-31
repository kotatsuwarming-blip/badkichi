/**
 * auth-onboarding 型定義 (設計成果物)
 *
 * 作成日: 2026-05-30
 * 位置づけ: architecture.md「composable 構成」で要約した composable 戻り値の **詳細契約**。
 *   実装 (app/composables/*.ts, app/types/*.ts) はこの契約に従う。
 *
 * 信頼性: 🔵 ADR-007 (§補遺含む) + error-handling.md §4.1/§6.4/§6.5 + app/types/supabase.ts 実測
 *   (RPC 引数・戻り・テーブル Row はすべて生成済み型を真とする)
 *
 * 注意: 本ファイルは設計上の「契約」を表す参照用 .ts であり、実装ファイルそのものではない。
 *   Nuxt の auto-import 型 (Ref / AsyncData 等) は実装時に解決される前提で、ここでは形だけ示す。
 */

import type { Ref } from 'vue'
import type { Database } from '~/types/supabase'

/* ============================================================
 * 1. エラー識別子 (app/types/error-codes.ts — 本単位で追記)
 * ============================================================
 * error-handling.md §4.1 の APP_ERROR_CODES に、本単位で ALREADY_IN_GROUP を追加する。
 * (REQ-105 / DB 例外 `already_in_group` と 1:1、interview-record Q2a で確定) */
export const APP_ERROR_CODES_ADDITION = {
  ALREADY_IN_GROUP: 'already_in_group'
} as const
// → 既存 APP_ERROR_CODES に統合: NOT_AUTHENTICATED / NOT_A_MEMBER / INVALID_GROUP_NAME /
//   INVITATION_NOT_FOUND_BY_LINK / INVITATION_EXPIRED / INVITATION_CODE_COLLISION_AFTER_RETRY
//   + ALREADY_IN_GROUP

/* ============================================================
 * 2. ドメイン共有型 (app/types/domain.ts — 必要になれば、ADR-007 D6)
 * ============================================================ */

/** useCurrentGroup の SELECT 結果。1 user = 1 group (ADR-006) のため単数 or null。
 *  クエリ: from('group_members').select('group_id, groups(id, name)').maybeSingle()
 *  🟡 実装時確定: embed `groups` の null 許容は supabase gen types の出力に従う
 *    (FK 必須なら non-null になる可能性。生成型を見て | null を外すか決める)。 */
export interface CurrentGroup {
  group_id: Database['public']['Tables']['group_members']['Row']['group_id']
  groups: Pick<Database['public']['Tables']['groups']['Row'], 'id' | 'name'> | null
}

/** useListInvitations の 1 行。group_invitations Row のうち UI が使う列のみ。
 *  SELECT は `deleted_at is null` で論理削除を除外 (MVP は無効化なしだがソフトデリート前提)。
 *  ⚠️ settings 画面の「状態」(有効/期限切れ) は **派生値**: group_invitations に status 列は無く、
 *    `expires_at < now()` で UI 側が算出する (DB 列を探さない)。 */
export type Invitation = Pick<
  Database['public']['Tables']['group_invitations']['Row'],
  'id' | 'code' | 'created_at' | 'expires_at'
>

/* ============================================================
 * 3. 共通の戻り値ヘルパ型
 * ============================================================ */

/** Nuxt useAsyncData の戻り値のうち本単位が使う部分集合 (Read 系 composable 共通、ADR-007 D4-1)。
 *  実装では `useAsyncData<T>()` の戻りをそのまま返す。 */
export interface AsyncState<T> {
  data: Ref<T | null>
  pending: Ref<boolean>
  error: Ref<Error | null>
  refresh: () => Promise<void>
}

/** Supabase native の {data, error} (アクション関数の生戻り)。
 *  page は error を「成功/失敗の分岐」にのみ使い、表示はチャネル state を見る (ADR-007 §補遺)。 */
export interface ActionResult<T> {
  data: T | null
  error: unknown
}

/* ============================================================
 * 4. cross-cutting チャネル composable の戻り (error-handling.md §6.4)
 * ============================================================ */

export interface FormErrorsApi {
  fieldErrors: Ref<Record<string, string>>
  setFieldError: (field: string, error: unknown, pgContext?: ErrorContext) => void
  clear: (field?: string) => void
}

export interface NoticeErrorsApi {
  notice: Ref<string | null>
  setNotice: (error: unknown, pgContext?: ErrorContext) => void
  clear: () => void
}

export interface ToastErrorsApi {
  showError: (error: unknown, pgContext?: ErrorContext) => void
}

export interface ErrorMessageApi {
  errorToMessage: (error: unknown, pgContext?: ErrorContext) => string
}

/** error-handling.md §4.1。PG SQLSTATE の context 出し分け用。 */
export type ErrorContext = 'join_group' | 'create_group' | 'generic'

/* ============================================================
 * 5. domain composable の戻り契約 (6 本)
 * ============================================================
 * ADR-007 §補遺: Write 系は「チャネル state + pending」を expose。
 *   生 error: AppErrorCode ref は expose しない。pending は二重送信防止 (EDGE-003) で全 Write 必須。
 *   アクション関数自体は ActionResult を返してよい (page は error を分岐にのみ使用)。 */

/** useLogin — Write (Auth)。REQ-001 / REQ-008。
 *  Auth エラーは EDGE-002 で <UAlert> 表示するため notice チャネルを持つ。 */
export interface UseLoginReturn {
  /** signInWithOAuth({ provider:'google', options:{ redirectTo:'/confirm?redirect=...' } })
   *  🟡 実装時確定: redirect 戻り先を引数で受けるか route.query から内部で読むかは実装判断。
   *    ここでは引数契約で示すが、内部で useRoute() を読む形でも可。 */
  login: (redirect?: string) => Promise<void>
  /** signOut() — default.vue ヘッダーから呼ぶ (ADR-011 D2) */
  logout: () => Promise<void>
  pending: Ref<boolean>
  /** Auth エラー (EDGE-002) を <UAlert> に流すチャネル (useNoticeErrors)。architecture.md 表とも整合済 */
  notice: Ref<string | null>
}

/** useCurrentGroup — Read。REQ-005 / REQ-103 / NFR-002。
 *  useAsyncData('current-group') の戻り。middleware と page で同一キー共有 (ADR-008 D4)。 */
export type UseCurrentGroupReturn = AsyncState<CurrentGroup>

/** useCreateGroup — Write (RPC create_group_with_owner)。REQ-004。
 *  フィールド検証エラー (invalid_group_name) → useFormErrors チャネル。 */
export interface UseCreateGroupReturn {
  /** rpc('create_group_with_owner', { group_name }) → Returns: group_id(string) */
  create: (groupName: string) => Promise<ActionResult<string>>
  pending: Ref<boolean>
  fieldErrors: Ref<Record<string, string>>
}

/** useJoinGroup — Write (RPC join_group_with_code)。REQ-005 / REQ-105。
 *  招待リンク着地の永続通知 → useNoticeErrors チャネル
 *  (ALREADY_IN_GROUP / INVITATION_NOT_FOUND_BY_LINK / INVITATION_EXPIRED)。 */
export interface UseJoinGroupReturn {
  /** rpc('join_group_with_code', { invite_code }) → Returns: group_id(string)
   *  内部で DB メッセージ invitation_not_found を INVITATION_NOT_FOUND_BY_LINK に明示変換
   *  (architecture.md §既存 API マッピング 注2: 素朴な includes に頼らない) */
  join: (inviteCode: string) => Promise<ActionResult<string>>
  pending: Ref<boolean>
  notice: Ref<string | null>
}

/** useGenerateInvitation — Write (RPC generate_invitation_code)。REQ-007。
 *  成功は useToast (一過性 + コピー完了)、NOT_A_MEMBER 等も toast。
 *  内部で useListInvitations.refresh() を呼ぶ (ADR-007 D2-3/D5-4)。 */
export interface UseGenerateInvitationReturn {
  /** rpc('generate_invitation_code', { target_group_id }) → Returns: 8 hex code(string) */
  generate: (targetGroupId: string) => Promise<ActionResult<string>>
  pending: Ref<boolean>
}

/** useListInvitations — Read。REQ-006。
 *  useAsyncData('invitations-list:{groupId}') の戻り。 */
export type UseListInvitationsReturn = AsyncState<Invitation[]>
