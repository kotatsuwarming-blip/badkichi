<script setup lang="ts">
/**
 * annotate.vue — アノテーションスタジオ (記録済み試合への後付け注釈)。
 * 関連: TASK-0011 / REQ-001/003/101/107/108/201/405/407 / ui-design.md
 * 方針:
 *   - useAnnotationSession が全データ + カーソル + undo を所有。3モード composable は
 *     その構造的部分型を deps に受ける。record 画面には一切触れない (REQ-407)。
 *   - 動画: youtube = URL から即構築 / local = 方式A ファイル再選択 (REQ-107)。
 *   - ループ再生 (クイック決着窓・YouTube 打点窓) は本ページの setInterval で制御 (100ms 周期)。
 *   - キーボード: e.code ベースで捕捉 (Shift+数字が記号になるレイアウト差を回避)。
 *     Backspace = 直前1段 undo (REQ-108)。
 */
import { computed, onBeforeUnmount, onMounted, shallowRef, watch } from 'vue'
import { useRoute } from 'vue-router'
import type { UseVideoPlayerReturn, VideoSource } from '~/types/video-playback'
import type { AnnotationMode, AnnotationRally } from '~/types/shot-annotation'
import { useVideoPlayer } from '~/composables/useVideoPlayer'
import { useAnnotationSession } from '~/composables/useAnnotationSession'
import { useAnnotationProgress } from '~/composables/useAnnotationProgress'
import { useQuickPass } from '~/composables/useQuickPass'
import { useTypePass } from '~/composables/useTypePass'
import { usePositionPass } from '~/composables/usePositionPass'

const route = useRoute()
const matchId = route.params.matchId as string
const groupId = route.params.id as string

const { t } = useI18n()
const toast = useToast()

const session = useAnnotationSession(matchId)
const { progress } = useAnnotationProgress({
  rallies: session.rallies,
  shotsByRally: session.shotsByRally
})
const quick = useQuickPass(session)
const typePass = useTypePass(session)
const positionPass = usePositionPass(session)

// ---- 動画プレーヤー (ADR-010: ブラウザ専用 API のため CSR 前提) ----
const player = shallowRef<UseVideoPlayerReturn | null>(null)

function initPlayer(src: VideoSource): void {
  player.value = useVideoPlayer(src)
}

function onLocalFileChange(event: Event): void {
  const file = (event.target as HTMLInputElement).files?.[0]
  if (file) initPlayer({ type: 'local', file })
}

// ---- モード制御 ----
function startMode(mode: AnnotationMode): void {
  session.setMode(mode)
  if (mode === 'quick') quick.start()
  else if (mode === 'type') typePass.start()
  else positionPass.start()
}

function jumpToRally(rally: AnnotationRally): void {
  const mode = session.mode.value
  if (mode === 'quick') quick.goToRally(rally.id)
  else if (mode === 'type') typePass.goToRally(rally.id)
  else positionPass.goToRally(rally.id)
}

const activeRallyId = computed(() => session.cursor.value?.rallyId ?? null)

// ---- ループ再生制御 (クイック決着窓 / YouTube 打点窓、REQ-004 / REQ-101) ----
const activeLoopWindow = computed(() => {
  if (session.mode.value === 'quick') return quick.loopWindow.value
  if (session.mode.value === 'position' && session.isYoutube.value) return positionPass.loopWindow.value
  return null
})

let loopTimer: ReturnType<typeof setInterval> | null = null

function tickLoop(): void {
  const window_ = activeLoopWindow.value
  const p = player.value
  if (!window_ || !p) return
  const current = p.controls.getCurrentTimeMs()
  if (current !== null && current > window_.toMs) {
    p.controls.seekToMs(window_.fromMs)
  }
}

// 窓が変わったら窓頭から再生 (打点探索は 0.5x スロー、ui-design.md)
watch(activeLoopWindow, (window_) => {
  const p = player.value
  if (!window_ || !p) return
  p.controls.seekToMs(window_.fromMs)
  if (session.mode.value === 'position') p.controls.setPlaybackRate(0.5)
  p.controls.play()
})

// ローカル打点パス: ショットが変わったらアンカーへシークして静止 (REQ-009)
watch(
  () => [session.mode.value, session.isYoutube.value, positionPass.anchorMs.value] as const,
  ([mode, youtube, anchor]) => {
    const p = player.value
    if (mode !== 'position' || youtube || anchor === null || !p) return
    p.controls.seekToMs(anchor)
    p.controls.pause()
  }
)

function seekAndPause(ms: number): void {
  const p = player.value
  if (!p) return
  p.controls.seekToMs(ms)
  p.controls.pause()
}

