import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { PlayerEvent, VideoPlayerAdapter, VideoPlayerError } from '~/types/video-playback'
import { VIDEO_PLAYER_ERROR_CODE } from '~/types/video-playback'

// -------------------------------------------------------------------
// モック設計
//
// 1. globalThis.YT を vi.stubGlobal で差し替え:
//    - YT.Player は vi.fn() コンストラクタ。生成時に渡された events を
//      fakePlayerInstance._events に保持し、テストが手動発火できる
//    - YT.PlayerState 定数を定義（UNSTARTED/-1, ENDED/0, PLAYING/1,
//      PAUSED/2, BUFFERING/3, CUED/5）
//
// 2. fakePlayerInstance のメソッド（playVideo / pauseVideo / seekTo /
//    setPlaybackRate / getCurrentTime / getDuration / getPlayerState /
//    destroy）はすべて vi.fn()
//
// 3. ensureApiLoaded は vi.mock で即時 resolve（YT グローバルをモック済み前提）
//    extractYouTubeId は vi.mock で 'dQw4w9WgXcQ' を返す固定モック
//
// 実装の待ち合わせ契約（refactor 是正後）:
//   - mount(el) は ensureApiLoaded() を await してから new YT.Player を呼ぶ
//   - ensureApiLoaded が即時 resolve でも await により new YT.Player は
//     次の microtask 以降で実行される
//   - テストは mount() 呼び出し後に await Promise.resolve() を数回挟んで
//     new YT.Player 呼び出し（= _events セット）を待ってから onReady を発火する
//   - YT.Player コンストラクタに { videoId, events: { onReady, onStateChange, onError } } を渡す
//   - getLastError(): VideoPlayerError | null をオブジェクトに追加する
//     （VideoPlayerAdapter インターフェース違反にはならない——余分プロパティは許容）
// -------------------------------------------------------------------

// -------------------------------------------------------------------
// ensureApiLoaded / extractYouTubeId を vi.mock でスタブ
// -------------------------------------------------------------------
vi.mock('~/utils/video-playback/youtube-api-loader', () => ({
  ensureApiLoaded: vi.fn(() => Promise.resolve())
}))

vi.mock('~/utils/video-playback/extract-youtube-id', () => ({
  extractYouTubeId: vi.fn(() => 'dQw4w9WgXcQ')
}))

