import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { PlayerEvent, VideoPlayerAdapter } from '~/types/video-playback'
import { VIDEO_PLAYER_ERROR_CODE } from '~/types/video-playback'

// -------------------------------------------------------------------
// モック設計（green が従う契約）
//
// 1. document.createElement('video') が fakevideo を返すよう vi.stubGlobal でモック
// 2. fakevideo は addEventListener / removeEventListener / play / pause および
//    プロパティ(src, currentTime, duration, playbackRate) を持つフェイクオブジェクト
// 3. URL.createObjectURL / URL.revokeObjectURL は vi.stubGlobal('URL', {...}) でモック
// 4. イベントは fakevideo に登録されたハンドラを手動で呼び出して擬似発火
//
// green 実装への契約:
//   - mount(el) 内部で document.createElement('video') を使って <video> を生成し
//     el に appendChild して使う（または el 自体が <video> の場合はそのまま使う）
//   - createObjectURL の戻り値を video.src に設定する
//   - destroy() で video.removeAttribute('src') または video.src = '' をクリアし
//     URL.revokeObjectURL を呼ぶ
// -------------------------------------------------------------------

describe('createHtml5Adapter', () => {
  type EventMap = Map<string, EventListenerOrEventListenerObject>

  let fakeVideo: {
    src: string
    currentTime: number
    duration: number
    playbackRate: number
    _listeners: EventMap
    addEventListener: ReturnType<typeof vi.fn>
    removeEventListener: ReturnType<typeof vi.fn>
    play: ReturnType<typeof vi.fn>
    pause: ReturnType<typeof vi.fn>
    removeAttribute: ReturnType<typeof vi.fn>
    appendChild: ReturnType<typeof vi.fn>
  }

  let fakeEl: { appendChild: ReturnType<typeof vi.fn> }
  let createObjectURLSpy: ReturnType<typeof vi.fn>
  let revokeObjectURLSpy: ReturnType<typeof vi.fn>
  let adapter: VideoPlayerAdapter

  /** fakevideo に登録されたハンドラを手動発火するヘルパー */
  function fireEvent(eventName: string): void {
    const handler = fakeVideo._listeners.get(eventName)
    if (handler) {
      if (typeof handler === 'function') {
        handler(new Event(eventName))
      } else {
        handler.handleEvent(new Event(eventName))
      }
    }
  }

  afterEach(() => {
    // vi.stubGlobal は自動リストアされないため明示的にリセット。
    // これをしないと前テストの URL stub が次テストの vi.resetModules() 後の import に干渉する。
    vi.unstubAllGlobals()
  })

  beforeEach(async () => {
    vi.resetModules()

    const listeners: EventMap = new Map()
    fakeVideo = {
      src: '',
      currentTime: 0,
      duration: 0,
      playbackRate: 1,
      _listeners: listeners,
      addEventListener: vi.fn((event: string, handler: EventListenerOrEventListenerObject) => {
        listeners.set(event, handler)
      }),
      removeEventListener: vi.fn((event: string) => {
        listeners.delete(event)
      }),
      play: vi.fn(() => Promise.resolve()),
      pause: vi.fn(),
      removeAttribute: vi.fn(() => {
        fakeVideo.src = ''
      }),
      appendChild: vi.fn()
    }

    fakeEl = {
      appendChild: vi.fn()
    }

    createObjectURLSpy = vi.fn(() => 'blob:fake-url')
    revokeObjectURLSpy = vi.fn()

    vi.stubGlobal('document', {
      createElement: vi.fn((_tag: string) => fakeVideo)
    })

    // NOTE: URL.stub はモジュール import の後に行う。
    // vi.resetModules() 後の import 時に Vite module-runner が new URL() を内部で使うため、
    // 先に URL をプレーンオブジェクトで置き換えると "URL is not a constructor" が発生する。
    const { createHtml5Adapter } = await import('~/utils/video-playback/html5-adapter')

    vi.stubGlobal('URL', {
      createObjectURL: createObjectURLSpy,
      revokeObjectURL: revokeObjectURLSpy
    })

    const fakeFile = new File([], 'v.mp4', { type: 'video/mp4' })
    adapter = createHtml5Adapter({ type: 'local', file: fakeFile })
  })

  // ----------------------------------------------------------------
  // ケース1: playing / pause イベントで getStatus が遷移する
  // ----------------------------------------------------------------
  it('playing イベントで getStatus が playing になり、pause イベントで paused になる', async () => {
    const statusChangeCalls: string[] = []
    adapter.on('statuschange' as PlayerEvent, () => {
      statusChangeCalls.push(adapter.getStatus())
    })

    await adapter.mount(fakeEl as unknown as HTMLElement)

    fireEvent('playing')
    expect(adapter.getStatus()).toBe('playing')

    fireEvent('pause')
    expect(adapter.getStatus()).toBe('paused')

    expect(statusChangeCalls).toContain('playing')
    expect(statusChangeCalls).toContain('paused')
  })

  // ----------------------------------------------------------------
  // ケース2: loadedmetadata で getDurationMs が ms を返す
  // ----------------------------------------------------------------
  it('loadedmetadata イベントで getDurationMs が ms 整数を返し durationchange が発火する', async () => {
    let durationChangeCalled = false
    adapter.on('durationchange' as PlayerEvent, () => {
      durationChangeCalled = true
    })

    await adapter.mount(fakeEl as unknown as HTMLElement)

    fakeVideo.duration = 12.34
    fireEvent('loadedmetadata')

    expect(adapter.getDurationMs()).toBe(12340) // Math.round(12.34 * 1000)
    expect(durationChangeCalled).toBe(true)
  })

  // ----------------------------------------------------------------
  // ケース3: 未ロード時 getCurrentTimeMs が null を返す
  // ----------------------------------------------------------------
  it('mount 前は getCurrentTimeMs が null を返す', () => {
    expect(adapter.getCurrentTimeMs()).toBeNull()
  })

  // ----------------------------------------------------------------
  // ケース4: error イベントで local-decode-failed を emit する
  // ----------------------------------------------------------------
  it('error イベントで error ハンドラが呼ばれ code が local-decode-failed になる', async () => {
    let capturedError: { code: string, messageKey: string } | null = null
    let errorHandlerCalled = false

    // アダプタが lastError を保持する想定のため、on('error') 内で getStatus 相当の
    // エラー情報取得手段がない場合のために adapter を拡張した getLastError を呼ぶか、
    // ハンドラ内で state を直接確認する。
    // 本テストでは: error ハンドラが呼ばれること + adapter 内部で生成されたエラーコードを確認する。
    // green 実装は on('error') ハンドラ内でアダプタが lastError を公開するか、
    // または error ハンドラ引数でエラーを渡すかを選択する。
    // ここでは: ハンドラ登録後に capturedError を確認するために
    // adapter に getLastError() を追加する実装を想定（下記で検証）。
    adapter.on('error' as PlayerEvent, () => {
      errorHandlerCalled = true
      // VideoPlayerAdapter は on('error') ハンドラを () => void で定義しているため
      // エラー詳細は adapter 側の状態から取得する必要がある。
      // green 実装では getLastError(): VideoPlayerError | null を追加するか、
      // または on の型を拡張する。ここでは型キャストで検証。
      capturedError = (adapter as unknown as { getLastError(): { code: string, messageKey: string } | null }).getLastError()
    })

    await adapter.mount(fakeEl as unknown as HTMLElement)
    fireEvent('error')

    expect(errorHandlerCalled).toBe(true)
    expect(capturedError).not.toBeNull()
    expect(capturedError!.code).toBe(VIDEO_PLAYER_ERROR_CODE.localDecodeFailed)
    expect(capturedError!.messageKey).toBe('videoPlayer.error.localDecodeFailed')
  })

  // ----------------------------------------------------------------
  // ケース5: destroy で revokeObjectURL が呼ばれる
  // ----------------------------------------------------------------
  it('destroy で URL.revokeObjectURL が呼ばれ src がクリアされる', async () => {
    await adapter.mount(fakeEl as unknown as HTMLElement)
    expect(createObjectURLSpy).toHaveBeenCalledTimes(1)

    adapter.destroy()

    expect(revokeObjectURLSpy).toHaveBeenCalledWith('blob:fake-url')
    expect(revokeObjectURLSpy).toHaveBeenCalledTimes(1)
    // removeAttribute('src') または src='' でクリアされること
    expect(fakeVideo.src).toBe('')
  })

  // ----------------------------------------------------------------
  // ケース6: seekToMs が clampMs 適用後に currentTime をセットする
  // ----------------------------------------------------------------
  it('seekToMs が clamp を適用して currentTime に秒をセットする', async () => {
    await adapter.mount(fakeEl as unknown as HTMLElement)

    // durationMs = 10000 (10秒) をセット
    fakeVideo.duration = 10
    fireEvent('loadedmetadata')
    expect(adapter.getDurationMs()).toBe(10000)

    // 負値 → 0
    adapter.seekToMs(-500)
    expect(fakeVideo.currentTime).toBe(0)

    // 超過 → duration (10秒)
    adapter.seekToMs(99999)
    expect(fakeVideo.currentTime).toBe(10)
  })
})
