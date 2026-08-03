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
import { QUICK_REASON_KEYS, useQuickPass } from '~/composables/useQuickPass'
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

/** 打点パスの現在位置へ動画を合わせる (local = 静止 / YouTube = スローループ頭) */
function seekPositionAnchor(): void {
  const p = player.value
  if (!p) return
  if (session.isYoutube.value) {
    const window_ = positionPass.loopWindow.value
    if (!window_) return
    p.controls.seekToMs(window_.fromMs)
    p.controls.setPlaybackRate(0.5)
    p.controls.play()
  } else {
    const anchor = positionPass.anchorMs.value
    if (anchor === null) return
    p.controls.seekToMs(anchor)
    p.controls.pause()
  }
}

/**
 * ラリー一覧からのジャンプ。watcher 任せにせず動画も明示的に駆動する —
 * 現在いるラリーを再選択した場合は computed が変化せず watcher が発火しないため
 * (ドッグフーディング 2026-08-03「押しても遷移できない」)。
 */
function jumpToRally(rally: AnnotationRally): void {
  const mode = session.mode.value
  if (mode === 'quick') {
    quick.goToRally(rally.id)
    replayWindow()
  } else if (mode === 'type') {
    typePass.goToRally(rally.id)
    seekTypeRallyStart()
  } else {
    positionPass.goToRally(rally.id)
    seekPositionAnchor()
  }
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
  if (current === null || current <= window_.toMs) return
  if (session.mode.value === 'quick') {
    // クイックパスは通し方式: 決着窓を1回再生したら停止して入力待ち
    // (ループ再生より速い、ドッグフーディング 2026-07-29)。再視聴は「もう一度見る」
    if (p.state.value.status === 'playing') p.controls.pause()
  } else {
    // 打点探索 (YouTube) は瞬間を探すためループ維持
    p.controls.seekToMs(window_.fromMs)
  }
}

/** 決着窓の再視聴 (クイックパス) */
function replayWindow(): void {
  const window_ = activeLoopWindow.value
  const p = player.value
  if (!window_ || !p) return
  p.controls.seekToMs(window_.fromMs)
  p.controls.play()
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

/**
 * 種別パスのラリー頭シーク。アンカーは1打目の押下時刻 −2秒を優先する —
 * rallies.video_start_timestamp_ms はライブ記録の「ラリー開始押下」でサーブ後のことがあり、
 * そこから再生するとサーブが見えない (ドッグフーディング 2026-08-02)。
 */
function seekTypeRallyStart(): void {
  const p = player.value
  const rally = typePass.currentRally.value
  if (!p || !rally) return
  const firstShot = session.shotsOf(rally.id)[0]
  const startMs = firstShot?.videoTimestampMs != null
    ? Math.max(0, firstShot.videoTimestampMs - 2000)
    : rally.videoStartTimestampMs
  if (startMs === null) return
  p.controls.seekToMs(startMs)
  p.controls.setPlaybackRate(1)
  p.controls.play()
}

// 種別パス: ラリー頭へシーク + 通常速で再生、ラリー間を飛ばす (REQ-008)
watch(
  () => [session.mode.value, typePass.currentRally.value?.id] as const,
  ([mode, rallyId]) => {
    if (mode !== 'type' || rallyId === undefined) return
    seekTypeRallyStart()
  }
)

/** やり直し: 種別クリアに加えて動画もラリー頭へ巻き戻す (ドッグフーディング 2026-08-02) */
async function onRedoRally(): Promise<void> {
  await typePass.redoRally()
  seekTypeRallyStart()
}

// 種別パス: ラリー内の入力が揃ったら自動一時停止 (REQ-008 の境界停止)
watch(() => typePass.rallyComplete.value, (complete) => {
  if (complete && session.mode.value === 'type') player.value?.controls.pause()
})

// ---- ショット行の補正 (押し損ね/押しすぎ、ドッグフーディング 2026-07-29) ----
async function onInsertShot(): Promise<void> {
  const rally = typePass.currentRally.value
  if (!rally) return
  const shots = typePass.currentShots.value
  const expected = typePass.expectedShot.value
  const position = expected ? shots.findIndex(s => s.id === expected.id) : shots.length
  const ok = await session.insertShotAt(rally.id, position)
  if (ok) typePass.goToRally(rally.id)
}

async function onDeleteShot(): Promise<void> {
  const rally = typePass.currentRally.value
  const expected = typePass.expectedShot.value
  if (!rally || !expected) return
  const ok = await session.deleteShotAt(expected.id)
  if (ok) typePass.goToRally(rally.id)
}

/** 打点パスのショットチップからのジャンプ (2026-08-03)。動画も現在位置へ追従させる */
function onJumpShot(shotId: string): void {
  positionPass.goToShot(shotId)
  seekPositionAnchor()
}

// 打点パス側のショット行補正 (2026-08-02。挿入位置 = 現在のショット)
async function onInsertShotPosition(): Promise<void> {
  const rally = positionPass.currentRally.value
  if (!rally) return
  const shots = session.shotsOf(rally.id)
  const current = positionPass.currentShot.value
  const position = current ? shots.findIndex(s => s.id === current.id) : shots.length
  const ok = await session.insertShotAt(rally.id, position)
  if (ok) positionPass.start() // 再読込後、最初の未注釈 (= 挿入行) から再開
}

async function onDeleteShotPosition(): Promise<void> {
  const current = positionPass.currentShot.value
  if (!current) return
  const ok = await session.deleteShotAt(current.id)
  if (ok) positionPass.start()
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
    undoAndReposition()
    return
  }
  const key = codeToKey(event.code)
  if (key === null) return
  if (session.mode.value === 'type') {
    event.preventDefault()
    typePass.handleKey(key, { backhand: event.shiftKey })
    return
  }
  // 全ショットパス: 種別の同時入力 (前進はタップ側。2026-08-02。Shift = バックハンド)。
  // 打者二択の待機中は 1/2 キーで選択 (カーソルをコートから動かさない、2026-08-03)
  if (session.mode.value === 'position') {
    event.preventDefault()
    if (positionPass.awaitingHitter.value) {
      const idx = key === '1' ? 0 : key === '2' ? 1 : null
      const candidate = idx === null ? undefined : positionPass.hitterCandidates.value[idx]
      if (candidate) positionPass.selectHitter(candidate.playerId)
      return
    }
    positionPass.setType(key, { backhand: event.shiftKey })
    return
  }
  // クイックパス: 数字キーで end_reason を直接入力 (D6 初期値の割当)
  if (session.mode.value === 'quick' && quick.step.value === 'reason') {
    const reason = QUICK_REASON_KEYS.find(([k]) => k === key)?.[1]
    if (reason) {
      event.preventDefault()
      quick.selectEndReason(reason)
    }
  }
}

