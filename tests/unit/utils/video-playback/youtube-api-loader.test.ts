import { beforeEach, describe, expect, it, vi } from 'vitest'

const IFRAME_API_SRC = 'https://www.youtube.com/iframe_api'

describe('ensureApiLoaded', () => {
  // モック document: appendChild をスパイし、querySelector で script 要素の有無を管理
  let appendChildSpy: ReturnType<typeof vi.fn>
  let mockScript: { src: string }
  let querySelectorResult: { src: string } | null

  beforeEach(async () => {
    // モジュールスコープのキャッシュをリセット
    vi.resetModules()

    mockScript = { src: '' }
    appendChildSpy = vi.fn()
    querySelectorResult = null

    const mockCreateElement = vi.fn((_tag: string) => mockScript)
    const mockQuerySelector = vi.fn((_sel: string) => querySelectorResult)

    vi.stubGlobal('document', {
      createElement: mockCreateElement,
      querySelector: mockQuerySelector,
      head: {
        appendChild: appendChildSpy
      }
    })

    vi.stubGlobal('window', {
      YT: undefined,
      onYouTubeIframeAPIReady: undefined
    })
  })

  it('初回呼び出しで iframe_api の script を1回注入し、onYouTubeIframeAPIReady 発火で YT を返す', async () => {
    const { ensureApiLoaded } = await import('~/utils/video-playback/youtube-api-loader')

    const mockYT = { Player: vi.fn() }
    const promise = ensureApiLoaded()

    // script が document.head に1回 append されている
    expect(appendChildSpy).toHaveBeenCalledTimes(1)
    expect(mockScript.src).toBe(IFRAME_API_SRC)

    // onYouTubeIframeAPIReady を手動発火して Promise を resolve させる
    window.YT = mockYT as unknown as typeof YT
    window.onYouTubeIframeAPIReady?.()

    const result = await promise
    expect(result).toBe(mockYT)
  })

  it('2回目の呼び出しで script は再注入されず、1回目と同一の Promise インスタンスを返す', async () => {
    const { ensureApiLoaded } = await import('~/utils/video-playback/youtube-api-loader')

    const mockYT = { Player: vi.fn() }
    const promise1 = ensureApiLoaded()

    window.YT = mockYT as unknown as typeof YT
    window.onYouTubeIframeAPIReady?.()
    await promise1

    // 2回目呼び出し前: querySelector が既存 script を返すよう設定（二重注入防止の確認）
    // ただし loadPromise キャッシュが先に効くので script への到達自体しない
    const promise2 = ensureApiLoaded()

    // appendChild は最初の1回のみ（再注入なし）
    expect(appendChildSpy).toHaveBeenCalledTimes(1)
    // 同一 Promise インスタンス
    expect(promise2).toBe(promise1)
  })
})
