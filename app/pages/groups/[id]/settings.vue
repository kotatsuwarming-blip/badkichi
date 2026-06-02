<script setup lang="ts">
/**
 * 【機能概要】: グループ設定ページ (/groups/[id]/settings)
 * 【実装方針】:
 *   - 招待リンク一覧: useListInvitations(groupId) で取得・表示 (TASK-0012 実装済)
 *   - 招待状態派生: deriveInvitationStatus(expiresAt, now) で 'active' / 'expired' を算出 (EDGE-107)
 *   - 招待 URL: useRequestURL().origin + '/join/' + code で組み立て (REQ-408 / SSR 対応)
 *   - コピー機能: navigator.clipboard.writeText() + toast「URLをコピーしました」2秒 (NFR-203)
 *   - 招待コード生成: useGenerateInvitation().generate(groupId) (TASK-0012 実装済)
 *   - メンバー一覧: useListGroupMembers(groupId) で user_id 一覧を取得 (REQ-406 composable 経由)
 *     現在ログイン中ユーザーのみ useSupabaseUser() から表示名+avatar を取得 (RLS 制約のため)
 *   - layout 無指定: default.vue 自動継承 (ADR-011 D1)
 *   - page から supabase 直叩き禁止 (REQ-406 / ADR-005 D1)
 *   - 全 UI 文言は i18n 経由 (NFR-204)
 * 🔵 REQ-006 / REQ-007 / REQ-110 / REQ-405 / REQ-406 / REQ-408
 * 🔵 NFR-202 / NFR-203 / NFR-204 / EDGE-003 / EDGE-107 / ADR-005 / ADR-011
 */

import { deriveInvitationStatus } from '~/utils/invitation'

// 【i18n 初期化】: 全 UI 文言は locales/ja.json 経由。コードに文字列リテラルを直書きしない (NFR-204) 🔵
const { t } = useI18n()

// 【ルートパラメータ取得】: route.params.id でグループ UUID を取得 🔵
const route = useRoute()
const groupId = computed(() => String(route.params.id))

// 【現在ユーザー取得】: useSupabaseUser() でログイン中ユーザーの情報を取得
//   メンバー一覧で自分のみ表示名・avatar を補完するために使用 (RLS 制約対応) 🔵
const currentUser = useSupabaseUser()

// 【現在ユーザーの表示名】: Google identity の full_name / name / email でフォールバック (REQ-006) 🔵
const currentUserDisplayName = computed(() => {
  return currentUser.value?.user_metadata?.full_name
    ?? currentUser.value?.user_metadata?.name
    ?? currentUser.value?.email
    ?? ''
})

// 【現在ユーザーの avatar URL】: Google identity の avatar_url (REQ-006 read only) 🔵
const currentUserAvatarUrl = computed<string | undefined>(() => {
  return currentUser.value?.user_metadata?.avatar_url ?? undefined
})

// 【useRequestURL 取得】: SSR 環境での origin 取得 (window.location 直参照禁止, REQ-408) 🔵
const requestUrl = useRequestURL()

// ─── 招待リンク ──────────────────────────────────────────────────────────────

// 【招待リンク一覧取得】: useListInvitations(groupId) composable 経由 (TASK-0012 実装済, REQ-406) 🔵
const {
  data: invitations,
  pending: invitationsPending
} = useListInvitations(groupId.value)

// 【招待コード生成】: useGenerateInvitation() composable 経由 (TASK-0012 実装済, REQ-406) 🔵
const { generate, pending: generatePending } = useGenerateInvitation()

/**
 * 【機能概要】: 招待コード生成ボタンのハンドラ
 * 【実装方針】: useGenerateInvitation().generate(groupId) を呼ぶのみ。
 *             成功時の一覧更新・成功 toast は composable 内で処理 (D5-4)。
 *             エラー時の toast 表示も composable 内 useToastErrors で処理。
 * 🔵 dataflow.md §5 D5-1〜D5-4 / TASK-0012 実装済
 */
