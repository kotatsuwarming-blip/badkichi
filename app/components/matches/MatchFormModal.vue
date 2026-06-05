<script setup lang="ts">
/**
 * MatchFormModal.vue — 試合追加 / 編集モーダルフォーム
 *
 * 関連タスク: TASK-0008
 * 関連設計: docs/design/match-management/architecture.md / dataflow.md
 *
 * 設計方針:
 *   - mode prop（'create' | 'edit'）で挙動を分岐。edit 時は match prop でプリフィル。
 *   - 4 選手は usePlayers（未削除ロスター）を選択肢に。他枠の選手を選ぶと入れ替え（スワップ）して
 *     重複を防ぐ（NFR-202 / EDGE-001）。選手ちょうど 4 人でも編集で入れ替え可能。
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

// 4 枠は同一ロスター（未削除選手）から選ぶ。選択肢は除外しない。
const playerItems = computed(() => (players.value ?? []).map(p => ({ value: p.id, label: p.name })))

// 既に他枠にいる選手を選んだら、その枠へ自分の元選手を移す（スワップ）。
// → 選手がちょうど 4 人でも入れ替え可能、かつ重複は構造的に発生しない（NFR-202 / EDGE-001 の意図を維持）。
// 注: テンプレートでは ref が自動アンラップされるため、ref を引数で渡さずクロージャに閉じ込める。
const slotRefs = [teamAPlayer1Id, teamAPlayer2Id, teamBPlayer1Id, teamBPlayer2Id]
function makeSelectHandler(target: Ref<string | undefined>) {
  return (value: string | undefined) => {
    const prev = target.value
    if (value != null) {
      const other = slotRefs.find(r => r !== target && r.value === value)
      if (other) other.value = prev // 入れ替え：相手枠に自分の元選手を渡す
    }
    target.value = value
  }
}
const onSelectA1 = makeSelectHandler(teamAPlayer1Id)
const onSelectA2 = makeSelectHandler(teamAPlayer2Id)
const onSelectB1 = makeSelectHandler(teamBPlayer1Id)
const onSelectB2 = makeSelectHandler(teamBPlayer2Id)

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

// 隠し file input をボタンから起動する（素の input より分かりやすい UI）
const fileInput = ref<HTMLInputElement | null>(null)
function triggerFileSelect() {
  fileInput.value?.click()
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
    :title="mode === 'edit' ? t('matches.modalEditTitle') : t('matches.modalCreateTitle')"
    @update:open="emit('update:open', $event)"
  >
    <!-- 本文（縦長なので #body でスクロールさせ、保存ボタンは #footer に固定） -->
    <template #body>
      <div class="flex flex-col gap-4">
        <UFormField
          :label="t('matches.nameLabel')"
          name="name"
          :error="fieldErrors.name"
        >
          <UInput
            v-model="name"
            class="w-full"
            :placeholder="t('matches.namePlaceholder')"
          />
        </UFormField>

        <UFormField
          :label="t('matches.matchDateLabel')"
          name="matchDate"
          :error="fieldErrors.matchDate"
        >
          <UInput
            v-model="matchDate"
            type="date"
            class="w-full"
          />
        </UFormField>

        <UFormField
          :label="t('matches.teamALabel')"
          name="teamA"
          :error="fieldErrors.form"
        >
          <div class="flex flex-col gap-2">
            <USelectMenu
              :model-value="teamAPlayer1Id"
              value-key="value"
              class="w-full"
              :items="playerItems"
              :placeholder="t('matches.playerSlotPlaceholder')"
              @update:model-value="onSelectA1"
            />
            <USelectMenu
              :model-value="teamAPlayer2Id"
              value-key="value"
              class="w-full"
              :items="playerItems"
              :placeholder="t('matches.playerSlotPlaceholder')"
              @update:model-value="onSelectA2"
            />
          </div>
        </UFormField>

        <UFormField
          :label="t('matches.teamBLabel')"
          name="teamB"
        >
          <div class="flex flex-col gap-2">
            <USelectMenu
              :model-value="teamBPlayer1Id"
              value-key="value"
              class="w-full"
              :items="playerItems"
              :placeholder="t('matches.playerSlotPlaceholder')"
              @update:model-value="onSelectB1"
            />
            <USelectMenu
              :model-value="teamBPlayer2Id"
              value-key="value"
              class="w-full"
              :items="playerItems"
              :placeholder="t('matches.playerSlotPlaceholder')"
              @update:model-value="onSelectB2"
            />
          </div>
        </UFormField>

        <UFormField
          :label="t('matches.videoSourceLabel')"
          name="videoSourceType"
        >
          <URadioGroup
            v-model="videoSourceType"
            orientation="horizontal"
            :items="videoSourceItems"
            @update:model-value="onVideoSourceTypeChange"
          />
        </UFormField>

        <UFormField
          v-if="videoSourceType === 'youtube'"
          :label="t('matches.youtubeUrlLabel')"
          name="videoSourceUrl"
          :error="fieldErrors.videoSourceUrl"
        >
          <UInput
            v-model="videoSourceUrl"
            class="w-full"
            :placeholder="t('matches.youtubeUrlPlaceholder')"
          />
        </UFormField>
        <UFormField
          v-else
          :label="t('matches.localFileLabel')"
          name="videoSourceUrl"
          :error="fieldErrors.videoSourceUrl"
        >
          <!-- 隠し input をボタンで起動し、選択済みファイル名を併記（素の file input より分かりやすい） -->
          <div class="flex items-center gap-3">
            <UButton
              color="neutral"
              variant="outline"
              icon="i-lucide-paperclip"
              :label="t('matches.localFileSelect')"
              @click="triggerFileSelect"
            />
            <span class="text-sm text-gray-500 truncate">
              {{ videoSourceUrl || t('matches.localFileNone') }}
            </span>
          </div>
          <input
            ref="fileInput"
            type="file"
            accept="video/*"
            class="hidden"
            @change="onFileSelect"
          >
        </UFormField>
      </div>
    </template>

    <template #footer>
      <div class="flex w-full justify-end gap-2">
        <UButton
          color="neutral"
          variant="ghost"
          :label="t('matches.cancel')"
          :disabled="pending"
          @click="emit('update:open', false)"
        />
        <UButton
          :label="t('matches.save')"
          :loading="pending"
          :disabled="pending"
          @click="onSubmit"
        />
      </div>
    </template>
  </UModal>
</template>
