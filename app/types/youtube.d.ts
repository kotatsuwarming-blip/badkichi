/**
 * YouTube IFrame Player API のグローバル型宣言（最小集合）
 *
 * 作成日: 2026-06-01
 * 関連タスク: TASK-0004 youtube-api-loader
 * @types/youtube 未インストールのため自前宣言。Phase 2 アダプタ実装で拡張可。
 *
 * スタイル: セミコロンなし / no comma dangle（CLAUDE.md ESLint 規約）
 */

/** YouTube IFrame Player 最小型（Phase 2 アダプタ実装時に拡張） */
interface YTPlayer {
  playVideo(): void
  pauseVideo(): void
  seekTo(seconds: number, allowSeekAhead: boolean): void
  setPlaybackRate(suggestedRate: number): void
  getCurrentTime(): number
  getDuration(): number
  getPlayerState(): number
  destroy(): void
}

/** YouTube IFrame Player コンストラクタオプション（最小集合） */
interface YTPlayerOptions {
  height?: string | number
  width?: string | number
  videoId?: string
  playerVars?: Record<string, unknown>
  events?: {
    onReady?: (event: { target: YTPlayer }) => void
    onStateChange?: (event: { data: number }) => void
    onError?: (event: { data: number }) => void
  }
}

/** YouTube IFrame API ネームスペース（最小集合） */
declare namespace YT {
  class Player {
    constructor(el: string | HTMLElement, options: YTPlayerOptions)
    playVideo(): void
    pauseVideo(): void
    seekTo(seconds: number, allowSeekAhead: boolean): void
    setPlaybackRate(suggestedRate: number): void
    getCurrentTime(): number
    getDuration(): number
    getPlayerState(): number
    destroy(): void
  }

  const PlayerState: {
    readonly UNSTARTED: -1
    readonly ENDED: 0
    readonly PLAYING: 1
    readonly PAUSED: 2
    readonly BUFFERING: 3
    readonly CUED: 5
  }
}

declare interface Window {
  YT: typeof YT
  onYouTubeIframeAPIReady: (() => void) | undefined
}
