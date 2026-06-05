<script setup lang="ts">
/**
 * MatchFormModal.vue — 試合追加 / 編集モーダルフォーム
 *
 * 関連タスク: TASK-0008
 * 関連設計: docs/design/match-management/architecture.md / dataflow.md
 *
 * 設計方針:
 *   - mode prop（'create' | 'edit'）で挙動を分岐。edit 時は match prop でプリフィル。
 *   - 4 選手は usePlayers（未削除ロスター）を選択肢に。各枠は他枠選択済を除外（NFR-202 / EDGE-001）。
 *   - 動画ソースは URadioGroup（youtube/local）+ 条件付きフィールド。local=file.name、youtube=URL。
 *   - matchFormSchema でクライアント検証し、エラーは UFormField inline（EDGE-009）。
 *   - youtube の保存値は extractYoutubeId で 11 桁 ID に正規化（REQ-107）。
 *   - 保存成功で emit('saved')、失敗は useToastErrors().showError（EDGE-010）。
 *
 * スタイル: セミコロンなし / no comma dangle（CLAUDE.md ESLint 規約）
 */

import { computed, ref, watch } from 'vue'
import type { Ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { matchFormSchema, extractYoutubeId } from '~/schemas/match-form'
import { usePlayers } from '~/composables/usePlayers'
import { useCreateMatch } from '~/composables/useCreateMatch'
import { useUpdateMatch } from '~/composables/useUpdateMatch'
import { useToastErrors } from '~/composables/useToastErrors'
import type { MatchListItem, CreateMatchInput, UpdateMatchInput, VideoSourceType } from '~/types/match'

const props = defineProps<{
  mode: 'create' | 'edit'
  match?: MatchListItem // edit 時のプリフィル対象（create 時は undefined）
  open: boolean // 親が v-model:open で開閉制御
}>()

const emit = defineEmits<{
  'update:open': [value: boolean]
  // 保存成功 → 親がモーダル閉じ + useMatches().refresh()
  'saved': []
}>()

const { t } = useI18n()

// composable
const { data: players } = usePlayers() // 未削除ロスター（REQ-006）
const { createMatch, pending: createPending } = useCreateMatch()
const { updateMatch, pending: updatePending } = useUpdateMatch()
const { showError } = useToastErrors()

const pending = computed(() => createPending.value || updatePending.value)

// フォーム state
const name = ref('')
const matchDate = ref('') // YYYY-MM-DD
const teamAPlayer1Id = ref<string | undefined>()
const teamAPlayer2Id = ref<string | undefined>()
const teamBPlayer1Id = ref<string | undefined>()
const teamBPlayer2Id = ref<string | undefined>()
const videoSourceType = ref<VideoSourceType>('youtube')
const videoSourceUrl = ref('') // youtube=URL / local=file.name
const fieldErrors = ref<Record<string, string>>({}) // UFormField inline 用

function todayIso(): string {
  return new Date().toISOString().slice(0, 10) // 既定=本日（REQ-008）
}

function resetForm() {
  fieldErrors.value = {}
  if (props.mode === 'edit' && props.match) {
    const m = props.match
    name.value = m.name ?? ''
    matchDate.value = m.matchDate
    teamAPlayer1Id.value = m.teamA[0].id
    teamAPlayer2Id.value = m.teamA[1].id
    teamBPlayer1Id.value = m.teamB[0].id
    teamBPlayer2Id.value = m.teamB[1].id
    videoSourceType.value = m.videoSourceType
    videoSourceUrl.value = m.videoSourceUrl
  } else {
    name.value = ''
    matchDate.value = todayIso()
    teamAPlayer1Id.value = undefined
    teamAPlayer2Id.value = undefined
    teamBPlayer1Id.value = undefined
    teamBPlayer2Id.value = undefined
    videoSourceType.value = 'youtube'
    videoSourceUrl.value = ''
  }
}

watch(() => [props.open, props.match, props.mode], () => {
  if (props.open) resetForm()
}, { immediate: true })

// 自枠以外で選択済の id を除外した選択肢を返す（NFR-202 / EDGE-001）
function itemsExcluding(self: Ref<string | undefined>) {
  return computed(() => {
    const taken = new Set(
      [teamAPlayer1Id, teamAPlayer2Id, teamBPlayer1Id, teamBPlayer2Id]
        .filter(r => r !== self)
        .map(r => r.value)
        .filter((v): v is string => v != null)
    )
    return (players.value ?? [])
      .filter(p => !taken.has(p.id))
      .map(p => ({ value: p.id, label: p.name }))
  })
}
const itemsA1 = itemsExcluding(teamAPlayer1Id)
const itemsA2 = itemsExcluding(teamAPlayer2Id)
const itemsB1 = itemsExcluding(teamBPlayer1Id)
const itemsB2 = itemsExcluding(teamBPlayer2Id)

const videoSourceItems = computed(() =>
  (['youtube', 'local'] as const).map(v => ({
    value: v,
    label: t(`matches.videoSourceOptions.${v}`)
  }))
)

// 種別切替（ユーザ操作）で取り違え防止のため URL をクリア（REQ-106）。
// プリフィル（resetForm の代入）では発火しないよう watch ではなく明示ハンドラにする。
function onVideoSourceTypeChange() {
  videoSourceUrl.value = ''
}

function onFileSelect(event: Event) {
  const file = (event.target as HTMLInputElement).files?.[0]
  if (file) videoSourceUrl.value = file.name // 元ファイル名ラベル（REQ-106）
}

async function onSubmit() {
  fieldErrors.value = {}
  const parsed = matchFormSchema.safeParse({
    name: name.value,
    matchDate: matchDate.value,
    teamAPlayer1Id: teamAPlayer1Id.value,
    teamAPlayer2Id: teamAPlayer2Id.value,
    teamBPlayer1Id: teamBPlayer1Id.value,
    teamBPlayer2Id: teamBPlayer2Id.value,
    videoSourceType: videoSourceType.value,
    videoSourceUrl: videoSourceUrl.value
  })
  if (!parsed.success) {
    for (const issue of parsed.error.issues) {
      const key = String(issue.path[0] ?? 'form')
      fieldErrors.value[key] = t(`errors.${issue.message}`) // inline（EDGE-009）
    }
    return // composable を呼ばない
  }

  // youtube は保存値を 11 桁 ID に正規化（REQ-107 / match-form.ts contract）
  const normalized = { ...parsed.data }
  if (normalized.videoSourceType === 'youtube') {
    normalized.videoSourceUrl = extractYoutubeId(normalized.videoSourceUrl) ?? normalized.videoSourceUrl
  }

  let error: unknown
  if (props.mode === 'edit' && props.match) {
    ;({ error } = await updateMatch(props.match.id, normalized as UpdateMatchInput))
  } else {
    ;({ error } = await createMatch(normalized as CreateMatchInput))
  }
  if (error) {
    showError(error) // RLS / distinct CHECK / 通信 → toast（EDGE-010）
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
        :state="{}"
        @submit.prevent="onSubmit"
      >
        <h2 class="text-lg font-semibold mb-4">
          {{ mode === 'edit' ? t('matches.modalEditTitle') : t('matches.modalCreateTitle') }}
        </h2>

        <UFormField
          :label="t('matches.nameLabel')"
          name="name"
          :error="fieldErrors.name"
        >
          <UInput
            v-model="name"
            :placeholder="t('matches.namePlaceholder')"
          />
        </UFormField>

        <UFormField
          :label="t('matches.matchDateLabel')"
          name="matchDate"
          :error="fieldErrors.matchDate"
          class="mt-4"
        >
          <UInput
            v-model="matchDate"
            type="date"
          />
        </UFormField>

        <UFormField
          :label="t('matches.teamALabel')"
          name="teamA"
          :error="fieldErrors.form"
          class="mt-4"
        >
          <USelectMenu
            v-model="teamAPlayer1Id"
            value-key="value"
            :items="itemsA1"
            :placeholder="t('matches.playerSlotPlaceholder')"
          />
          <USelectMenu
            v-model="teamAPlayer2Id"
            value-key="value"
            :items="itemsA2"
            :placeholder="t('matches.playerSlotPlaceholder')"
            class="mt-2"
          />
        </UFormField>

        <UFormField
          :label="t('matches.teamBLabel')"
          name="teamB"
          class="mt-4"
        >
          <USelectMenu
            v-model="teamBPlayer1Id"
            value-key="value"
            :items="itemsB1"
            :placeholder="t('matches.playerSlotPlaceholder')"
          />
          <USelectMenu
            v-model="teamBPlayer2Id"
            value-key="value"
            :items="itemsB2"
            :placeholder="t('matches.playerSlotPlaceholder')"
            class="mt-2"
          />
        </UFormField>

        <UFormField
          :label="t('matches.videoSourceLabel')"
          name="videoSourceType"
          class="mt-4"
        >
          <URadioGroup
            v-model="videoSourceType"
            :items="videoSourceItems"
            @update:model-value="onVideoSourceTypeChange"
          />
        </UFormField>

        <UFormField
          v-if="videoSourceType === 'youtube'"
          :label="t('matches.youtubeUrlLabel')"
          name="videoSourceUrl"
          :error="fieldErrors.videoSourceUrl"
          class="mt-2"
        >
          <UInput
            v-model="videoSourceUrl"
            :placeholder="t('matches.youtubeUrlPlaceholder')"
          />
        </UFormField>
        <UFormField
          v-else
          :label="t('matches.localFileLabel')"
          name="videoSourceUrl"
          :error="fieldErrors.videoSourceUrl"
          class="mt-2"
        >
          <input
            type="file"
            accept="video/*"
            @change="onFileSelect"
          >
          <p
            v-if="videoSourceUrl"
            class="text-sm text-gray-500 mt-1"
          >
            {{ videoSourceUrl }}
          </p>
        </UFormField>

        <div class="mt-6 flex justify-end gap-2">
          <UButton
            color="neutral"
            variant="ghost"
            :label="t('matches.cancel')"
            :disabled="pending"
            @click="emit('update:open', false)"
          />
          <UButton
            type="submit"
            :label="t('matches.save')"
            :loading="pending"
            :disabled="pending"
          />
        </div>
      </UForm>
    </template>
  </UModal>
</template>
