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
import { computed, onMounted, ref, shallowRef, watch } from 'vue'
import { useRoute } from 'vue-router'
import type { PlayerId } from '~/utils/rule-engine/types'
import type { VideoSource, UseVideoPlayerReturn } from '~/types/video-playback'
import type { BuildSetResult } from '~/utils/match-recording/build-set-input'
import { useMatchForRecording } from '~/composables/useMatchForRecording'
import { useVideoPlayer } from '~/composables/useVideoPlayer'
import { useRecordingSession } from '~/composables/useRecordingSession'
import { useSets } from '~/composables/useSets'
import { useSetPositions } from '~/composables/useSetPositions'
import { useSetRallies } from '~/composables/useSetRallies'
import { useMatchSummary } from '~/composables/useMatchSummary'
import { useCompleteMatch } from '~/composables/useCompleteMatch'
import { useToastErrors } from '~/composables/useToastErrors'

const route = useRoute()
const matchId = route.params.matchId as string
const groupId = route.params.id as string

const { data: match, refresh: refreshMatch } = useMatchForRecording(matchId)
const { data: sets, refresh: refreshSets } = useSets(matchId)
const { setCompleted, pending: completePending } = useCompleteMatch()
const { showError } = useToastErrors()

const isCompleted = computed(() => match.value?.completedAt != null)

// 既存セットから次のセット番号を採番 (再入場時の set_number 重複を防ぐ、REQ-002)
const nextSetNumber = computed(() => {
  const nums = (sets.value ?? []).map(s => s.setNumber)
  return (nums.length ? Math.max(...nums) : 0) + 1
})

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

// YouTube はクライアント限定で初期化する (ADR-010: 動画 API はブラウザ専用)。
// immediate watch を SSR (リロード) で発火させると、setup 同期時点では useAsyncData が
// 未解決で match=null のためサーバーは player=null → source-picker を描画する。一方
// hydration 後にクライアントだけ player を立てると v-if="!player" 分岐が食い違い、
// プレーヤーがマウントされず「リロードで YouTube が出ない」状態になる。
// → 解決済み match は onMounted (クライアント) で拾い、後着 (クライアント遷移) は watch で拾う。
function initYouTubeIfReady(m: typeof match.value) {
  if (m && m.videoSourceType === 'youtube' && !player.value) {
    initPlayer({ type: 'youtube', url: m.videoSourceUrl })
  }
}
watch(match, initYouTubeIfReady)

function onPickLocalFile(e: Event) {
  const file = (e.target as HTMLInputElement).files?.[0]
  if (file) initPlayer({ type: 'local', file })
}

