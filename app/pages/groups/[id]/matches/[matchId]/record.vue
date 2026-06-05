<script setup lang="ts">
/**
 * record.vue — 録画画面 (動画再生 + データ入力)。
 * 関連: TASK-0017 / REQ-001/004/108/202/204/408 / ui-design.md (レスポンシブ)
 * 方針:
 *   - useMatchForRecording で match を読み VideoSource を構築 (youtube=URL, local=方式A 再選択)。
 *   - useVideoPlayer を所有し getCurrentTimeMs を useRecordingSession に注入 (NFR-303)。
 *   - gameState 未設定なら SetSetupForm、設定済みなら録画 UI。lg 以上 2 カラム / 未満 1 カラム。
 *   - 動画 API はブラウザ専用のため VideoPlayer は .client (CSR、ADR-010)。
 */
import { computed, shallowRef, watch } from 'vue'
import { useRoute } from 'vue-router'
import type { PlayerId } from '~/utils/rule-engine/types'
import type { VideoSource, UseVideoPlayerReturn } from '~/types/video-playback'
import type { BuildSetResult } from '~/utils/match-recording/build-set-input'
import { useMatchForRecording } from '~/composables/useMatchForRecording'
import { useVideoPlayer } from '~/composables/useVideoPlayer'
import { useRecordingSession } from '~/composables/useRecordingSession'

const route = useRoute()
const matchId = route.params.matchId as string
const groupId = route.params.id as string

const { data: match } = useMatchForRecording(matchId)

const names = computed<Record<PlayerId, string>>(() => {
  const map: Record<PlayerId, string> = {}
  for (const r of match.value?.roster ?? []) map[r.playerId] = r.name
  return map
})

// 動画ソース。youtube は即構築、local は方式A (ファイル再選択)。
const player = shallowRef<UseVideoPlayerReturn | null>(null)

function initPlayer(src: VideoSource) {
  player.value = useVideoPlayer(src)
}

watch(match, (m) => {
  if (m && m.videoSourceType === 'youtube' && !player.value) {
    initPlayer({ type: 'youtube', url: m.videoSourceUrl })
  }
}, { immediate: true })

function onPickLocalFile(e: Event) {
  const file = (e.target as HTMLInputElement).files?.[0]
  if (file) initPlayer({ type: 'local', file })
}

const session = useRecordingSession(matchId, {
  getCurrentTimeMs: () => player.value?.controls.getCurrentTimeMs() ?? null
})
const {
  gameState, currentRally, history, currentSetNumber,
  setWinner, matchWinner, suggestedFirstServingTeam, undoLabelKey
} = session

const serverName = computed(() => {
  const s = gameState.value?.server
  return s ? (names.value[s] ?? s) : '-'
})
const receiverName = computed(() => {
  const r = gameState.value?.receiver
  return r ? (names.value[r] ?? r) : '-'
})
const shotMarkers = computed(() => (currentRally.value?.shots ?? []).map(s => s.videoTimestampMs))
const recordDisabled = computed(() => !currentRally.value || currentRally.value.isPending)
const shotCount = computed(() => currentRally.value?.shots.length ?? 0)

function onSetupSubmit(payload: BuildSetResult) {
  void session.configureAndStartSet(payload.setup, payload.positions)
}
function onJump(ms: number) {
  player.value?.controls.seekToMs(ms)
}
</script>

<template>
  <div class="record-page">
    <header class="record-header">
      <UButton
        variant="ghost"
        icon="i-lucide-arrow-left"
        :to="`/groups/${groupId}/matches`"
        data-testid="back"
      >
        {{ $t('record.back') }}
      </UButton>
      <span class="match-name">{{ match?.name ?? $t('record.untitledMatch') }}</span>
    </header>

    <div
      v-if="!player"
      class="source-picker"
      data-testid="source-picker"
    >
      <p>{{ $t('record.localReselect') }}</p>
      <input
        type="file"
        accept="video/*"
        data-testid="local-file"
        @change="onPickLocalFile"
      >
    </div>

    <RecordingSetSetupForm
      v-else-if="!gameState"
      :roster="match?.roster ?? []"
      :set-number="currentSetNumber ?? 1"
      :suggested-first-serving-team="suggestedFirstServingTeam"
      data-testid="setup"
      @submit="onSetupSubmit"
    />

    <div
      v-else
      class="record-grid"
    >
      <section class="video-col">
        <RecordingVideoPane
          :player="player"
          :shot-markers="shotMarkers"
        />
      </section>

      <section class="side-col">
        <RecordingScoreHeader
          :score="gameState.score"
          :set-number="currentSetNumber"
          :server-name="serverName"
          :receiver-name="receiverName"
        />
        <RecordingCourtDiagram
          :positions="gameState.positions"
          :serving-team="gameState.servingTeam"
          :server="gameState.server"
          :receiver="gameState.receiver"
          :camera-near-team="null"
          :names="names"
        />
      </section>

      <section class="controls-col">
        <RecordingShotButton
          :shot-count="shotCount"
          :disabled="recordDisabled"
          @shot="session.recordShot"
        />
        <RecordingUndoButton
          :label-key="undoLabelKey"
          @undo="session.undoLast"
        />
        <RecordingRallyControls
          @point="session.recordPoint"
          @let="session.recordLet"
          @skip="session.skipRally"
        />
        <RecordingPositionControls
          :can-advance="setWinner !== null"
          @override="session.recordOverride"
          @next-set="session.advanceToNextSet"
        />
        <p
          v-if="setWinner"
          class="set-decided"
          data-testid="set-decided"
        >
          {{ $t('record.setDecided') }}: {{ $t(`record.team.${setWinner}`) }}
        </p>
        <p
          v-if="matchWinner"
          class="match-decided"
          data-testid="match-decided"
        >
          {{ $t('record.matchDecided') }}: {{ $t(`record.team.${matchWinner}`) }}
        </p>
      </section>

      <section class="history-col">
        <RecordingRallyHistory
          :items="history"
          :names="names"
          @jump="onJump"
        />
      </section>
    </div>
  </div>
</template>

<style scoped>
.record-page { display: flex; flex-direction: column; gap: 1rem; padding: 1rem; }
.record-header { display: flex; align-items: center; gap: 1rem; }
.match-name { font-weight: 600; }
.source-picker { display: flex; flex-direction: column; gap: 0.5rem; }
.record-grid { display: grid; grid-template-columns: 1fr; gap: 1rem; }
.side-col, .controls-col { display: flex; flex-direction: column; gap: 1rem; }
@media (min-width: 1024px) {
  .record-grid { grid-template-columns: 2fr 1fr; grid-template-areas: 'video side' 'controls controls' 'history history'; }
  .video-col { grid-area: video; }
  .side-col { grid-area: side; }
  .controls-col { grid-area: controls; }
  .history-col { grid-area: history; }
}
</style>