async function onGenerateInvitation() {
  // 【generate 実行】: composable 経由で generate_invitation_code RPC を呼ぶ (REQ-406) 🔵
  await generate(groupId.value)
}

/**
 * 【機能概要】: 招待 URL を生成して返す
 * 【実装方針】: RPC は 8 hex の code のみ返す。URL 組立は page の責務 (architecture.md §既存 API マッピング)。
 *             SSR 環境の host 取得に useRequestURL().origin を使用 (window.location 直参照禁止, REQ-408)。
 * 🔵 REQ-408 / dataflow.md §5
 * @param code - 招待コード (8 hex)
 * @returns 完全な招待 URL
 */
function buildInvitationUrl(code: string): string {
  // 【URL 組立】: origin + /join/ + code の形式で組み立てる 🔵
  return requestUrl.origin + '/join/' + code
}

/**
 * 【機能概要】: 招待 URL をクリップボードにコピーしてトーストを表示する
 * 【実装方針】: navigator.clipboard.writeText() でコピー後、
 *             useToast().add() で「URLをコピーしました」を 2 秒表示 (NFR-203)。
 * 【SSR ガード】: この関数を呼ぶコピーボタンは template 内で <ClientOnly> でラップ済み。
 *               そのため navigator.clipboard は常にクライアントサイドで実行され、
 *               SSR 時にこの関数が呼ばれることはない。
 * 🔵 NFR-203
 * @param code - 招待コード (8 hex)
 */
async function copyInvitationUrl(code: string) {
  // 【URL 組立】: コピー対象の完全な招待 URL を組み立てる 🔵
  const url = buildInvitationUrl(code)

  // 【クリップボードへ書き込み】: navigator.clipboard はブラウザ API。
  //   呼び出し元ボタンが <ClientOnly> でガード済みのため SSR 時は到達しない。 🔵
  await navigator.clipboard.writeText(url)

  // 【コピー完了トースト】: 2 秒間「URLをコピーしました」を表示 (NFR-203) 🔵
  const toast = useToast()
  toast.add({
    title: t('groups.settings.urlCopied'),
    duration: 2000
  })
}

/**
 * 【機能概要】: 招待ステータスのラベルを返す
 * 【実装方針】: deriveInvitationStatus の戻り値を i18n キーに対応させる (NFR-204) 🔵
 * @param expiresAt - 招待リンクの有効期限 ISO 文字列 (group_invitations.expires_at)
 * @returns i18n 済みのステータスラベル
 */
function getStatusLabel(expiresAt: string): string {
  // 【ms 変換】: ISO 文字列を epoch ms に変換して deriveInvitationStatus に渡す (testcases.md §0 呼び出し側の責務) 🔵
  const status = deriveInvitationStatus(Date.parse(expiresAt), Date.now())
  // 【ラベル変換】: 'active' / 'expired' を i18n キーで文言化 (NFR-204) 🔵
  return status === 'active'
    ? t('groups.settings.statusActive')
    : t('groups.settings.statusExpired')
}

// ─── メンバー一覧 ─────────────────────────────────────────────────────────────

// 【メンバー一覧取得】: useListGroupMembers(groupId) composable 経由 (REQ-406 / ADR-005 D1) 🟡
const {
  data: members,
  pending: membersPending
} = useListGroupMembers(groupId.value)

/**
 * 【機能概要】: メンバーの表示名を返す
 * 【実装方針】: 現在ログイン中ユーザーと user_id が一致する場合のみ
 *             useSupabaseUser() の user_metadata から表示名を取得する。
 *             他メンバーは Supabase RLS 制約により user_metadata を取得できないため
 *             user_id の末尾 8 文字をフォールバックとして表示する。
 * 🟡 信頼性レベル: RLS 制約により他メンバーのメタデータ取得が不可のため実装時に確定した方針
 *
 * TODO: profiles テーブル追加後は useListGroupMembers が display_name を返すようになるため、
 *       この関数を削除して member.display_name を直接参照する形にリファクタリングする。
 *       それまでは user_id 末尾8文字の暫定表示で対応している。
 * @param userId - メンバーの user_id
 * @returns 表示名文字列
 */
