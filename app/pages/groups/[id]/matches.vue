<script setup lang="ts">
/**
 * 【機能概要】: 試合管理一覧ページ (/groups/[id]/matches)
 * 【実装方針】:
 *   - 一覧取得: useMatches() で未削除試合を match_date 降順で取得・表示 (REQ-001 / TASK-0003)
 *   - 表示: 試合名（未入力時は対戦カード A1・A2 vs B1・B2）+ 試合日付 (NFR-203)
 *   - 空状態: 0 件で説明文 + 「試合を追加」CTA (REQ-201)
 *   - 選手不足: usePlayers 未削除ロスター < 4 人で追加 disabled + players 導線 (REQ-203)
 *   - 追加/編集: MatchesMatchFormModal を create/edit mode で開き saved 後 refresh (機能2/3)
 *   - 削除: 確認ダイアログ → 承認で useDeleteMatch → refresh (REQ-105 / 機能4)
 *   - layout 無指定: default.vue 自動継承 (ADR-011 D1)
 *   - page から supabase 直叩き禁止 (REQ-403)
 * 🔵 REQ-001 / REQ-004 / REQ-105 / REQ-201 / REQ-203 / REQ-403 / NFR-203 / EDGE-006 / EDGE-007
 */

import { computed, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { useMatches } from '~/composables/useMatches'
import { usePlayers } from '~/composables/usePlayers'
import { useDeleteMatch } from '~/composables/useDeleteMatch'
import { useToastErrors } from '~/composables/useToastErrors'
import type { MatchListItem } from '~/types/match'

const route = useRoute()
const { t } = useI18n()

// 一覧取得（composable 経由・supabase 直叩き禁止, REQ-403）
const { data: matches, pending, error, refresh } = useMatches()

// 選手不足判定（REQ-203）。選択肢は未削除ロスター
const { data: players } = usePlayers()
const hasEnoughPlayers = computed(() => (players.value?.length ?? 0) >= 4)
const playersPath = computed(() => `/groups/${route.params.id}/players`)

// 削除（確認ダイアログ → 承認で実行）
const { deleteMatch, pending: deletePending } = useDeleteMatch()
const { showError } = useToastErrors()

// モーダル状態
const modalOpen = ref(false)
const modalMode = ref<'create' | 'edit'>('create')
const editTarget = ref<MatchListItem | undefined>(undefined)

// 削除確認ダイアログ状態
const confirmOpen = ref(false)
const deleteTarget = ref<MatchListItem | null>(null)

// 試合名 or 対戦カード（NFR-203）。選手名は useMatches が埋め込みで解決済み（削除済も維持, EDGE-007）
function cardLabel(m: MatchListItem): string {
  const a = `${m.teamA[0].name}・${m.teamA[1].name}`
  const b = `${m.teamB[0].name}・${m.teamB[1].name}`
  return `${a} ${t('matches.versus')} ${b}`
}
function titleOf(m: MatchListItem): string {
  return m.name && m.name.length > 0 ? m.name : cardLabel(m)
}

function openCreate() {
  modalMode.value = 'create'
  editTarget.value = undefined
  modalOpen.value = true
}
function openEdit(m: MatchListItem) {
  modalMode.value = 'edit'
  editTarget.value = m
  modalOpen.value = true
}
async function onSaved() {
  modalOpen.value = false // モーダルを閉じる責務は本 page（TASK-0008 は emit のみ）
  await refresh()
}

function askDelete(m: MatchListItem) {
  deleteTarget.value = m
  confirmOpen.value = true // 確認ダイアログを開く（REQ-105）
}
async function onDeleteApprove() {
  if (!deleteTarget.value) return
  const { error: deleteError } = await deleteMatch(deleteTarget.value.id) // composable 経由（REQ-403）
  if (deleteError) {
    showError(deleteError) // 通信 / RLS → toast（EDGE-010）
    return
  }
  confirmOpen.value = false
  deleteTarget.value = null
  await refresh() // 一覧から除外（EDGE-006）
}

// 取得エラーを toast 通知（error-handling §6④）
watch(error, (e) => {
  if (e) showError(e)
})
</script>

<template>
  <UContainer class="py-8">
    <div class="flex max-w-2xl flex-col gap-6 mx-auto">
      <div class="flex items-center justify-between">
        <h1 class="text-2xl font-bold">
          {{ t('matches.title') }}
        </h1>
        <UButton
          :label="t('matches.add')"
          icon="i-lucide-plus"
          :disabled="!hasEnoughPlayers"
          @click="openCreate"
        />
      </div>

      <!-- 選手不足の説明 + 導線（REQ-203） -->
      <UAlert
        v-if="!hasEnoughPlayers"
        color="warning"
        variant="subtle"
        :title="t('matches.notEnoughPlayers')"
      >
        <template #actions>
          <UButton
            :to="playersPath"
            variant="link"
            :label="t('matches.goToPlayers')"
          />
        </template>
      </UAlert>

      <!-- ローディング -->
      <div v-if="pending">
        <USkeleton class="mb-2 h-14 w-full" />
        <USkeleton class="mb-2 h-14 w-full" />
        <USkeleton class="h-14 w-full" />
      </div>

      <!-- 空状態（REQ-201） -->
      <div
        v-else-if="!matches || matches.length === 0"
        class="rounded-lg border border-dashed border-gray-300 p-8 text-center text-gray-500"
      >
        <p class="mb-4">
          {{ t('matches.empty') }}
        </p>
        <UButton
          :label="t('matches.add')"
          icon="i-lucide-plus"
          :disabled="!hasEnoughPlayers"
          @click="openCreate"
        />
      </div>

      <!-- 一覧 -->
      <ul
        v-else
        class="flex flex-col gap-2"
      >
        <li
          v-for="m in matches"
          :key="m.id"
          class="flex items-center justify-between rounded-lg border border-gray-200 p-3"
        >
          <div class="flex flex-col">
            <span class="font-medium">{{ titleOf(m) }}</span>
            <span class="text-sm text-gray-500">{{ m.matchDate }}</span>
          </div>
          <div class="flex items-center gap-2">
            <UButton
              color="primary"
              variant="soft"
              size="sm"
              icon="i-lucide-circle-dot"
              :to="`/groups/${route.params.id}/matches/${m.id}/record`"
              :aria-label="t('matches.record')"
              :label="t('matches.record')"
            />
            <UButton
              color="neutral"
              variant="ghost"
              size="sm"
              icon="i-lucide-pencil"
              :aria-label="t('matches.edit')"
              :label="t('matches.edit')"
              @click="openEdit(m)"
            />
            <UButton
              color="error"
              variant="ghost"
              size="sm"
              icon="i-lucide-trash-2"
              :aria-label="t('matches.delete')"
              :label="t('matches.delete')"
              :disabled="deletePending"
              @click="askDelete(m)"
            />
          </div>
        </li>
      </ul>
    </div>

    <MatchesMatchFormModal
      v-model:open="modalOpen"
      :mode="modalMode"
      :match="editTarget"
      @saved="onSaved"
    />

    <!-- 削除確認ダイアログ（REQ-105） -->
    <UModal v-model:open="confirmOpen">
      <template #content>
        <div class="p-4">
          <h2 class="text-lg font-semibold mb-2">
            {{ t('matches.deleteConfirmTitle') }}
          </h2>
          <p class="mb-4 text-gray-600">
            {{ t('matches.deleteConfirmMessage') }}
          </p>
          <div class="flex justify-end gap-2">
            <UButton
              color="neutral"
              variant="ghost"
              :label="t('matches.cancel')"
              :disabled="deletePending"
              @click="confirmOpen = false"
            />
            <UButton
              color="error"
              :label="t('matches.deleteConfirmApprove')"
              :loading="deletePending"
              :disabled="deletePending"
              @click="onDeleteApprove"
            />
          </div>
        </div>
      </template>
    </UModal>
  </UContainer>
</template>
