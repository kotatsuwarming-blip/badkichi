<script setup lang="ts">
/**
 * VideoPlayer.client.vue — 動画再生面 + 標準コントロール + オーバーレイスロット / エラー・再選択 UI（CSR 限定）
 *
 * 関連タスク: TASK-0008（標準コントロール土台）/ TASK-0009（スロット・エラー・再選択）
 * 関連設計: docs/design/video-playback/architecture.md（公開形態, ADR-010）/ interfaces.ts
 *
 * 設計方針:
 *   - 薄い描画層。再生制御ロジックは持たず props.player.controls へ委譲する。
 *   - 親が useVideoPlayer(source) で生成した player を props で受け取り、
 *     onMounted で player.attach(el) / onBeforeUnmount で player.detach() を呼ぶ。
 *   - `.client.vue` 命名で CSR 限定（ADR-010）。ClientOnly ラップは使わない。
 *   - timeline / overlay スロットはドメイン非依存（REQ-009/405）。中身（ショット/ラリー）は知らない。
 *   - エラー文言は messageKey で locale 解決（生文字列を埋めない, error-handling 原則5）。
 *
 * スタイル: セミコロンなし / no comma dangle（CLAUDE.md ESLint 規約）
 */

import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import type { PlaybackRate, VideoPlayerProps, VideoPlayerSlotProps } from '~/types/video-playback'
import { PLAYBACK_RATES, VIDEO_PLAYER_ERROR_CODE } from '~/types/video-playback'

const props = defineProps<VideoPlayerProps>()

const emit = defineEmits<{
  reselectFile: [file: File]
  requestNewSource: []
}>()

const { t } = useI18n()

const playerEl = ref<HTMLElement | null>(null)
const state = props.player.state
const controls = props.player.controls

// 再生/一時停止トグル
const isPlaying = computed(() => state.value.status === 'playing')

// unstarted / buffering の間ローディング提示（操作は阻害しない）
const isLoading = computed(
  () => state.value.status === 'unstarted' || state.value.status === 'buffering'
)

// オーバーレイスロットへ渡す props（ドメイン非依存・camelCase 契約 = VideoPlayerSlotProps）
const slotProps = computed<VideoPlayerSlotProps>(() => ({
  durationMs: state.value.durationMs,
  currentTimeMs: state.value.currentTimeMs,
  status: state.value.status
}))

// シークバーの現在位置（0..1）。durationMs 未取得時は 0
const seekRatio = computed(() => {
  const d = state.value.durationMs
  if (d == null || d === 0) return 0
  return state.value.currentTimeMs / d
})

// 速度セレクタの選択肢
const rateItems = PLAYBACK_RATES.map(rate => ({ label: `${rate}x`, value: rate }))

const rateModel = computed<PlaybackRate>({
  get: () => state.value.rate,
  set: (rate: PlaybackRate) => controls.setPlaybackRate(rate)
})

// youtube-load-failed のときだけ「別動画を指定」導線を併設（EDGE-001）
const isYoutubeLoadFailed = computed(
  () => state.value.error?.code === VIDEO_PLAYER_ERROR_CODE.youtubeLoadFailed
)

function toggle(): void {
  if (isPlaying.value) controls.pause()
  else controls.play()
}

function onSeekInput(event: Event): void {
  if (state.value.durationMs == null) return
  const ratio = Number.parseFloat((event.target as HTMLInputElement).value)
  controls.seekToMs(Math.round(ratio * state.value.durationMs))
}

// 再選択は必ずユーザ操作起点（NFR-101）。自動でファイルへ再アクセスしない。
function onReselect(event: Event): void {
  const file = (event.target as HTMLInputElement).files?.[0]
  if (file) emit('reselectFile', file)
}

// ms → mm:ss 表示用整形（純関数）
function formatMs(ms: number | null): string {
  if (ms == null) return '--:--'
  const total = Math.floor(ms / 1000)
  const mm = String(Math.floor(total / 60)).padStart(2, '0')
  const ss = String(total % 60).padStart(2, '0')
  return `${mm}:${ss}`
}

// 10 秒スキップ/戻し (YouTube と同じ J=-10s / L=+10s)。
// skipKeys=false で無効化 (注釈の種別/打点モードは L がサーブ入力キー、2026-08-03)
function onKeydown(e: KeyboardEvent): void {
  if (props.skipKeys === false) return
  const target = e.target as HTMLElement | null
  if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) return
  if (e.code !== 'KeyL' && e.code !== 'KeyJ') return
  const cur = controls.getCurrentTimeMs()
  if (cur == null) return
  e.preventDefault()
  e.stopPropagation()
  controls.seekToMs(cur + (e.code === 'KeyL' ? 10000 : -10000))
}

// iframe (YouTube) にフォーカスが移るとキー操作がアプリに届かなくなるため、奪い返す。
// window が blur したとき activeElement が iframe なら blur して body へ戻す。
function onWindowBlur(): void {
  setTimeout(() => {
    const ae = document.activeElement
    if (ae && ae.tagName === 'IFRAME') (ae as HTMLElement).blur()
  }, 0)
}

// attach は playerEl が実在した時点で1回だけ行う。
// `.client` コンポーネントがリロード (SSR→hydration) 経由かつ動的マウントで挿入されると、
// onMounted 時点では内側 DOM (playerEl) が未描画で ref が null になりうるため、
// onMounted 固定ではなく playerEl を watch して、要素が入ったら attach する。
let attached = false
async function attachWhenReady(el: HTMLElement | null): Promise<void> {
  if (attached || !el) return
  attached = true
  await props.player.attach(el)
}