const session = useRecordingSession(matchId, {
  getCurrentTimeMs: () => player.value?.controls.getCurrentTimeMs() ?? null
})
const {
  gameState, currentRally, history, currentSetNumber,
  setWinner, matchWinner, suggestedFirstServingTeam, cameraNearTeam, undoLabelKey
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

// 記録のしかた 初回ガイド (U-01)。初回だけ自動表示し、以降はヘッダの [?] から再表示する。
const GUIDE_SEEN_KEY = 'badkichi:record-guide-seen'
const guideOpen = ref(false)
function guideSeen() {
  return import.meta.client && localStorage.getItem(GUIDE_SEEN_KEY) === '1'
}
function openGuide() {
  guideOpen.value = true
}
function onGuideOpenChange(open: boolean) {
  guideOpen.value = open
  if (!open && import.meta.client) localStorage.setItem(GUIDE_SEEN_KEY, '1')
}
// gameState が初めて立った瞬間 (= 操作対象が画面に出る) に初回だけ表示する。
watch(gameState, (val, old) => {
  if (val && !old && !guideSeen()) guideOpen.value = true
})

async function onSetupSubmit(payload: BuildSetResult) {
  const { error } = await session.configureAndStartSet(payload.setup, payload.positions)
  if (error) {
    showError(error)
    return
  }
  await refreshSets()
}
function onJump(ms: number) {
  player.value?.controls.seekToMs(ms)
}

// 完了 → 試合サマリー (スコア確認)
const { data: summary, refresh: refreshSummary } = useMatchSummary(matchId)
const summaryOpen = ref(false)
async function openSummary() {
  await refreshSummary()
  summaryOpen.value = true
}

// 試合の完了/取り消し (1セットでも明示的に完了にできる)
async function markCompleted(completed: boolean) {
  const { error } = await setCompleted({ matchId, completed })
  if (error) {
    showError(error)
    return
  }
  await refreshMatch()
}

// リロード時: 進行中 (未決着) セットがあれば再開する。空セットの番号加算を防ぐ。
onMounted(async () => {
  // SSR で取り逃した解決済み match の YouTube プレーヤーをクライアントで初期化する。
  initYouTubeIfReady(match.value)
  if (gameState.value) return
  await refreshSets()
  const target = (sets.value ?? [])
    .filter(s => s.winner === null)
    .sort((a, b) => b.setNumber - a.setNumber)[0]
  if (!target) return
  const [{ data: pos }, { data: rallies }] = await Promise.all([
    useSetPositions(target.id),
    useSetRallies(target.id)
  ])
  if ((pos.value ?? []).length === 4) {
    session.resumeSet(target, pos.value ?? [], rallies.value ?? [])
  }
})
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
      <UButton
        class="help-btn"
        variant="ghost"
        icon="i-lucide-circle-help"
        :aria-label="$t('record.guide.reopen')"
        :title="$t('record.guide.reopen')"
        data-testid="guide-open"
        @click="openGuide"
      />
      <UButton
        class="finish-btn"
        color="primary"
        icon="i-lucide-flag"
        data-testid="finish"
        @click="openSummary"
      >
        {{ $t('record.finish') }}
      </UButton>
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

      <section class="aside-col">
        <RecordingSetSetupForm
          v-if="!gameState"
          :roster="match?.roster ?? []"
          :set-number="currentSetNumber ?? nextSetNumber"
          :suggested-first-serving-team="suggestedFirstServingTeam"
          data-testid="setup"
          @submit="onSetupSubmit"
        />
        <template v-else>
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
            :camera-near-team="cameraNearTeam"
            :names="names"
          />
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
            :disabled="recordDisabled"
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
        </template>
      </section>

      <section
        v-if="gameState"
        class="history-col"
      >
        <RecordingRallyHistory
          :items="history"
          :names="names"
          @jump="onJump"
        />
      </section>
    </div>

    <UModal v-model:open="summaryOpen">
      <template #content>
        <div class="summary-modal">
          <RecordingMatchSummary
            v-if="summary"
            :summary="summary"
          />
          <div class="summary-actions">
            <UButton
              variant="ghost"
              data-testid="summary-close"
              @click="summaryOpen = false"
            >
              {{ $t('record.summary.close') }}
            </UButton>
            <UButton
              v-if="!isCompleted"
              color="primary"
              icon="i-lucide-flag"
              :loading="completePending"
              data-testid="summary-complete"
              @click="markCompleted(true)"
            >
              {{ $t('record.summary.markComplete') }}
            </UButton>
            <UButton
              v-else
              color="neutral"
              variant="soft"
              :loading="completePending"
              data-testid="summary-uncomplete"
              @click="markCompleted(false)"
            >
              {{ $t('record.summary.completed') }}（{{ $t('record.summary.unmark') }}）
            </UButton>
            <UButton
              color="primary"
              variant="outline"
              :to="`/groups/${groupId}/matches`"
              data-testid="summary-back"
            >
              {{ $t('record.summary.backToMatches') }}
            </UButton>
          </div>
        </div>
      </template>
    </UModal>

    <RecordingGuide
      :open="guideOpen"
      @update:open="onGuideOpenChange"
    />
  </div>
</template>

<style scoped>
.record-page { display: flex; flex-direction: column; gap: 1rem; padding: 1rem; }
.record-header { display: flex; align-items: center; gap: 1rem; }
.help-btn { margin-left: auto; }
.summary-modal { display: flex; flex-direction: column; gap: 1rem; padding: 1.25rem; }
.summary-actions { display: flex; justify-content: flex-end; gap: 0.5rem; }
.match-name { font-weight: 600; }
.source-picker { display: flex; flex-direction: column; gap: 0.5rem; }
.record-grid { display: grid; grid-template-columns: 1fr; gap: 1rem; }
.aside-col { display: flex; flex-direction: column; gap: 1rem; }
@media (min-width: 1024px) {
  .record-grid { grid-template-columns: 1.8fr 1fr; grid-template-areas: 'video aside' 'history aside'; align-items: start; }
  .video-col { grid-area: video; }
  .aside-col { grid-area: aside; }
  .history-col { grid-area: history; }
}
</style>
