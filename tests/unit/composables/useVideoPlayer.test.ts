/**
 * useVideoPlayer 単体テスト（red フェーズ）
 *
 * フェーズ: red
 * 関連タスク: TASK-0007
 * 関連設計: docs/design/video-playback/architecture.md / interfaces.ts
 *
 * モック戦略:
 *   - createYouTubeAdapter / createHtml5Adapter を vi.mock でフェイクアダプタに差し替え
 *   - extractYouTubeId を vi.mock で制御（null / 有効ID を切り替え）
 *   - requestAnimationFrame / cancelAnimationFrame を vi.stubGlobal でフェイク実装
 *   - Vue の ref/readonly は node 環境でそのまま動作するため実物を使用
 *
 * フェイクアダプタ契約（green が従うべき仕様）:
 *   - on(event, handler): handlers Map に登録する
 *   - mount(el): vi.fn() → Promise<void>
 *   - destroy: vi.fn()
 *   - getStatus(): 'playing' | 'paused' | 'ended' | 'unstarted' | 'buffering'
 *   - getDurationMs(): number | null
 *   - getCurrentTimeMs(): number | null
 *   - getLastError(): VideoPlayerError | null
 *   - play / pause / seekToMs / setPlaybackRate: vi.fn()
 *
 * スタイル: セミコロンなし / no comma dangle（CLAUDE.md ESLint 規約）
 */

import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { PlayerEvent, VideoPlayerAdapter, VideoPlayerError } from '~/types/video-playback'
import { VIDEO_PLAYER_ERROR_CODE } from '~/types/video-playback'

// -------------------------------------------------------------------
// フェイクアダプタ生成ヘルパー
// -------------------------------------------------------------------

type FakeHandlers = Map<PlayerEvent, () => void>

interface FakeAdapter extends VideoPlayerAdapter {
  getLastError(): VideoPlayerError | null
  _handlers: FakeHandlers
  _lastError: VideoPlayerError | null
  _status: string
  _durationMs: number | null
  _currentTimeMs: number | null
}

function createFakeAdapter(): FakeAdapter {
  const handlers: FakeHandlers = new Map()
  let lastError: VideoPlayerError | null = null
  let status = 'unstarted'
  let durationMs: number | null = null
  let currentTimeMs: number | null = null

  const adapter: FakeAdapter = {
    _handlers: handlers,
    get _lastError() { return lastError },
    set _lastError(v: VideoPlayerError | null) { lastError = v },
    get _status() { return status },
    set _status(v: string) { status = v },
    get _durationMs() { return durationMs },
    set _durationMs(v: number | null) { durationMs = v },
    get _currentTimeMs() { return currentTimeMs },
    set _currentTimeMs(v: number | null) { currentTimeMs = v },
    on: vi.fn((event: PlayerEvent, handler: () => void) => {
      handlers.set(event, handler)
    }),
    mount: vi.fn(() => Promise.resolve()),
    destroy: vi.fn(),
    play: vi.fn(),
    pause: vi.fn(),
    seekToMs: vi.fn(),
    setPlaybackRate: vi.fn(),
    getStatus: vi.fn(() => status as ReturnType<VideoPlayerAdapter['getStatus']>),
    getDurationMs: vi.fn(() => durationMs),
    getCurrentTimeMs: vi.fn(() => currentTimeMs),
    getLastError: vi.fn(() => lastError)
  }
  return adapter
}

// -------------------------------------------------------------------
// vi.hoisted: フェイクアダプタインスタンスを hoisted スコープに保持
// -------------------------------------------------------------------

const {
  fakeYouTubeAdapter,
  fakeHtml5Adapter,
  extractYouTubeIdMock
} = vi.hoisted(() => {
  // フェイクアダプタのスナップショット参照を hoisted 外から書き換えられるよう
  // wrapper オブジェクト経由で保持する
  const adapterRef: { youtube: ReturnType<typeof createFakeAdapter> | null, html5: ReturnType<typeof createFakeAdapter> | null } = {
    youtube: null,
    html5: null
  }

  const fakeYouTubeAdapter = adapterRef as { youtube: ReturnType<typeof createFakeAdapter> | null }
  const fakeHtml5Adapter = adapterRef as { html5: ReturnType<typeof createFakeAdapter> | null }
  const extractYouTubeIdMock = { fn: vi.fn<(url: string) => string | null>(() => 'dQw4w9WgXcQ') }

  return { fakeYouTubeAdapter, fakeHtml5Adapter, extractYouTubeIdMock }
})

// -------------------------------------------------------------------
// vi.mock: アダプタファクトリ / extractYouTubeId を差し替え
// -------------------------------------------------------------------