onMounted(() => {
  window.addEventListener('keydown', onKeydown, true)
  window.addEventListener('blur', onWindowBlur)
})

// flush: 'post' = DOM 反映後に評価。immediate で初回 (要素があれば即 attach)、
// 後から playerEl が入った場合も発火して attach する。
watch(playerEl, attachWhenReady, { immediate: true, flush: 'post' })

onBeforeUnmount(() => {
  window.removeEventListener('keydown', onKeydown, true)
  window.removeEventListener('blur', onWindowBlur)
  props.player.detach()
})
</script>

<template>
  <div class="video-player">
    <!-- 再生面 + overlay 層。stage で包み、iframe へのフォーカス移動を防ぐクリック層を重ねる -->
    <div class="video-player__stage">
      <div
        ref="playerEl"
        class="video-player__surface"
      >
        <div class="video-player__overlay">
          <slot
            name="overlay"
            v-bind="slotProps"
          />
        </div>

        <div
          v-if="isLoading"
          data-testid="vp-loading"
          class="video-player__loading"
          :aria-label="t('videoPlayer.controls.loading')"
        >
          <USkeleton class="video-player__skeleton" />
        </div>

        <!-- エラー提示（inline/banner）。文言は messageKey で locale 解決 -->
        <UAlert
          v-if="state.error"
          data-testid="vp-error"
          color="error"
          :title="t(state.error.messageKey)"
        >
          <template
            v-if="isYoutubeLoadFailed"
            #actions
          >
            <UButton
              data-testid="vp-new-source"
              @click="emit('requestNewSource')"
            >
              {{ t('videoPlayer.error.specifyAnotherVideo') }}
            </UButton>
          </template>
        </UAlert>

        <!-- 再選択 UI（REQ-103 / NFR-101: ユーザ操作起点のみ） -->
        <div
          v-if="state.needsReselect"
          data-testid="vp-reselect"
          class="video-player__reselect"
        >
          <p>{{ t('videoPlayer.error.reselectPrompt') }}</p>
          <input
            data-testid="vp-reselect-input"
            type="file"
            accept="video/*"
            :aria-label="t('videoPlayer.error.reselectPrompt')"
            @change="onReselect"
          >
          <p class="video-player__hint">
            {{ t('videoPlayer.error.youtubeRecommendation') }}
          </p>
        </div>
      </div>
      <!-- クリック層: iframe のフォーカス奪取を防ぎ、クリックで再生/一時停止 (自前操作) -->
      <div
        v-if="!state.error && !state.needsReselect"
        class="video-player__click-catch"
        data-testid="vp-click-catch"
        @click="toggle"
      />
    </div>

    <!-- 標準コントロール -->
    <div class="video-player__controls">
      <UButton
        data-testid="vp-toggle"
        :icon="isPlaying ? 'i-lucide-pause' : 'i-lucide-play'"
        :aria-label="isPlaying ? t('videoPlayer.controls.pause') : t('videoPlayer.controls.play')"
        @click="toggle"
      />

      <span
        data-testid="vp-time"
        class="video-player__time"
      >
        {{ formatMs(state.currentTimeMs) }} / {{ formatMs(state.durationMs) }}
      </span>

      <!-- シークバー + timeline オーバーレイ層（絶対配置の器のみ提供。位置算出は上位） -->
      <div class="video-player__timeline">
        <input
          data-testid="vp-seek"
          class="video-player__seek"
          type="range"
          min="0"
          max="1"
          step="0.001"
          :value="seekRatio"
          :disabled="state.durationMs == null"
          :aria-label="t('videoPlayer.controls.seek')"
          @input="onSeekInput"
        >
        <slot
          name="timeline"
          v-bind="slotProps"
        />
      </div>

      <USelect
        v-model="rateModel"
        data-testid="vp-rate"
        :items="rateItems"
        :aria-label="t('videoPlayer.controls.playbackRate')"
      />
    </div>
  </div>
</template>

<style scoped>
.video-player { display: flex; flex-direction: column; gap: 0.5rem; width: 100%; }

/* 再生面ラッパ: クリック層を絶対配置で重ねるための相対基準 */
.video-player__stage { position: relative; width: 100%; }
.video-player__surface { position: relative; width: 100%; }
/* YouTube iframe / HTML5 video を全幅・16:9 に */
.video-player__surface :deep(iframe),
.video-player__surface :deep(video) { display: block; width: 100%; aspect-ratio: 16 / 9; height: auto; border: 0; }

/* 痕跡などの overlay は視覚のみ (クリックを通す) */
.video-player__overlay { position: absolute; inset: 0; pointer-events: none; z-index: 2; }

/* クリック層: iframe より上でクリックを受け、フォーカス奪取を防ぐ */
.video-player__click-catch { position: absolute; inset: 0; z-index: 3; cursor: pointer; }

/* ローディング/エラー/再選択は最前面 */
.video-player__loading,
.video-player__reselect { position: absolute; inset: 0; z-index: 4; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 0.5rem; background: rgba(0, 0, 0, 0.4); }

/* コントロール: シークバーを独立した全幅行にして痕跡を見やすく */
.video-player__controls { display: flex; flex-wrap: wrap; align-items: center; gap: 0.5rem; }
.video-player__time { font-variant-numeric: tabular-nums; font-size: 0.875rem; }
.video-player__timeline { position: relative; flex: 1 1 100%; min-width: 0; padding-top: 0.5rem; }
.video-player__seek { width: 100%; display: block; }
</style>
