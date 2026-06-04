<script setup lang="ts">
/**
 * PlayerFormModal.vue — 選手追加 / 編集モーダルフォーム
 *
 * 関連タスク: TASK-0007
 * 関連設計: docs/design/player-management/architecture.md / dataflow.md
 *
 * 設計方針:
 *   - mode prop（'create' | 'edit'）で挙動を分岐。
 *   - edit 時は player prop でフォームをプリフィル。
 *   - name は playerNameSchema でクライアント検証し、エラーは UFormField inline に表示（EDGE-007）。
 *   - handedness 未選択時は 'unknown' 既定送信（NFR-202 / EDGE-003）。
 *   - 保存成功で emit('saved')、失敗は useToastErrors().showError（EDGE-008）。
 *
 * スタイル: セミコロンなし / no comma dangle（CLAUDE.md ESLint 規約）
 */

import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { playerNameSchema } from '~/schemas/player-name'
import { useCreatePlayer } from '~/composables/useCreatePlayer'
import { useUpdatePlayer } from '~/composables/useUpdatePlayer'
import { useToastErrors } from '~/composables/useToastErrors'
import type { Player, Handedness, CreatePlayerInput, UpdatePlayerInput } from '~/types/player'

const props = defineProps<{
  mode: 'create' | 'edit'
  player?: Player // edit 時のプリフィル対象（create 時は undefined）
  open: boolean // 親が v-model:open で開閉制御
}>()

const emit = defineEmits<{
  'update:open': [value: boolean]
  // 保存成功 → 親がモーダル閉じ + usePlayers().refresh()
  'saved': []
}>()

const { t } = useI18n()

// composable
const { createPlayer, pending: createPending } = useCreatePlayer()
const { updatePlayer, pending: updatePending } = useUpdatePlayer()
const { showError } = useToastErrors()

// フォーム state
const name = ref('')
const handedness = ref<Handedness>('unknown')
const nameError = ref<string | null>(null) // UFormField inline 用

// pending = createPending || updatePending
const pending = computed(() => createPending.value || updatePending.value)

function resetForm() {
  if (props.mode === 'edit' && props.player) {
    name.value = props.player.name
    handedness.value = props.player.handedness
  } else {
    name.value = ''
    handedness.value = 'unknown' // NFR-202 未選択既定
  }
  nameError.value = null
}

// 開いた瞬間 / 対象変更時にリセット
watch(() => [props.open, props.player, props.mode], () => {
  if (props.open) resetForm()
}, { immediate: true })

// handedness 3択の選択肢（i18n / TASK-0006 と 1:1）
const handednessItems = computed(() => (['right', 'left', 'unknown'] as const).map(v => ({
  value: v,
  label: t(`players.handednessOptions.${v}`)
})))

async function onSubmit() {
  // name クライアント検証（DB CHECK と一致、EDGE-001/002）
  const parsed = playerNameSchema.safeParse(name.value)
  if (!parsed.success) {
    nameError.value = t('errors.invalid_player_name') // inline（EDGE-007）
    return // composable を呼ばない
  }
  nameError.value = null

  let error: unknown
  if (props.mode === 'edit' && props.player) {
    const input: UpdatePlayerInput = { name: parsed.data, handedness: handedness.value }
    ;({ error } = await updatePlayer(props.player.id, input))
  } else {
    const input: CreatePlayerInput = { name: parsed.data, handedness: handedness.value }
    ;({ error } = await createPlayer(input))
  }

  if (error) {
    showError(error) // RLS / 通信 → toast（EDGE-008 / §6④）
    return
  }
  emit('saved') // 成功 → 親が閉じ + refresh
}
</script>

<template>
  <UModal
    :open="open"
    @update:open="emit('update:open', $event)"
  >
    <template #content>
      <UForm
        :state="{ name, handedness }"
        @submit.prevent="onSubmit"
      >
        <h2 class="text-lg font-semibold mb-4">
          {{ mode === 'edit' ? t('players.modalEditTitle') : t('players.modalCreateTitle') }}
        </h2>

        <UFormField
          :label="t('players.nameLabel')"
          name="name"
          :error="nameError ?? undefined"
        >
          <UInput
            v-model="name"
            :placeholder="t('players.namePlaceholder')"
            autofocus
          />
        </UFormField>

        <UFormField
          :label="t('players.handednessLabel')"
          name="handedness"
          class="mt-4"
        >
          <USelect
            v-model="handedness"
            :items="handednessItems"
          />
        </UFormField>

        <div class="mt-6 flex justify-end gap-2">
          <UButton
            color="neutral"
            variant="ghost"
            :label="t('players.cancel')"
            :disabled="pending"
            @click="emit('update:open', false)"
          />
          <UButton
            type="submit"
            :label="t('players.save')"
            :loading="pending"
            :disabled="pending"
          />
        </div>
      </UForm>
    </template>
  </UModal>
</template>
