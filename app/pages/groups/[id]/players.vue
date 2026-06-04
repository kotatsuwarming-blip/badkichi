<script setup lang="ts">
/**
 * 【機能概要】: 選手管理一覧ページ (/groups/[id]/players)
 * 【実装方針】:
 *   - 一覧取得: usePlayers() で未削除選手を取得・表示 (REQ-001 / TASK-0002)
 *   - 空状態: 0 件で説明文 + 「選手を追加」CTA (REQ-201)
 *   - 追加: PlayersPlayerFormModal を create mode で開く (機能2)
 *   - 編集: PlayersPlayerFormModal を edit mode で開く (機能3)
 *   - 削除: 確認ダイアログなしで useDeletePlayer.deletePlayer 即実行 → refresh() (REQ-103 / 機能4)
 *   - layout 無指定: default.vue 自動継承 (ADR-011 D1)
 *   - page から supabase 直叩き禁止 (REQ-403 / ADR-005 D1)
 *   - 全 UI 文言は i18n 経由 (NFR-204)
 * 🔵 REQ-001 / REQ-103 / REQ-104 / REQ-201 / REQ-403 / NFR-001 / EDGE-005
 */

import { ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { usePlayers } from '~/composables/usePlayers'
import { useDeletePlayer } from '~/composables/useDeletePlayer'
import { useToastErrors } from '~/composables/useToastErrors'
import type { Player } from '~/types/player'

// 【i18n 初期化】: 全 UI 文言は locales/ja.json 経由。コードに文字列リテラルを直書きしない (NFR-204) 🔵
const { t } = useI18n()

// 【一覧取得】: composable 経由・supabase 直叩き禁止 (REQ-403) 🔵
const { data: players, pending, error, refresh } = usePlayers()

// 【削除 composable】: 確認ダイアログなし即実行 (REQ-103) / composable 経由 (REQ-403) 🔵
const { deletePlayer, pending: deletePending } = useDeletePlayer()

// 【エラートースト】: 取得失敗・削除失敗を toast で通知 (error-handling §6④) 🔵
const { showError } = useToastErrors()

// 【モーダル状態】: open / mode / 編集対象 player 🔵
const modalOpen = ref(false)
const modalMode = ref<'create' | 'edit'>('create')
const editTarget = ref<Player | undefined>(undefined)

/**
 * 【機能概要】: 「選手を追加」CTA / ヘッダーボタンのハンドラ
 * 【実装方針】: create mode でモーダルを開く (dataflow.md 機能2) 🔵
 */
function openCreate() {
  modalMode.value = 'create'
  editTarget.value = undefined
  modalOpen.value = true
}

/**
 * 【機能概要】: 編集ボタンのハンドラ
 * 【実装方針】: edit mode + 対象 player でモーダルを開く (dataflow.md 機能3) 🔵
 * @param player - 編集対象の選手
 */
function openEdit(player: Player) {
  modalMode.value = 'edit'
  editTarget.value = player
  modalOpen.value = true
}

/**
 * 【機能概要】: PlayerFormModal の saved イベントハンドラ
 * 【実装方針】: モーダルを閉じて一覧を再取得する (TASK-0007 注意事項 / 機能2・3 成功後) 🔵
 */
async function onSaved() {
  // 【モーダルを閉じる責務は本 page】(TASK-0007 は emit のみ) 🔵
  modalOpen.value = false
  // 【一覧再取得】: refresh() で最新状態を反映 🔵
  await refresh()
}

/**
 * 【機能概要】: 削除ボタンのハンドラ
 * 【実装方針】: 確認ダイアログを出さず deletePlayer(id) を即実行 (REQ-103)。
 *             error なら showError (EDGE-006)、無ければ refresh (EDGE-005)。
 * 🔵 TC-004-01 / REQ-103 / REQ-104 / EDGE-005 / EDGE-006
 * @param id - 削除対象の選手 ID
 */
async function onDelete(id: Player['id']) {
  // 【確認ダイアログなし】: REQ-103 に従い即実行 🔵
  const { error: deleteError } = await deletePlayer(id)
  if (deleteError) {
    // 【削除失敗 toast】: RLS / 通信エラーを toast 通知 (error-handling §6④) 🔵
    showError(deleteError)
    return
  }
  // 【一覧再取得】: deleted_at IS NULL フィルタで削除行が除外される (EDGE-005) 🔵
  await refresh()
}

// 【取得エラー監視】: usePlayers() の error を watch して toast 通知 (error-handling §6④) 🔵
watch(error, (e) => {
  if (e) showError(e)
})
</script>

<template>
  <!-- 【ページルート】: default.vue の <slot /> に差し込まれる (layout 無指定で自動継承, ADR-011 D1) -->
  <UContainer class="py-8">
    <div class="flex max-w-2xl flex-col gap-6 mx-auto">
      <!-- 【ページヘッダー】: タイトル + 追加ボタン -->
      <div class="flex items-center justify-between">
        <h1 class="text-2xl font-bold">
          {{ t('players.title') }}
        </h1>
        <UButton
          :label="t('players.add')"
          icon="i-lucide-plus"
          @click="openCreate"
        />
      </div>

      <!-- 【ローディング状態】: pending=true 中は USkeleton を表示 (NFR-202) 🔵 -->
      <div v-if="pending">
        <USkeleton class="mb-2 h-12 w-full" />
        <USkeleton class="mb-2 h-12 w-full" />
        <USkeleton class="h-12 w-full" />
      </div>

      <!-- 【空状態】: 0 件の場合は説明文 + CTA を表示 (REQ-201 / TC-001-03) 🔵 -->
      <div
        v-else-if="!players || players.length === 0"
        class="rounded-lg border border-dashed border-gray-300 p-8 text-center text-gray-500"
      >
        <p class="mb-4">
          {{ t('players.empty') }}
        </p>
        <UButton
          :label="t('players.add')"
          icon="i-lucide-plus"
          @click="openCreate"
        />
      </div>

      <!-- 【選手一覧】: 1 件以上の場合に name / handedness + 操作ボタンを表示 (REQ-001) 🔵 -->
      <ul
        v-else
        class="flex flex-col gap-2"
      >
        <li
          v-for="player in players"
          :key="player.id"
          class="flex items-center justify-between rounded-lg border border-gray-200 p-3"
        >
          <!-- 【選手名】: name を表示 (REQ-001) 🔵 -->
          <span class="font-medium">{{ player.name }}</span>
          <div class="flex items-center gap-2">
            <!-- 【利き手ラベル】: t('players.handednessOptions.{handedness}') (TASK-0006 と 1:1) 🔵 -->
            <span class="text-sm text-gray-500">
              {{ t(`players.handednessOptions.${player.handedness}`) }}
            </span>
            <!-- 【編集ボタン】: aria-label で読み上げ対応 (NFR-301) / edit mode でモーダルを開く 🔵 -->
            <UButton
              color="neutral"
              variant="ghost"
              size="sm"
              icon="i-lucide-pencil"
              :aria-label="t('players.edit')"
              :label="t('players.edit')"
              @click="openEdit(player)"
            />
            <!-- 【削除ボタン】: aria-label で読み上げ対応 (NFR-301) / 確認なし即実行 (REQ-103) 🔵 -->
            <UButton
              color="error"
              variant="ghost"
              size="sm"
              icon="i-lucide-trash-2"
              :aria-label="t('players.delete')"
              :label="t('players.delete')"
              :disabled="deletePending"
              @click="onDelete(player.id)"
            />
          </div>
        </li>
      </ul>
    </div>

    <!-- 【PlayerFormModal】: create / edit 共通モーダル。open/mode/player/saved を制御 (TASK-0007) 🔵 -->
    <PlayersPlayerFormModal
      v-model:open="modalOpen"
      :mode="modalMode"
      :player="editTarget"
      @saved="onSaved"
    />
  </UContainer>
</template>
