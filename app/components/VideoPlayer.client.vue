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

import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
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

onMounted(async () => {
  if (playerEl.value) await props.player.attach(playerEl.value)
})

onBeforeUnmount(() => {
  props.player.detach()
})
</script>

<template>
  <div class="video-player">
    <!-- 再生面 + overlay 層 -->
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
