/**
 * YouTube IFrame Player アダプタ
 *
 * 作成日: 2026-06-01
 * 関連タスク: TASK-0006
 * 関連設計: docs/design/video-playback/interfaces.ts / architecture.md
 *
 * スタイル: セミコロンなし / no comma dangle（CLAUDE.md ESLint 規約）
 */

import type { PlayerEvent, PlayerStatus, VideoPlayerAdapter, VideoPlayerError, YouTubeSource } from '~/types/video-playback'
import { VIDEO_PLAYER_ERROR_CODE } from '~/types/video-playback'
import { clampMs } from './clamp'
import { extractYouTubeId } from './extract-youtube-id'
import { ensureApiLoaded } from './youtube-api-loader'

/** onError で youtube-load-failed を発火するコード（EDGE-001） */
const LOAD_FAILED_CODES = new Set([2, 5, 100, 101, 150])

/** YT.PlayerState 数値 → PlayerStatus マッピング */
function toPlayerStatus(data: number): PlayerStatus {
  switch (data) {
    case 1: return 'playing'
    case 2: return 'paused'
    case 3: return 'buffering'
    case 0: return 'ended'
    // -1 (UNSTARTED) / 5 (CUED) ともに unstarted 扱い
    default: return 'unstarted'
  }
}

/**
 * YouTube アダプタを生成する。
 * `VideoPlayerAdapter` を実装し、追加メソッド `getLastError()` を公開する。
 */
export function createYouTubeAdapter(
  source: YouTubeSource
): VideoPlayerAdapter & { getLastError(): VideoPlayerError | null } {
  // --- 内部状態 ---
  let player: YT.Player | null = null
  let status: PlayerStatus = 'unstarted'
  let durationMs: number | null = null
  let lastError: VideoPlayerError | null = null

  /** イベントリスナー管理 */
  const listeners: Map<PlayerEvent, Array<() => void>> = new Map()

  function emit(event: PlayerEvent): void {
    const handlers = listeners.get(event)
    if (!handlers) return
    for (const handler of handlers) {
      handler()
    }
  }

  // --- YT.Player コールバック ---

  function handleReady(resolveMount: () => void): void {
    // durationMs を更新
    if (player) {
      const raw = player.getDuration()
      durationMs = isNaN(raw) || raw === 0 ? null : Math.round(raw * 1000)
      if (durationMs !== null) {
        emit('durationchange')
      }
      // 初期 status を反映
      status = toPlayerStatus(player.getPlayerState())
    }
    resolveMount()
  }

  function handleStateChange(event: { data: number }): void {
    status = toPlayerStatus(event.data)
    emit('statuschange')
    if (event.data === YT.PlayerState.ENDED) {
      emit('ended')
    }
  }

  function handleError(event: { data: number }): void {
    if (!LOAD_FAILED_CODES.has(event.data)) return
    lastError = {
      code: VIDEO_PLAYER_ERROR_CODE.youtubeLoadFailed,
      messageKey: 'videoPlayer.error.youtubeLoadFailed'
    }
    emit('error')
  }

  // --- VideoPlayerAdapter 実装 ---

  function on(event: PlayerEvent, handler: () => void): void {
    if (!listeners.has(event)) {
      listeners.set(event, [])
    }
    listeners.get(event)!.push(handler)
  }

  async function mount(el: HTMLElement): Promise<void> {
    const videoId = extractYouTubeId(source.url)

    // API ロード完了を待ってから YT.Player を生成する（正しい順序）。
    // ensureApiLoaded() が解決するまで YT グローバルは存在しないため、
    // await 前に new YT.Player を呼ぶと production で YT is undefined になる。
    await ensureApiLoaded()

    return new Promise<void>((resolve) => {
      const instance = new YT.Player(el, {
        videoId: videoId ?? '',
        // 自前コントロールを主役にする: YouTube の操作 UI とキーボードを無効化し、
        // Space 等のキーが iframe に奪われないようにする (フォーカス対策は VideoPlayer の click-catch 層と併用)。
        playerVars: {
          controls: 0, // YouTube ネイティブのコントロールバーを隠す
          disablekb: 1, // YouTube のキーボード操作を無効化
          modestbranding: 1,
          rel: 0,
          playsinline: 1,
          fs: 0 // 全画面ボタン非表示
        },
        events: {
          onReady: () => handleReady(resolve),
          onStateChange: handleStateChange,
          onError: handleError
        }
      })
      // FakePlayer が new の戻り値としてフェイクインスタンスを返すため代入
      player = instance as YT.Player
    })
  }

  function destroy(): void {
    player?.destroy()
    player = null
  }

  function play(): void {
    player?.playVideo()
  }

  function pause(): void {
    player?.pauseVideo()
  }

  function seekToMs(ms: number): void {
    if (!player) return
    const clamped = clampMs(ms, durationMs)
    player.seekTo(clamped / 1000, true)
  }

  function setPlaybackRate(rate: number): void {
    player?.setPlaybackRate(rate)
  }

  function getCurrentTimeMs(): number | null {
    if (!player) return null
    const raw = player.getCurrentTime()
    if (isNaN(raw)) return null
    return Math.round(raw * 1000)
  }

  function getDurationMs(): number | null {
    return durationMs
  }

  function getStatus(): PlayerStatus {
    return status
  }

  function getLastError(): VideoPlayerError | null {
    return lastError
  }

  return {
    on,
    mount,
    destroy,
    play,
    pause,
    seekToMs,
    setPlaybackRate,
    getCurrentTimeMs,
    getDurationMs,
    getStatus,
    getLastError
  }
}
