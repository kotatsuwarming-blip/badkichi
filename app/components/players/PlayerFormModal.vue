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
import type { Player, Handedness, RosterType, CreatePlayerInput, UpdatePlayerInput, PlayerProfileInput } from '~/types/player'
import { PLAY_STYLES, PRACTICE_FREQUENCIES, PROFILE_LIMITS, deriveAge, deriveCareerYears, emptyProfileInput, sinceFromYears, toProfileInput, validateProfileInput } from '~/utils/players/profile'

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
const rosterType = ref<RosterType>('member') // player-profile REQ-002: 新規時から選択可・既定は自チーム
const profile = ref<PlayerProfileInput>(emptyProfileInput()) // 詳細プロフィール (全項目任意, REQ-103)
const profileOpen = ref(false) // 折りたたみ状態 (入力済みがあれば edit 時に開く)
const nameError = ref<string | null>(null) // UFormField inline 用
const profileErrors = ref<string[]>([]) // プロフィール検証エラー (i18n キー, EDGE-001)

// pending = createPending || updatePending
const pending = computed(() => createPending.value || updatePending.value)

function resetForm() {
  if (props.mode === 'edit' && props.player) {
    name.value = props.player.name
    handedness.value = props.player.handedness
    rosterType.value = props.player.roster_type
    profile.value = toProfileInput(props.player)
    // 入力済み項目がある場合は開いた状態で見せる
    const pr = profile.value
    profileOpen.value = pr.sex !== 'unspecified' || pr.heightCm !== null || pr.weightKg !== null
      || pr.birthdate !== null || pr.badmintonSince !== null || pr.practiceFrequency !== null
      || pr.playStyles.length > 0
  } else {
    name.value = ''
    handedness.value = 'unknown' // NFR-202 未選択既定
    rosterType.value = 'member'
    profile.value = emptyProfileInput()
    profileOpen.value = false
  }
  nameError.value = null
  profileErrors.value = []
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

// ---- 詳細プロフィール (player-profile PR ②) ----
const sexItems = computed(() => (['unspecified', 'male', 'female'] as const).map(v => ({
  value: v, label: t(`players.profile.sexOptions.${v}`)
})))
const frequencyItems = computed(() => [
  { value: null as string | null, label: t('players.profile.unset') },
  ...PRACTICE_FREQUENCIES.map(v => ({ value: v as string | null, label: t(`players.profile.frequencyOptions.${v}`) }))
])

/** 年齢・歴のライブプレビュー (REQ-105) */
const agePreview = computed(() => deriveAge(profile.value.birthdate))
const careerPreview = computed(() => deriveCareerYears(profile.value.badmintonSince))

// badminton_since は月単位入力 (input type=month の YYYY-MM ⇄ 保存 YYYY-MM-01, REQ-101)
const sinceMonth = computed({
  get: () => profile.value.badmintonSince?.slice(0, 7) ?? '',
  set: (v: string) => { profile.value.badmintonSince = v ? `${v}-01` : null }
})

// 「歴 n 年」の直接入力 → 開始時期へ逆算保存 (REQ-101)
function onYearsInput(e: Event): void {
  const raw = (e.target as HTMLInputElement).value
  if (raw === '') return
  const years = Number(raw)
  if (!Number.isFinite(years) || years < 0) return
  profile.value.badmintonSince = sinceFromYears(years)
}

function togglePlayStyle(style: (typeof PLAY_STYLES)[number]): void {
  const list = profile.value.playStyles
  profile.value.playStyles = list.includes(style) ? list.filter(v => v !== style) : [...list, style]
}

/** 数値入力 (身長/体重)。空文字は null (任意入力, REQ-103) */
function numOrNull(e: Event): number | null {
  const raw = (e.target as HTMLInputElement).value
  if (raw === '') return null
  const n = Number(raw)
  return Number.isFinite(n) ? n : null
}

async function onSubmit() {
  // name クライアント検証（DB CHECK と一致、EDGE-001/002）
  const parsed = playerNameSchema.safeParse(name.value)
  if (!parsed.success) {
    nameError.value = t('errors.invalid_player_name') // inline（EDGE-007）
    return // composable を呼ばない
  }
  nameError.value = null

  // プロフィール検証 (未来日・birthdate より前の since・範囲, EDGE-001)
  profileErrors.value = validateProfileInput(profile.value)
  if (profileErrors.value.length > 0) {
    profileOpen.value = true
    return
  }

  let error: unknown
  if (props.mode === 'edit' && props.player) {
    const input: UpdatePlayerInput = { name: parsed.data, handedness: handedness.value, rosterType: rosterType.value, profile: profile.value }
    ;({ error } = await updatePlayer(props.player.id, input))
  } else {
    const input: CreatePlayerInput = { name: parsed.data, handedness: handedness.value, rosterType: rosterType.value, profile: profile.value }
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
    :title="mode === 'edit' ? t('players.modalEditTitle') : t('players.modalCreateTitle')"
    @update:open="emit('update:open', $event)"
  >
    <!-- 本文（プロフィール展開で縦長になるため #body でスクロール、ボタンは #footer 固定。
         MatchFormModal と同構造, 2026-09-28 スクロール不能バグ修正） -->
    <template #body>
      <UForm
        :state="{ name, handedness }"
        @submit.prevent="onSubmit"
      >
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

        <!-- メンバー区分（player-profile REQ-002: 新規登録時から選択可・既定は自チーム） -->
        <UFormField
          :label="t('players.rosterTypeLabel')"
          name="rosterType"
          class="mt-4"
        >
          <div
            class="flex gap-2"
            role="radiogroup"
            :aria-label="t('players.rosterTypeLabel')"
          >
            <UButton
              v-for="v in (['member', 'opponent'] as const)"
              :key="v"
              :color="rosterType === v ? 'primary' : 'neutral'"
              :variant="rosterType === v ? 'solid' : 'outline'"
              size="sm"
              role="radio"
              :aria-checked="rosterType === v"
              :data-testid="`roster-type-${v}`"
              :label="t(`players.rosterTypeOptions.${v}`)"
              @click="rosterType = v"
            />
          </div>
        </UFormField>

        <!-- 詳細プロフィール（player-profile PR ②, REQ-103。全項目任意・折りたたみ） -->
        <div class="mt-4">
          <UButton
            variant="ghost"
            color="neutral"
            size="sm"
            :icon="profileOpen ? 'i-lucide-chevron-down' : 'i-lucide-chevron-right'"
            data-testid="profile-toggle"
            :aria-expanded="profileOpen"
            @click="profileOpen = !profileOpen"
          >
            {{ t('players.profile.sectionTitle') }}
          </UButton>

          <div
            v-show="profileOpen"
            class="mt-2 flex flex-col gap-4 rounded-lg border border-gray-200 p-3"
            data-testid="profile-section"
          >
            <p
              v-for="key in profileErrors"
              :key="key"
              class="text-sm text-red-600"
              data-testid="profile-error"
            >
              {{ t(key) }}
            </p>

            <UFormField :label="t('players.profile.sexLabel')">
              <USelect
                v-model="profile.sex"
                :items="sexItems"
                data-testid="profile-sex"
              />
            </UFormField>

            <div class="flex gap-3">
              <UFormField :label="t('players.profile.heightLabel')">
                <UInput
                  type="number"
                  :min="PROFILE_LIMITS.heightCm.min"
                  :max="PROFILE_LIMITS.heightCm.max"
                  :model-value="profile.heightCm === null ? '' : String(profile.heightCm)"
                  data-testid="profile-height"
                  @input="profile.heightCm = numOrNull($event)"
                />
              </UFormField>
              <UFormField :label="t('players.profile.weightLabel')">
                <UInput
                  type="number"
                  step="0.1"
                  :min="PROFILE_LIMITS.weightKg.min"
                  :max="PROFILE_LIMITS.weightKg.max"
                  :model-value="profile.weightKg === null ? '' : String(profile.weightKg)"
                  data-testid="profile-weight"
                  @input="profile.weightKg = numOrNull($event)"
                />
              </UFormField>
            </div>

            <UFormField :label="t('players.profile.birthdateLabel')">
              <div class="flex items-center gap-2">
                <UInput
                  type="date"
                  :model-value="profile.birthdate ?? ''"
                  data-testid="profile-birthdate"
                  @input="profile.birthdate = ($event.target as HTMLInputElement).value || null"
                />
                <span
                  v-if="agePreview !== null"
                  class="text-sm text-gray-500"
                  data-testid="profile-age-preview"
                >{{ t('players.profile.agePreview', { age: agePreview }) }}</span>
              </div>
            </UFormField>

            <UFormField
              :label="t('players.profile.sinceLabel')"
              :help="t('players.profile.sinceHelp')"
            >
              <div class="flex items-center gap-2">
                <UInput
                  v-model="sinceMonth"
                  type="month"
                  data-testid="profile-since"
                />
                <UInput
                  type="number"
                  min="0"
                  class="w-24"
                  :model-value="careerPreview === null ? '' : String(careerPreview)"
                  :placeholder="t('players.profile.yearsPlaceholder')"
                  data-testid="profile-years"
                  @change="onYearsInput"
                />
                <span
                  v-if="careerPreview !== null"
                  class="text-sm text-gray-500"
                  data-testid="profile-career-preview"
                >{{ careerPreview === 0 ? t('players.profile.careerUnderOne') : t('players.profile.careerPreview', { years: careerPreview }) }}</span>
              </div>
            </UFormField>

            <UFormField :label="t('players.profile.frequencyLabel')">
              <USelect
                v-model="profile.practiceFrequency"
                :items="frequencyItems"
                data-testid="profile-frequency"
              />
            </UFormField>

            <UFormField :label="t('players.profile.stylesLabel')">
              <div class="flex flex-wrap gap-2">
                <UButton
                  v-for="style in PLAY_STYLES"
                  :key="style"
                  size="xs"
                  :color="profile.playStyles.includes(style) ? 'primary' : 'neutral'"
                  :variant="profile.playStyles.includes(style) ? 'solid' : 'outline'"
                  role="checkbox"
                  :aria-checked="profile.playStyles.includes(style)"
                  :data-testid="`profile-style-${style}`"
                  :label="t(`players.profile.styleOptions.${style}`)"
                  @click="togglePlayStyle(style)"
                />
              </div>
            </UFormField>
          </div>
        </div>
      </UForm>
    </template>
    <template #footer>
      <div class="flex w-full justify-end gap-2">
        <UButton
          color="neutral"
          variant="ghost"
          :label="t('players.cancel')"
          :disabled="pending"
          @click="emit('update:open', false)"
        />
        <UButton
          :label="t('players.save')"
          :loading="pending"
          :disabled="pending"
          data-testid="player-save"
          @click="onSubmit"
        />
      </div>
    </template>
  </UModal>
</template>
