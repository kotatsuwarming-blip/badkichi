/**
 * Html5Adapter — ローカル動画用アダプタ
 *
 * 作成日: 2026-06-01
 * フェーズ: green
 * 関連: TASK-0005 / docs/implements/video-playback/TASK-0005/green-notes.md
 *
 * スタイル: セミコロンなし / no comma dangle（CLAUDE.md ESLint 規約）
 */

import type { LocalSource, PlayerEvent, PlayerStatus, VideoPlayerAdapter, VideoPlayerError, PlaybackRate } from '~/types/video-playback'
import { VIDEO_PLAYER_ERROR_CODE } from '~/types/video-playback'
import { clampMs } from '~/utils/video-playback/clamp'

// ケース4: getLastError を追加した拡張型（インターフェース違反にならない余分プロパティ）
export interface Html5Adapter extends VideoPlayerAdapter {
  getLastError(): VideoPlayerError | null
}

export function createHtml5Adapter(source: LocalSource): Html5Adapter {
  let video: HTMLVideoElement | null = null
  let objectUrl: string | null = null
  let status: PlayerStatus = 'unstarted'
  let durationMs: number | null = null
  let lastError: VideoPlayerError | null = null

  const listeners: Map<PlayerEvent, Array<() => void>> = new Map()

  function emit(event: PlayerEvent): void {
    const handlers = listeners.get(event)
    if (handlers) {
      for (const h of handlers) {
        h()
      }
    }
  }

  function setStatus(next: PlayerStatus): void {
    if (status !== next) {
      status = next
      emit('statuschange')
    }
  }

  // HTML5 video イベントハンドラ
  function onLoadedMetadata(): void {
    if (!video) return
    durationMs = Math.round(video.duration * 1000)
    emit('durationchange')
  }

  function onCanPlay(): void {
    // canplay は再生可能になった合図。状態は playing/pause で上書きされるため ここでは buffering を解除しない
    // (unstarted → buffering → playing の流れは playing イベントで行う)
  }

  function onPlaying(): void {
    setStatus('playing')
  }

  function onPause(): void {
    setStatus('paused')
  }

  function onWaiting(): void {
    setStatus('buffering')
  }

  function onEnded(): void {
    setStatus('ended')
    emit('ended')
  }

  function onError(): void {
    lastError = {
      code: VIDEO_PLAYER_ERROR_CODE.localDecodeFailed,
      messageKey: 'videoPlayer.error.localDecodeFailed'
    }
    emit('error')
  }

  async function mount(el: HTMLElement): Promise<void> {
    // document.createElement('video') でフェイクが注入されるようにする
    video = document.createElement('video') as HTMLVideoElement

    objectUrl = URL.createObjectURL(source.file)
    video.src = objectUrl

    el.appendChild(video)

    video.addEventListener('loadedmetadata', onLoadedMetadata)
    video.addEventListener('canplay', onCanPlay)
    video.addEventListener('playing', onPlaying)
    video.addEventListener('pause', onPause)
    video.addEventListener('waiting', onWaiting)
    video.addEventListener('ended', onEnded)
    video.addEventListener('error', onError)
  }

  function destroy(): void {
    if (video) {
      video.removeEventListener('loadedmetadata', onLoadedMetadata)
      video.removeEventListener('canplay', onCanPlay)
      video.removeEventListener('playing', onPlaying)
      video.removeEventListener('pause', onPause)
      video.removeEventListener('waiting', onWaiting)
      video.removeEventListener('ended', onEnded)
      video.removeEventListener('error', onError)
      video.removeAttribute('src')
      video = null
    }
    if (objectUrl) {
      URL.revokeObjectURL(objectUrl)
      objectUrl = null
    }
    status = 'unstarted'
    durationMs = null
  }

  function play(): void {
    video?.play()
  }

  function pause(): void {
    video?.pause()
  }

  function seekToMs(ms: number): void {
    if (!video) return
    const clamped = clampMs(ms, durationMs)
    video.currentTime = clamped / 1000
  }

  function getCurrentTimeMs(): number | null {
    if (!video || durationMs === null) return null
    return Math.round(video.currentTime * 1000)
  }

  function getDurationMs(): number | null {
    return durationMs
  }

  function getStatus(): PlayerStatus {
    return status
  }

  function setPlaybackRate(rate: PlaybackRate): void {
    if (video) {
      video.playbackRate = rate
    }
  }

  function on(event: PlayerEvent, handler: () => void): void {
    if (!listeners.has(event)) {
      listeners.set(event, [])
    }
    listeners.get(event)!.push(handler)
  }

  function getLastError(): VideoPlayerError | null {
    return lastError
  }

  return {
    mount,
    destroy,
    play,
    pause,
    seekToMs,
    getCurrentTimeMs,
    getDurationMs,
    getStatus,
    setPlaybackRate,
    on,
    getLastError
  }
}