function getMemberDisplayName(userId: string): string {
  // 【現在ユーザーとの照合】: user_id が一致する場合のみフルネームを返す 🟡
  if (currentUser.value?.sub === userId) {
    return currentUserDisplayName.value || userId.slice(-8)
  }
  // 【フォールバック】: 他メンバーは user_id の末尾 8 文字を仮表示 (RLS 制約対応) 🟡
  // TODO: profiles テーブル追加後は display_name で置き換える
  return userId.slice(-8)
}

/**
 * 【機能概要】: メンバーの avatar URL を返す
 * 【実装方針】: 現在ログイン中ユーザーのみ avatar_url を取得可能。他メンバーは undefined を返す。
 * 🟡 信頼性レベル: RLS 制約により他メンバーの avatar 取得が不可のため実装時に確定した方針
 *
 * TODO: profiles テーブル追加後は useListGroupMembers が avatar_url を返すようになるため、
 *       この関数を削除して member.avatar_url を直接参照する形にリファクタリングする。
 * @param userId - メンバーの user_id
 * @returns avatar URL または undefined
 */
function getMemberAvatarUrl(userId: string): string | undefined {
  // 【現在ユーザーとの照合】: user_id が一致する場合のみ avatar_url を返す 🟡
  // TODO: profiles テーブル追加後は全メンバーの avatar_url を返せるよう拡張する
  if (currentUser.value?.sub === userId) {
    return currentUserAvatarUrl.value
  }
  return undefined
}
</script>