vi.mock('~/utils/video-playback/youtube-adapter', () => ({
  createYouTubeAdapter: vi.fn(() => fakeYouTubeAdapter.youtube)
}))

vi.mock('~/utils/video-playback/html5-adapter', () => ({
  createHtml5Adapter: vi.fn(() => fakeHtml5Adapter.html5)
}))

vi.mock('~/utils/video-playback/extract-youtube-id', () => ({
  extractYouTubeId: (url: string) => extractYouTubeIdMock.fn(url)
}))

// eslint-disable-next-line import/first
import { useVideoPlayer } from '~/composables/useVideoPlayer'

describe('useVideoPlayer', () => {
  // フェイク rAF の制御
  let rafCallbacks: Map<number, FrameRequestCallback>
  let rafIdCounter: number

  beforeEach(() => {
    // フェイクアダプタを毎テスト前にリセット
    const ytAdapter = createFakeAdapter()
    const h5Adapter = createFakeAdapter()
    ;(fakeYouTubeAdapter as { youtube: ReturnType<typeof createFakeAdapter> | null }).youtube = ytAdapter
    ;(fakeHtml5Adapter as { html5: ReturnType<typeof createFakeAdapter> | null }).html5 = h5Adapter

    // extractYouTubeId デフォルト: 有効 ID を返す
    extractYouTubeIdMock.fn = vi.fn(() => 'dQw4w9WgXcQ')

    // フェイク requestAnimationFrame / cancelAnimationFrame
    rafCallbacks = new Map()
    rafIdCounter = 0

    vi.stubGlobal('requestAnimationFrame', vi.fn((cb: FrameRequestCallback) => {
      const id = ++rafIdCounter
      rafCallbacks.set(id, cb)
      return id
    }))

    vi.stubGlobal('cancelAnimationFrame', vi.fn((id: number) => {
      rafCallbacks.delete(id)
    }))

    vi.clearAllMocks()

    // clearAllMocks 後に再設定
    extractYouTubeIdMock.fn = vi.fn(() => 'dQw4w9WgXcQ')
    ;(fakeYouTubeAdapter as { youtube: ReturnType<typeof createFakeAdapter> | null }).youtube = ytAdapter
    ;(fakeHtml5Adapter as { html5: ReturnType<typeof createFakeAdapter> | null }).html5 = h5Adapter
  })

  // ----------------------------------------------------------------
  // ケース1: YouTube 無効 URL → state.error = youtube-invalid-url, mount 非呼び出し（EDGE-002）
  // ----------------------------------------------------------------
  it('youtube 無効 URL で attach すると error.code が youtube-invalid-url になり mount は呼ばれない', async () => {
    // extractYouTubeId が null を返す（ID 抽出不可）
    extractYouTubeIdMock.fn = vi.fn(() => null)

    const source = { type: 'youtube' as const, url: 'https://example.com/not-a-video' }
    const fakeEl = {} as HTMLElement

    const { state, attach } = useVideoPlayer(source)
    await attach(fakeEl)

    expect(state.value.error).not.toBeNull()
    expect(state.value.error!.code).toBe(VIDEO_PLAYER_ERROR_CODE.youtubeInvalidUrl)

    const ytAdapter = (fakeYouTubeAdapter as { youtube: ReturnType<typeof createFakeAdapter> | null }).youtube!
    expect(ytAdapter.mount).not.toHaveBeenCalled()
  })

  // ----------------------------------------------------------------
  // ケース2: local で file 無し → state.needsReselect=true, mount 非呼び出し（REQ-103）
  // ----------------------------------------------------------------
  it('local で file 無しの source で attach すると needsReselect が true になり mount は呼ばれない', async () => {
    // LocalSource の file を undefined で渡す（型は as unknown as LocalSource で迂回）
    const source = { type: 'local' as const, file: undefined } as unknown as { type: 'local', file: File }
    const fakeEl = {} as HTMLElement

    const { state, attach } = useVideoPlayer(source)
    await attach(fakeEl)

    expect(state.value.needsReselect).toBe(true)

    const h5Adapter = (fakeHtml5Adapter as { html5: ReturnType<typeof createFakeAdapter> | null }).html5!
    expect(h5Adapter.mount).not.toHaveBeenCalled()
  })

  // ----------------------------------------------------------------
  // ケース3: 正常 attach で mount が呼ばれ statuschange/durationchange 購読で state 反映
  // ----------------------------------------------------------------
  it('正常 attach で adapter.mount が呼ばれ statuschange/durationchange で state が更新される', async () => {
    const source = { type: 'youtube' as const, url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ' }
    const fakeEl = {} as HTMLElement

    const ytAdapter = (fakeYouTubeAdapter as { youtube: ReturnType<typeof createFakeAdapter> | null }).youtube!

    const { state, attach } = useVideoPlayer(source)
    await attach(fakeEl)

    // mount が呼ばれること
    expect(ytAdapter.mount).toHaveBeenCalledWith(fakeEl)

    // statuschange イベント発火で state.status が更新されること
    ytAdapter._status = 'playing'
    ;(ytAdapter.getStatus as ReturnType<typeof vi.fn>).mockReturnValue('playing')
    const statusHandler = ytAdapter._handlers.get('statuschange')
    expect(statusHandler).toBeDefined()
    statusHandler!()
    expect(state.value.status).toBe('playing')

    // durationchange イベント発火で state.durationMs が更新されること
    ytAdapter._durationMs = 120000
    ;(ytAdapter.getDurationMs as ReturnType<typeof vi.fn>).mockReturnValue(120000)
    const durationHandler = ytAdapter._handlers.get('durationchange')
    expect(durationHandler).toBeDefined()
    durationHandler!()
    expect(state.value.durationMs).toBe(120000)
  })

  // ----------------------------------------------------------------
  // ケース4: getCurrentTimeMs が adapter に委譲され、未ロード時は null（NFR-001 / REQ-201）
  // ----------------------------------------------------------------
  it('attach 前の getCurrentTimeMs は null を返し、attach 後はアダプタ戻り値を返す', async () => {
    const source = { type: 'youtube' as const, url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ' }
    const fakeEl = {} as HTMLElement

    const { controls, attach } = useVideoPlayer(source)

    // attach 前 → null
    expect(controls.getCurrentTimeMs()).toBeNull()

    const ytAdapter = (fakeYouTubeAdapter as { youtube: ReturnType<typeof createFakeAdapter> | null }).youtube!
    ;(ytAdapter.getCurrentTimeMs as ReturnType<typeof vi.fn>).mockReturnValue(5000)

    await attach(fakeEl)

    // attach 後 → アダプタが返す値
    expect(controls.getCurrentTimeMs()).toBe(5000)
    expect(ytAdapter.getCurrentTimeMs).toHaveBeenCalled()
  })

  // ----------------------------------------------------------------
  // ケース5: error イベントで adapter.getLastError() が state.error に反映される
  // ----------------------------------------------------------------
  it('error イベントで adapter.getLastError() の値が state.error に反映される', async () => {
    const source = { type: 'youtube' as const, url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ' }
    const fakeEl = {} as HTMLElement

    const ytAdapter = (fakeYouTubeAdapter as { youtube: ReturnType<typeof createFakeAdapter> | null }).youtube!
    const fakeError: VideoPlayerError = {
      code: VIDEO_PLAYER_ERROR_CODE.youtubeLoadFailed,
      messageKey: 'videoPlayer.error.youtubeLoadFailed'
    }
    ;(ytAdapter.getLastError as ReturnType<typeof vi.fn>).mockReturnValue(fakeError)

    const { state, attach } = useVideoPlayer(source)
    await attach(fakeEl)

    const errorHandler = ytAdapter._handlers.get('error')
    expect(errorHandler).toBeDefined()
    errorHandler!()

    expect(state.value.error).toEqual(fakeError)
  })

  // ----------------------------------------------------------------
  // ケース6: 再生中に rAF が要求され、pause で cancelAnimationFrame が呼ばれる（NFR-001）
  // ----------------------------------------------------------------
  it('play で requestAnimationFrame が呼ばれ、pause で cancelAnimationFrame が呼ばれる', async () => {
    const source = { type: 'youtube' as const, url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ' }
    const fakeEl = {} as HTMLElement

    const { controls, attach } = useVideoPlayer(source)
    await attach(fakeEl)

    controls.play()
    expect(requestAnimationFrame).toHaveBeenCalled()

    controls.pause()
    expect(cancelAnimationFrame).toHaveBeenCalled()
  })

  // ----------------------------------------------------------------
  // ケース7: detach で adapter.destroy と cancelAnimationFrame が呼ばれる
  // ----------------------------------------------------------------
  it('detach で adapter.destroy が 1 回呼ばれ rAF が解除される', async () => {
    const source = { type: 'youtube' as const, url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ' }
    const fakeEl = {} as HTMLElement

    const ytAdapter = (fakeYouTubeAdapter as { youtube: ReturnType<typeof createFakeAdapter> | null }).youtube!

    const { controls, attach, detach } = useVideoPlayer(source)
    await attach(fakeEl)

    // rAF が走っている状態を作る
    controls.play()

    detach()

    expect(ytAdapter.destroy).toHaveBeenCalledTimes(1)
    expect(cancelAnimationFrame).toHaveBeenCalled()
  })
})
