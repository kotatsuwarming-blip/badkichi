<script setup lang="ts">
/**
 * 【機能概要】: 認証後レイアウト — ヘッダー (ロゴ + ユーザアバター + ログアウト) + <slot />
 * 【適用ページ】: 認証後の全ページ — 無指定で自動適用 (ADR-011 D1)
 * 【実装方針】:
 *   - ログアウトは useLogin().logout() 経由のみ (REQ-406 / ADR-011 D2)
 *   - ユーザアバターは useSupabaseUser() の Google identity を表示 (REQ-006 read only)
 *   - 本ファイル 1 箇所にログアウトを集約。後続 page を追加しても自動継承 (NFR-104 思想)
 * 🔵 ADR-011 D1-D2 + REQ-008 + REQ-006 + architecture.md §レイアウト戦略
 */
const { t } = useI18n()

// 【ログアウト composable】: page/layout から supabase.auth を直叩きしない (REQ-406)
const { logout, pending } = useLogin()

// 【ユーザ情報】: Google identity から表示名 / avatar_url を取得 (REQ-006 read only)
const user = useSupabaseUser()

const userDisplayName = computed(() => {
  return user.value?.user_metadata?.full_name
    ?? user.value?.user_metadata?.name
    ?? user.value?.email
    ?? ''
})

const userAvatarUrl = computed<string | undefined>(() => {
  return user.value?.user_metadata?.avatar_url ?? undefined
})

const userAvatarAlt = computed(() => {
  return userDisplayName.value || t('layout.default.avatar.alt')
})

// 【グループ設定リンク】: 招待リンク発行などを行う /groups/[id]/settings への導線。
// useCurrentGroup() は middleware と同一キー 'current-group' を共有するため追加クエリは発生しない (ADR-008 D4)。
// 所属グループが無い画面 (/onboarding 等) では link を出さない。
const { data: currentGroup } = useCurrentGroup()

const groupSettingsLink = computed<string | undefined>(() => {
  const id = currentGroup.value?.groups?.id
  return id ? `/groups/${id}/settings` : undefined
})

// 【選手管理リンク】: 所属グループの選手ロスター /groups/[id]/players への導線。
// グループ設定リンクと同じく useCurrentGroup() の group id を共有し、所属がある時のみ出す。
const playersLink = computed<string | undefined>(() => {
  const id = currentGroup.value?.groups?.id
  return id ? `/groups/${id}/players` : undefined
})
</script>

<template>
  <div>
    <UHeader>
      <template #left>
        <!-- ロゴ -->
        <NuxtLink
          to="/"
          :aria-label="t('app.name')"
        >
          <AppLogo class="h-8 w-auto shrink-0" />
        </NuxtLink>
      </template>

      <template #right>
        <!-- 選手管理リンク (選手ロスターへの導線、所属グループがある時のみ) -->
        <UButton
          v-if="playersLink"
          :to="playersLink"
          color="neutral"
          variant="ghost"
          icon="i-lucide-users"
          :label="t('layout.default.players')"
          :aria-label="t('layout.default.players')"
        />

        <!-- グループ設定リンク (招待リンク発行などへの導線、所属グループがある時のみ) -->
        <UButton
          v-if="groupSettingsLink"
          :to="groupSettingsLink"
          color="neutral"
          variant="ghost"
          icon="i-lucide-settings"
          :label="t('layout.default.groupSettings')"
          :aria-label="t('layout.default.groupSettings')"
        />

        <!-- ユーザアバター (Google identity、read only) -->
        <UAvatar
          :src="userAvatarUrl"
          :alt="userAvatarAlt"
          size="sm"
        />

        <!-- ログアウトボタン — REQ-008 / ADR-011 D2 (この 1 箇所のみ) -->
        <UButton
          color="neutral"
          variant="ghost"
          :label="t('layout.default.logout')"
          :loading="pending"
          :disabled="pending"
          :aria-label="t('layout.default.logout')"
          @click="logout()"
        />
      </template>
    </UHeader>

    <UMain>
      <slot />
    </UMain>
  </div>
</template>