/**
 * 取り消し + 位置復元 (2026-08-03): session.undoLast はデータとカーソルを戻すが、
 * 各パスの内部位置は戻らず「歯抜けのまま次のショット入力」になっていた。
 * undo 成功後にカーソルへパスの位置を合わせ、動画も追従させる。
 */
async function undoAndReposition(): Promise<void> {
  const ok = await session.undoLast()
  if (!ok) return
  const cursor = session.cursor.value
  if (!cursor) return
  const mode = session.mode.value
  if (mode === 'position' && cursor.shotId) {
    positionPass.goToShot(cursor.shotId)
    seekPositionAnchor()
  } else if (mode === 'type') {
    typePass.goToRally(cursor.rallyId)
  } else if (mode === 'quick') {
    quick.goToRally(cursor.rallyId)
    replayWindow()
  }
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
          @click="undoAndReposition()"
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
      <!-- min-w-0: 動画がカラム幅を突き破って右パネルを隠すのを防ぐ -->
      <div class="grid gap-4 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <!-- 動画ペイン -->
        <div class="min-w-0 space-y-2">
          <!-- J/L スキップはクイックのみ (種別/打点は L がサーブ入力キー、2026-08-03) -->
          <VideoPlayer
            v-if="player"
            :player="player"
            :skip-keys="session.mode.value === 'quick'"
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
        <div class="min-w-0">
          <AnnotationQuickPassPanel
            v-if="session.mode.value === 'quick'"
            :quick="quick"
            @replay="replayWindow"
          />
          <AnnotationTypePassPanel
            v-else-if="session.mode.value === 'type'"
            :type-pass="typePass"
            @toggle-hand="value => (typePass.recordHand.value = value)"
            @insert-shot="onInsertShot"
            @delete-shot="onDeleteShot"
            @redo="onRedoRally"
          />
          <AnnotationPositionPassPanel
            v-else
            :position-pass="positionPass"
            :seek-to="seekAndPause"
            :current-time-ms="() => player?.controls.getCurrentTimeMs() ?? null"
            @insert-shot="onInsertShotPosition"
            @delete-shot="onDeleteShotPosition"
            @toggle-hand="value => (positionPass.recordHand.value = value)"
            @jump-shot="onJumpShot"
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
