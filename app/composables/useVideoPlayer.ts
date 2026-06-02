/**
 * useVideoPlayer — 動画再生 composable
 *
 * 作成日: 2026-06-01
 * 関連タスク: TASK-0007
 * 関連設計: docs/design/video-playback/architecture.md / interfaces.ts
 *
 * スタイル: セミコロンなし / no comma dangle（CLAUDE.md ESLint 規約）
 */

import { readonly, ref } from 'vue'
import type {
  PlaybackRate,
  UseVideoPlayerReturn,
  VideoPlayerAdapter,
  VideoPlayerError,
  VideoPlayerState,
  VideoSource
} from '~/types/video-playback'
import { VIDEO_PLAYER_ERROR_CODE } from '~/types/video-playback'
import { extractYouTubeId } from '~/utils/video-playback/extract-youtube-id'
import { createYouTubeAdapter } from '~/utils/video-playback/youtube-adapter'
import { createHtml5Adapter } from '~/utils/video-playback/html5-adapter'

/** getLastError() を公開する拡張アダプタ型（YouTube / Html5 両アダプタが実装） */
type AdapterWithError = VideoPlayerAdapter & { getLastError(): VideoPlayerError | null }

export function useVideoPlayer(source: VideoSource): UseVideoPlayerReturn {
  const state = ref<VideoPlayerState>({
    status: 'unstarted',
    durationMs: null,
    currentTimeMs: 0,
    rate: 1,
    needsReselect: false,
    error: null
  })

  let adapter: VideoPlayerAdapter | null = null
  let rafId: number | null = null

  // ----------------------------------------------------------------
  // rAF ループ（currentTimeMs の UI 更新）
  // ----------------------------------------------------------------

  function rafLoop(): void {
    if (!adapter) return
    const ms = adapter.getCurrentTimeMs()
    if (ms !== null) {
      state.value.currentTimeMs = ms
    }
    rafId = requestAnimationFrame(rafLoop)
  }

  function startRaf(): void {
    if (rafId !== null) return
    rafId = requestAnimationFrame(rafLoop)
  }

  function stopRaf(): void {
    if (rafId !== null) {
      cancelAnimationFrame(rafId)
      rafId = null
    }
  }

  // ----------------------------------------------------------------
  // attach: アダプタ生成 → イベント購読 → mount
  // ----------------------------------------------------------------

  async function attach(el: HTMLElement): Promise<void> {
    // youtube: ID 検証
    if (source.type === 'youtube') {
      const id = extractYouTubeId(source.url)
      if (id === null) {
        state.value.error = {
          code: VIDEO_PLAYER_ERROR_CODE.youtubeInvalidUrl,
          messageKey: 'videoPlayer.error.youtubeInvalidUrl'
        }
        return
      }
      adapter = createYouTubeAdapter(source)
    } else {
      // local: file 存在確認
      if (!source.file) {
        state.value.needsReselect = true
        return
      }
      adapter = createHtml5Adapter(source)
    }

    // イベント購読
    adapter.on('statuschange', () => {
      state.value.status = adapter!.getStatus()
    })
    adapter.on('durationchange', () => {
      state.value.durationMs = adapter!.getDurationMs()
    })
    adapter.on('ended', () => {
      state.value.status = 'ended'
      stopRaf()
    })
    adapter.on('error', () => {
      state.value.error = (adapter as AdapterWithError).getLastError()
    })

    await adapter.mount(el)
  }

  // ----------------------------------------------------------------
  // detach: rAF 停止 → adapter 破棄
  // ----------------------------------------------------------------

  function detach(): void {
    stopRaf()
    adapter?.destroy()
    adapter = null
  }

  // ----------------------------------------------------------------
  // controls
  // ----------------------------------------------------------------

  const controls = {
    play(): void {
      adapter?.play()
      startRaf()
    },
    pause(): void {
      adapter?.pause()
      stopRaf()
    },
    seekToMs(ms: number): void {
      adapter?.seekToMs(ms)
    },
    setPlaybackRate(rate: PlaybackRate): void {
      adapter?.setPlaybackRate(rate)
      state.value.rate = rate
    },
    getCurrentTimeMs(): number | null {
      if (!adapter) return null
      return adapter.getCurrentTimeMs()
    }
  }

  return {
    state: readonly(state),
    controls,
    attach,
    detach
  }
}
