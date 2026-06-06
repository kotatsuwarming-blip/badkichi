<script setup lang="ts">
/**
 * SetSetupForm.vue — セット設定 + 初期立ち位置の入力フォーム。
 * 関連: TASK-0016 / REQ-002 / REQ-003 / EDGE-002 / ui-design.md
 * 方針: 各チームの「左の選手」を選ぶと残りが右に自動決定 → スロット重複を構造的に防ぐ (EDGE-002)。
 *       組み立ては buildSetInput 純関数に委譲。先攻は suggestedFirstServingTeam を既定提示 (REQ-107)。
 */
import { computed, ref } from 'vue'
import type { PlayerId, Team } from '~/utils/rule-engine/types'
import type { BuildSetResult } from '~/utils/match-recording/build-set-input'
import { buildSetInput } from '~/utils/match-recording/build-set-input'

interface RosterEntry { playerId: PlayerId, name: string, team: Team }

const props = defineProps<{
  roster: RosterEntry[]
  setNumber: number
  suggestedFirstServingTeam?: Team | null
}>()

const emit = defineEmits<{ submit: [value: BuildSetResult] }>()

const aPlayers = computed(() => props.roster.filter(r => r.team === 'A'))
const bPlayers = computed(() => props.roster.filter(r => r.team === 'B'))

const targetPoints = ref(21)
const enableDeuce = ref(true)
const deucePointCap = ref(30)
const firstServingTeam = ref<Team>(props.suggestedFirstServingTeam ?? 'A')
// URadioGroup は string を扱うため '' を「不明 (null)」として保持し submit 時に変換する
const cameraNearRaw = ref<'A' | 'B' | ''>('A')
const aFirstPlayerId = ref<PlayerId>(aPlayers.value[0]?.playerId ?? '')
const bFirstPlayerId = ref<PlayerId>(bPlayers.value[0]?.playerId ?? '')

function teamLabel(team: Team): string {
  const ps = (team === 'A' ? aPlayers.value : bPlayers.value).map(p => p.name).join('・')
  return ps ? `${team}（${ps}）` : team
}
const teamOptions = computed(() => [
  { label: teamLabel('A'), value: 'A' },
  { label: teamLabel('B'), value: 'B' }
])
const cameraOptions = computed(() => [
  { label: teamLabel('A'), value: 'A' },
  { label: teamLabel('B'), value: 'B' },
  { label: '?', value: '' }
])

function onSubmit() {
  const result = buildSetInput(props.roster, {
    setNumber: props.setNumber,
    targetPoints: targetPoints.value,
    enableDeuce: enableDeuce.value,
    deucePointCap: deucePointCap.value,
    firstServingTeam: firstServingTeam.value,
    cameraNearTeamAtStart: cameraNearRaw.value === '' ? null : cameraNearRaw.value,
    aFirstPlayerId: aFirstPlayerId.value,
    bFirstPlayerId: bFirstPlayerId.value
  })
  emit('submit', result)
}
</script>

<template>
  <form
    class="set-setup-form"
    data-testid="set-setup-form"
    @submit.prevent="onSubmit"
  >
    <h2 class="title">
      {{ $t('record.setup.title') }} {{ setNumber }}
    </h2>

    <UFormField :label="$t('record.setup.targetPoints')">
      <UInput
        v-model.number="targetPoints"
        type="number"
        data-testid="target-points"
      />
    </UFormField>

    <UFormField :label="$t('record.setup.enableDeuce')">
      <USwitch
        v-model="enableDeuce"
        data-testid="enable-deuce"
      />
    </UFormField>

    <UFormField :label="$t('record.setup.deucePointCap')">
      <UInput
        v-model.number="deucePointCap"
        type="number"
        data-testid="deuce-cap"
      />
    </UFormField>

    <UFormField :label="$t('record.setup.firstServingTeam')">
      <URadioGroup
        v-model="firstServingTeam"
        :items="teamOptions"
        data-testid="first-serving"
      />
    </UFormField>

    <UFormField :label="$t('record.setup.cameraNearTeam')">
      <URadioGroup
        v-model="cameraNearRaw"
        :items="cameraOptions"
        data-testid="camera-near"
      />
    </UFormField>

    <h3
      class="subtitle"
      data-testid="positions-title"
    >
      {{ $t('record.setup.positionsTitle') }}
    </h3>
    <p class="hint">
      {{ $t('record.setup.firstHint') }}
    </p>

    <UFormField :label="$t('record.setup.teamAFirst')">
      <USelect
        v-model="aFirstPlayerId"
        :items="aPlayers.map(p => ({ label: p.name, value: p.playerId }))"
        data-testid="a-first"
      />
    </UFormField>

    <UFormField :label="$t('record.setup.teamBFirst')">
      <USelect
        v-model="bFirstPlayerId"
        :items="bPlayers.map(p => ({ label: p.name, value: p.playerId }))"
        data-testid="b-first"
      />
    </UFormField>

    <UButton
      type="submit"
      color="primary"
      data-testid="setup-submit"
    >
      {{ $t('record.setup.start') }}
    </UButton>
  </form>
</template>

<style scoped>
.set-setup-form { display: flex; flex-direction: column; gap: 0.75rem; max-width: 28rem; }
.title { font-weight: 700; }
.subtitle { font-weight: 600; margin-top: 0.5rem; }
.hint { font-size: 0.8125rem; color: var(--ui-text-muted); }
</style>