<template>
  <!-- 【ページルート】: default.vue の <slot /> に差し込まれる (layout 無指定で自動継承, ADR-011 D1) -->
  <UContainer class="py-8">
    <div class="flex max-w-2xl flex-col gap-8 mx-auto">
      <!-- 【ページタイトル】: locales/ja.json groups.settings.title (NFR-204) 🔵 -->
      <h1 class="text-2xl font-bold">
        {{ t('groups.settings.title') }}
      </h1>

      <!-- ─── 招待リンクセクション ──────────────────────────────────────────── -->
      <section>
        <!-- 【招待リンクセクションタイトル】 🔵 -->
        <h2 class="mb-4 text-xl font-semibold">
          {{ t('groups.settings.invitationsTitle') }}
        </h2>

        <!-- 【招待コード発行ボタン】:
             - pending 中 (invitationsPending || generatePending) はボタン disabled (EDGE-003 / NFR-202)
             - useGenerateInvitation().generate(groupId) を呼ぶ 🔵 -->
        <UButton
          class="mb-4"
          :label="t('groups.settings.generateInvitation')"
          :loading="generatePending"
          :disabled="generatePending || invitationsPending"
          @click="onGenerateInvitation"
        />

        <!-- 【ローディング状態】: invitationsPending=true 中は USkeleton を表示 (NFR-202) 🔵 -->
        <div v-if="invitationsPending">
          <USkeleton class="mb-2 h-10 w-full" />
          <USkeleton class="mb-2 h-10 w-full" />
          <USkeleton class="h-10 w-full" />
        </div>

        <!-- 【招待リンク一覧】: Invitation[] が存在する場合に表示 🔵 -->
        <div
          v-else-if="invitations && invitations.length > 0"
          class="flex flex-col gap-2"
        >
          <!-- 【招待リンク各行】: code / created_at / expires_at / 状態 / コピーボタン 🔵 -->
          <div
            v-for="invitation in invitations"
            :key="invitation.id"
            class="flex flex-wrap items-center gap-2 rounded-lg border border-gray-200 p-3"
          >
            <!-- 【ステータスバッジ】: deriveInvitationStatus で派生算出 (EDGE-107) 🔵 -->
            <UBadge
              :color="deriveInvitationStatus(Date.parse(invitation.expires_at), Date.now()) === 'active' ? 'success' : 'neutral'"
              :label="getStatusLabel(invitation.expires_at)"
              variant="subtle"
            />

            <!-- 【発行日】: created_at を表示 🔵 -->
            <span class="text-sm text-gray-600">
              {{ t('groups.settings.issuedAt') }}: {{ new Date(invitation.created_at).toLocaleDateString() }}
            </span>

            <!-- 【期限】: expires_at を表示 🔵 -->
            <span class="text-sm text-gray-600">
              {{ t('groups.settings.expiresAt') }}: {{ new Date(invitation.expires_at).toLocaleDateString() }}
            </span>

            <!-- 【招待 URL 表示】: useRequestURL().origin + /join/ + code で組み立て (REQ-408) 🔵 -->
            <span class="break-all text-sm font-mono text-gray-800">
              {{ buildInvitationUrl(invitation.code) }}
            </span>

            <!-- 【コピーボタン】: クリップボードへ URL をコピー + toast 2秒 (NFR-203) 🔵 -->
            <!-- ClientOnly: navigator.clipboard は ブラウザ API のため SSR 時は非表示 -->
            <ClientOnly>
              <UButton
                color="neutral"
                variant="ghost"
                size="sm"
                :label="t('groups.settings.copyUrl')"
                icon="i-lucide-copy"
                @click="copyInvitationUrl(invitation.code)"
              />
            </ClientOnly>
          </div>
        </div>

        <!-- 【空一覧】: 招待リンクが存在しない場合の空状態 🔵 -->
        <div
          v-else
          class="rounded-lg border border-dashed border-gray-300 p-6 text-center text-gray-500"
        >
          {{ t('groups.settings.noInvitations') }}
        </div>
      </section>

      <!-- ─── メンバーセクション ──────────────────────────────────────────────── -->
      <section>
        <!-- 【メンバーセクションタイトル】 🔵 -->
        <h2 class="mb-4 text-xl font-semibold">
          {{ t('groups.settings.membersTitle') }}
        </h2>

        <!-- 【ローディング状態】: membersPending=true 中は USkeleton を表示 (NFR-202) 🟡 -->
        <div v-if="membersPending">
          <USkeleton class="mb-2 h-12 w-full" />
          <USkeleton class="mb-2 h-12 w-full" />
          <USkeleton class="h-12 w-full" />
        </div>

        <!-- 【メンバー一覧】: GroupMember[] が存在する場合に表示 🟡 -->
        <div
          v-else-if="members && members.length > 0"
          class="flex flex-col gap-2"
        >
          <!-- 【各メンバー行】: avatar + 表示名 (read only) 🟡 -->
          <div
            v-for="member in members"
            :key="member.user_id"
            class="flex items-center gap-3 rounded-lg border border-gray-200 p-3"
          >
            <!-- 【メンバーアバター】: 現在ユーザーのみ Google avatar を表示 (REQ-006 read only) 🟡 -->
            <UAvatar
              :src="getMemberAvatarUrl(member.user_id)"
              :alt="getMemberDisplayName(member.user_id)"
              size="sm"
            />

            <!-- 【メンバー表示名】: 現在ユーザーのみ user_metadata から、他は user_id 末尾8文字 🟡 -->
            <span class="text-sm font-medium">
              {{ getMemberDisplayName(member.user_id) }}
            </span>
          </div>
        </div>

        <!-- 【空一覧】: メンバーが存在しない場合の空状態 🔵 -->
        <div
          v-else
          class="rounded-lg border border-dashed border-gray-300 p-6 text-center text-gray-500"
        >
          {{ t('groups.settings.noMembers') }}
        </div>
      </section>
    </div>
  </UContainer>
</template>