describe('createYouTubeAdapter', () => {
  // フェイク YT.Player インスタンス（コンストラクタ生成時に差し替える）
  let fakePlayerInstance: {
    _events: {
      onReady?: (e: { target: unknown }) => void
      onStateChange?: (e: { data: number }) => void
      onError?: (e: { data: number }) => void
    }
    playVideo: ReturnType<typeof vi.fn>
    pauseVideo: ReturnType<typeof vi.fn>
    seekTo: ReturnType<typeof vi.fn>
    setPlaybackRate: ReturnType<typeof vi.fn>
    getCurrentTime: ReturnType<typeof vi.fn>
    getDuration: ReturnType<typeof vi.fn>
    getPlayerState: ReturnType<typeof vi.fn>
    destroy: ReturnType<typeof vi.fn>
  }

  /** フェイク el（mount の引数用） */
  const fakeEl = {} as HTMLElement

  /** adapter（VideoPlayerAdapter + getLastError 拡張） */
  let adapter: VideoPlayerAdapter & { getLastError(): VideoPlayerError | null }

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  beforeEach(async () => {
    // フェイク player インスタンスを毎テスト初期化
    fakePlayerInstance = {
      _events: {},
      playVideo: vi.fn(),
      pauseVideo: vi.fn(),
      seekTo: vi.fn(),
      setPlaybackRate: vi.fn(),
      getCurrentTime: vi.fn(() => 0),
      getDuration: vi.fn(() => 0),
      getPlayerState: vi.fn(() => -1), // UNSTARTED
      destroy: vi.fn()
    }

    // YT グローバルをスタブ
    // YT.Player コンストラクタは呼ばれた時点で events を _events に保存し
    // fakePlayerInstance を返す（new の戻り値はコンストラクタが返すオブジェクト）
    const FakePlayer = vi.fn(function (
      this: unknown,
      _el: unknown,
      opts: {
        videoId: string
        events?: {
          onReady?: (e: { target: unknown }) => void
          onStateChange?: (e: { data: number }) => void
          onError?: (e: { data: number }) => void
        }
      }
    ) {
      fakePlayerInstance._events = opts.events ?? {}
      return fakePlayerInstance
    })

    vi.stubGlobal('YT', {
      Player: FakePlayer,
      PlayerState: {
        UNSTARTED: -1,
        ENDED: 0,
        PLAYING: 1,
        PAUSED: 2,
        BUFFERING: 3,
        CUED: 5
      }
    })

    const { createYouTubeAdapter } = await import('~/utils/video-playback/youtube-adapter')
    adapter = createYouTubeAdapter({ type: 'youtube', url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ' }) as VideoPlayerAdapter & { getLastError(): VideoPlayerError | null }
  })

  // ----------------------------------------------------------------
  // ケース1: onReady で duration と status が反映される
  // ----------------------------------------------------------------
  it('onReady で getDurationMs が ms 整数を返し getStatus が初期 playerState に対応する', async () => {
    fakePlayerInstance.getDuration.mockReturnValue(120.5)
    fakePlayerInstance.getPlayerState.mockReturnValue(2) // PAUSED

    let durationChangeCalled = false
    adapter.on('durationchange' as PlayerEvent, () => {
      durationChangeCalled = true
    })

    const mountPromise = adapter.mount(fakeEl)

    // ensureApiLoaded() の await（即時 resolve）が完了し new YT.Player が
    // 呼ばれて _events がセットされるまで microtask を flush する
    await Promise.resolve()
    await Promise.resolve()

    // onReady を手動発火して mount を解決させる
    fakePlayerInstance._events.onReady?.({ target: fakePlayerInstance })

    await mountPromise

    expect(adapter.getDurationMs()).toBe(120500) // Math.round(120.5 * 1000)
    expect(adapter.getStatus()).toBe('paused')
    expect(durationChangeCalled).toBe(true)
  })

  // ----------------------------------------------------------------
  // ケース2: onStateChange の各値が統一 status へマッピングされる
  // ----------------------------------------------------------------
  it('onStateChange が PLAYING/BUFFERING/PAUSED/ENDED/CUED を統一 status にマッピングし ENDED のみ ended を発火する', async () => {
    fakePlayerInstance.getDuration.mockReturnValue(0)
    fakePlayerInstance.getPlayerState.mockReturnValue(-1)

    const statusChangeCalls: string[] = []
    let endedCount = 0

    adapter.on('statuschange' as PlayerEvent, () => {
      statusChangeCalls.push(adapter.getStatus())
    })
    adapter.on('ended' as PlayerEvent, () => {
      endedCount++
    })

    const mountPromise = adapter.mount(fakeEl)
    await Promise.resolve()
    await Promise.resolve()
    fakePlayerInstance._events.onReady?.({ target: fakePlayerInstance })
    await mountPromise

    // PLAYING(1) → BUFFERING(3) → PAUSED(2) → ENDED(0) → CUED(5)
    fakePlayerInstance._events.onStateChange?.({ data: 1 })
    expect(adapter.getStatus()).toBe('playing')

    fakePlayerInstance._events.onStateChange?.({ data: 3 })
    expect(adapter.getStatus()).toBe('buffering')

    fakePlayerInstance._events.onStateChange?.({ data: 2 })
    expect(adapter.getStatus()).toBe('paused')

    fakePlayerInstance._events.onStateChange?.({ data: 0 })
    expect(adapter.getStatus()).toBe('ended')

    fakePlayerInstance._events.onStateChange?.({ data: 5 })
    expect(adapter.getStatus()).toBe('unstarted')

    // ENDED のみ ended イベントが発火（1回のみ）
    expect(endedCount).toBe(1)
    // statuschange は状態が変化するたびに発火
    expect(statusChangeCalls).toContain('playing')
    expect(statusChangeCalls).toContain('paused')
    expect(statusChangeCalls).toContain('ended')
  })

  // ----------------------------------------------------------------
  // ケース3: onError(101) で youtube-load-failed を emit する（EDGE-001）
  // ----------------------------------------------------------------
  it('onError(101) で error ハンドラが呼ばれ getLastError が youtube-load-failed を返す。対象外コードは無視される', async () => {
    fakePlayerInstance.getDuration.mockReturnValue(0)
    fakePlayerInstance.getPlayerState.mockReturnValue(-1)

    let errorHandlerCalled = false

    adapter.on('error' as PlayerEvent, () => {
      errorHandlerCalled = true
    })

    const mountPromise = adapter.mount(fakeEl)
    await Promise.resolve()
    await Promise.resolve()
    fakePlayerInstance._events.onReady?.({ target: fakePlayerInstance })
    await mountPromise

    // 対象外コード（1）は無視される
    fakePlayerInstance._events.onError?.({ data: 1 })
    expect(errorHandlerCalled).toBe(false)
    expect(adapter.getLastError()).toBeNull()

    // 対象コード(101) で error emit
    fakePlayerInstance._events.onError?.({ data: 101 })
    expect(errorHandlerCalled).toBe(true)
    expect(adapter.getLastError()).not.toBeNull()
    expect(adapter.getLastError()!.code).toBe(VIDEO_PLAYER_ERROR_CODE.youtubeLoadFailed)
    expect(adapter.getLastError()!.messageKey).toBe('videoPlayer.error.youtubeLoadFailed')
  })

  // ----------------------------------------------------------------
  // ケース4: 未ロード時 getCurrentTimeMs が null を返す
  // ----------------------------------------------------------------
  it('mount 前は getCurrentTimeMs が null を返す', () => {
    expect(adapter.getCurrentTimeMs()).toBeNull()
  })

  // ----------------------------------------------------------------
  // ケース5: seekToMs が clampMs 適用後に seekTo(sec, true) を呼ぶ
  // ----------------------------------------------------------------
  it('seekToMs が clampMs を適用して seekTo(sec, true) を呼ぶ（負値→0 / 超過→duration）', async () => {
    fakePlayerInstance.getDuration.mockReturnValue(10) // durationMs = 10000
    fakePlayerInstance.getPlayerState.mockReturnValue(-1)

    const mountPromise = adapter.mount(fakeEl)
    await Promise.resolve()
    await Promise.resolve()
    fakePlayerInstance._events.onReady?.({ target: fakePlayerInstance })
    await mountPromise

    expect(adapter.getDurationMs()).toBe(10000)

    // 負値 → 0秒
    adapter.seekToMs(-500)
    expect(fakePlayerInstance.seekTo).toHaveBeenLastCalledWith(0, true)

    // 超過 → 10秒（durationMs / 1000）
    adapter.seekToMs(99999)
    expect(fakePlayerInstance.seekTo).toHaveBeenLastCalledWith(10, true)
  })

  // ----------------------------------------------------------------
  // ケース6: setPlaybackRate が player.setPlaybackRate を呼ぶ
  // ----------------------------------------------------------------
  it('setPlaybackRate(1.5) が player.setPlaybackRate(1.5) を 1 回呼ぶ', async () => {
    fakePlayerInstance.getDuration.mockReturnValue(0)
    fakePlayerInstance.getPlayerState.mockReturnValue(-1)

    const mountPromise = adapter.mount(fakeEl)
    await Promise.resolve()
    await Promise.resolve()
    fakePlayerInstance._events.onReady?.({ target: fakePlayerInstance })
    await mountPromise

    adapter.setPlaybackRate(1.5)
    expect(fakePlayerInstance.setPlaybackRate).toHaveBeenCalledTimes(1)
    expect(fakePlayerInstance.setPlaybackRate).toHaveBeenCalledWith(1.5)
  })
})