// ---- キーボード (REQ-007 / REQ-108)。e.code で数字段の Shift 記号化を回避 ----
function codeToKey(code: string): string | null {
  const digit = /^Digit(\d)$/.exec(code)
  if (digit?.[1] !== undefined) return digit[1]
  const letter = /^Key([A-Z])$/.exec(code)
  if (letter?.[1] !== undefined) return letter[1].toLowerCase()
  return null
}

function onKeydown(event: KeyboardEvent): void {
  const target = event.target as HTMLElement | null
  if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement) return
  if (event.key === 'Backspace') {
    event.preventDefault()
    session.undoLast()
    return
  }
  if (session.mode.value !== 'type') return
  const key = codeToKey(event.code)
  if (key === null) return
  event.preventDefault()
  typePass.handleKey(key, { backhand: event.shiftKey })
}

// ---- 保存エラー通知 (EDGE-007: local は保持、通知のみ) ----
watch(session.saveError, (error) => {
  if (error) toast.add({ title: t('annotation.saveError'), color: 'error' })
})

/** ?mode= でパスへ直接入れる (試合一覧からの分岐導線用。既定はクイック) */
function initialMode(): AnnotationMode {
  const q = route.query.mode
  return q === 'type' || q === 'position' || q === 'quick' ? q : 'quick'
}

onMounted(async () => {
  window.addEventListener('keydown', onKeydown)
  loopTimer = setInterval(tickLoop, 100)
  await session.load()
  const match = session.match.value
  if (match?.videoSourceType === 'youtube') {
    initPlayer({ type: 'youtube', url: match.videoSourceUrl })
  }
  startMode(initialMode())
})

onBeforeUnmount(() => {
  window.removeEventListener('keydown', onKeydown)
  if (loopTimer !== null) clearInterval(loopTimer)
})
</script>

<template>
  <UContainer class="space-y-4 py-4">
    <!-- ヘッダー -->
    <div class="flex flex-wrap items-center justify-between gap-2">
      <div class="flex items-center gap-2">
        <UButton
          :to="`/groups/${groupId}/matches`"
          variant="ghost"
          icon="i-lucide-arrow-left"
          size="sm"
        />
        <h1 class="text-lg font-semibold">
          {{ t('annotation.title') }}
        </h1>
      </div>
      <div class="flex items-center gap-2">
        <UButton
          variant="ghost"
          size="sm"
          icon="i-lucide-undo-2"
          @click="session.undoLast()"
        >
          {{ t('annotation.undo') }}
        </UButton>
      </div>
    </div>

    <AnnotationModeBar
      :mode="session.mode.value"
      :progress="progress"
      @change="startMode"
      @resume="startMode"
    />

    <!-- 読込中 -->
    <div
      v-if="session.pending.value"
      class="py-8 text-center text-sm text-neutral-500"
    >
      {{ t('annotation.loading') }}
    </div>

    <!-- ラリーなし (REQ-201) -->
    <UAlert
      v-else-if="!session.hasRallies.value"
      color="neutral"
      variant="subtle"
      icon="i-lucide-info"
      :title="t('annotation.noRallies')"
    >
      <template #actions>
        <UButton
          :to="`/groups/${groupId}/matches/${matchId}/record`"
          size="sm"
        >
          {{ t('annotation.goRecord') }}
        </UButton>
      </template>
    </UAlert>

    <template v-else>
      <div class="grid gap-4 lg:grid-cols-2">
        <!-- 動画ペイン -->
        <div class="space-y-2">
          <VideoPlayer
            v-if="player"
            :player="player"
            @reselect-file="file => initPlayer({ type: 'local', file })"
          />
          <UAlert
            v-else-if="session.match.value?.videoSourceType === 'local'"
            color="info"
            variant="subtle"
            icon="i-lucide-file-video"
            :title="t('annotation.localReselect')"
          >
            <template #actions>
              <input
                type="file"
                accept="video/*"
                class="text-sm"
                @change="onLocalFileChange"
              >
            </template>
          </UAlert>
        </div>

        <!-- モード別入力パネル -->
        <div>
          <AnnotationQuickPassPanel
            v-if="session.mode.value === 'quick'"
            :quick="quick"
          />
          <AnnotationTypePassPanel
            v-else-if="session.mode.value === 'type'"
            :type-pass="typePass"
            @toggle-hand="value => (typePass.recordHand.value = value)"
          />
          <AnnotationPositionPassPanel
            v-else
            :position-pass="positionPass"
            :seek-to="seekAndPause"
            :current-time-ms="() => player?.controls.getCurrentTimeMs() ?? null"
          />
        </div>
      </div>

      <AnnotationRallyList
        :rallies="session.rallies.value"
        :shots-of="session.shotsOf"
        :active-rally-id="activeRallyId"
        @jump="jumpToRally"
      />
    </template>
  </UContainer>
</template>
