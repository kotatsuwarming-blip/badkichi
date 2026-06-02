// @vitest-environment happy-dom
/**
 * video-playback 統合テスト（composable + アダプタ + コンポーネント結合）
 *
 * 関連タスク: TASK-0011（Phase 4 統合・責務境界レビュー）
 * 関連設計: docs/design/video-playback/dataflow.md フロー1-5 / acceptance-criteria.md TC-*
 *
 * テスト範囲（タスク指示）:
 *   - 外部 API（YouTube IFrame API / HTMLVideoElement）のみモックし、
 *     useVideoPlayer composable・YouTube/Html5 アダプタ・VideoPlayer.client.vue を結合検証する。
 *   - 純関数 / アダプタ単体は Phase 1-3 で担保済みのため重複させず、結合経路のみを確認する
 *     （feedback_test_coverage: 境界 + 分岐の最小集合）。
 *
 * カバーフロー:
 *   フロー1: YouTube ロード〜再生（attach → onReady → 状態反映 → play）
 *   フロー2: ローカルロード + 再選択（loadedmetadata → durationMs / needsReselect）
 *   フロー3: getCurrentTimeMs 同期即時 / 未ロード null
 *   フロー4: seekToMs クランプ境界（0 / duration / 超過 / 負値）
 *   フロー5: VideoPlayer.client.vue へ slot props 伝播 + コントロール描画
 *
 * スタイル: セミコロンなし / no comma dangle（CLAUDE.md ESLint 規約）
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { h, nextTick } from 'vue'
import type { VideoPlayerSlotProps } from '~/types/video-playback'
import { VIDEO_PLAYER_ERROR_CODE } from '~/types/video-playback'

// YouTube API ローダー / URL 抽出は外部副作用なので結合テストではスタブ（YT グローバルはモック済み前提）
vi.mock('~/utils/video-playback/youtube-api-loader', () => ({
  ensureApiLoaded: vi.fn(() => Promise.resolve())
}))
vi.mock('~/utils/video-playback/extract-youtube-id', () => ({
  extractYouTubeId: vi.fn(() => 'dQw4w9WgXcQ')
}))
vi.mock('vue-i18n', () => ({
  useI18n: () => ({ t: (key: string) => key })
}))

// eslint-disable-next-line import/first
import { useVideoPlayer } from '~/composables/useVideoPlayer'
// eslint-disable-next-line import/first
import VideoPlayer from '~/components/VideoPlayer.client.vue'

// -------------------------------------------------------------------
// フェイク YT.Player（onReady/onStateChange/onError を手動発火）
// -------------------------------------------------------------------

interface FakeYtPlayer {
  _events: {
    onReady?: () => void
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

function stubYouTube(): FakeYtPlayer {
  const instance: FakeYtPlayer = {
    _events: {},
    playVideo: vi.fn(),
    pauseVideo: vi.fn(),
    seekTo: vi.fn(),
    setPlaybackRate: vi.fn(),
    getCurrentTime: vi.fn(() => 0),
    getDuration: vi.fn(() => 60), // 秒
    getPlayerState: vi.fn(() => -1),
    destroy: vi.fn()
  }
  const FakePlayer = vi.fn(function (this: unknown, _el: unknown, config: { events: FakeYtPlayer['_events'] }) {
    instance._events = config.events
    return instance
  })
  vi.stubGlobal('YT', {
    Player: FakePlayer,
    PlayerState: { UNSTARTED: -1, ENDED: 0, PLAYING: 1, PAUSED: 2, BUFFERING: 3, CUED: 5 }
  })
  return instance
}

// -------------------------------------------------------------------
// フェイク <video>: 実 happy-dom 要素を使い duration / play / pause だけ差し替える
// （実 DOM への appendChild で Node 以外を渡すと happy-dom が例外を投げるため）
// -------------------------------------------------------------------

interface StubVideo {
  video: HTMLVideoElement
  play: ReturnType<typeof vi.fn>
  pause: ReturnType<typeof vi.fn>
}

function stubVideoElement(duration: number): StubVideo {
  const realCreate = document.createElement.bind(document)
  const video = realCreate('video') as HTMLVideoElement
  Object.defineProperty(video, 'duration', { value: duration, configurable: true })
  const play = vi.fn(() => Promise.resolve())
  const pause = vi.fn()
  video.play = play as unknown as HTMLVideoElement['play']
  video.pause = pause as unknown as HTMLVideoElement['pause']
  vi.spyOn(document, 'createElement').mockImplementation(
    (tag: string) => (tag === 'video' ? video : realCreate(tag))
  )
  vi.stubGlobal('URL', { createObjectURL: vi.fn(() => 'blob:fake'), revokeObjectURL: vi.fn() })
  return { video, play, pause }
}

function fireVideo(stub: StubVideo, event: string): void {
  stub.video.dispatchEvent(new Event(event))
}

const fakeEl = { appendChild: vi.fn() } as unknown as HTMLElement

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

// ===================================================================
// 統合TC-1 / TC-4 / TC-6（youtube）: ロード〜再生・シーククランプ・異常系
// ===================================================================

describe('統合: YouTube フロー', () => {
  let yt: FakeYtPlayer

  beforeEach(() => {
    yt = stubYouTube()
  })

  it('attach → onReady で durationMs 反映、play が playVideo を呼ぶ（フロー1）', async () => {
    const player = useVideoPlayer({ type: 'youtube', url: 'https://youtu.be/dQw4w9WgXcQ' })
    const attachP = player.attach(fakeEl)
    await Promise.resolve()
    await Promise.resolve()
    yt._events.onReady?.() // durationMs 反映（status は onStateChange 経由で反映）
    await attachP

    expect(player.state.value.durationMs).toBe(60000)

    // 状態反映は onStateChange 経由（adapter は ready で statuschange を emit しない）
    yt._events.onStateChange?.({ data: 2 }) // PAUSED
    expect(player.state.value.status).toBe('paused')

    player.controls.play()
    expect(yt.playVideo).toHaveBeenCalledTimes(1)
  })

  it('seekToMs はクランプ後の秒で seekTo を呼ぶ（0 / duration / 超過 / 負値）（フロー4）', async () => {
    const player = useVideoPlayer({ type: 'youtube', url: 'https://youtu.be/dQw4w9WgXcQ' })
    const attachP = player.attach(fakeEl)
    await Promise.resolve()
    await Promise.resolve()
    yt._events.onReady?.() // durationMs = 60000
    await attachP

    player.controls.seekToMs(30000)
    player.controls.seekToMs(0)
    player.controls.seekToMs(60000)
    player.controls.seekToMs(99999999)
    player.controls.seekToMs(-1000)

    const seconds = yt.seekTo.mock.calls.map(c => c[0])
    expect(seconds).toEqual([30, 0, 60, 60, 0])
  })

  it('onError(150) で state.error が youtube-load-failed になる（フロー6 / EDGE-001）', async () => {
    const player = useVideoPlayer({ type: 'youtube', url: 'https://youtu.be/dQw4w9WgXcQ' })
    const attachP = player.attach(fakeEl)
    await Promise.resolve()
    await Promise.resolve()
    yt._events.onReady?.()
    await attachP

    yt._events.onError?.({ data: 150 })
    expect(player.state.value.error?.code).toBe(VIDEO_PLAYER_ERROR_CODE.youtubeLoadFailed)
  })

  it('未ロード時 getCurrentTimeMs は null、ロード後は ms 整数を同期で返す（フロー3）', async () => {
    const player = useVideoPlayer({ type: 'youtube', url: 'https://youtu.be/dQw4w9WgXcQ' })
    expect(player.controls.getCurrentTimeMs()).toBeNull()

    const attachP = player.attach(fakeEl)
    await Promise.resolve()
    await Promise.resolve()
    yt._events.onReady?.()
    await attachP

    yt.getCurrentTime.mockReturnValue(5.4)
    expect(player.controls.getCurrentTimeMs()).toBe(5400)
  })
})

// ===================================================================
// 統合TC-2 / TC-6（local）: ロード・再選択・デコード失敗
// ===================================================================

describe('統合: ローカルフロー', () => {
  it('loadedmetadata で durationMs 反映、play が video.play を呼ぶ（フロー2）', async () => {
    const fakeVideo = stubVideoElement(120)
    const file = new File(['x'], 'm.mp4', { type: 'video/mp4' })
    const player = useVideoPlayer({ type: 'local', file })
    await player.attach(fakeEl)

    fireVideo(fakeVideo, 'loadedmetadata')
    expect(player.state.value.durationMs).toBe(120000)

    player.controls.play()
    expect(fakeVideo.play).toHaveBeenCalledTimes(1)
  })

  it('file 無しの local では needsReselect=true、mount しない（フロー2 再選択）', async () => {
    stubVideoElement(0)
    const player = useVideoPlayer({ type: 'local', file: undefined } as unknown as Parameters<typeof useVideoPlayer>[0])
    await player.attach(fakeEl)
    expect(player.state.value.needsReselect).toBe(true)
  })

  it('video error で state.error が local-decode-failed になる（フロー6 / EDGE-003）', async () => {
    const fakeVideo = stubVideoElement(60)
    const file = new File(['x'], 'm.mp4', { type: 'video/mp4' })
    const player = useVideoPlayer({ type: 'local', file })
    await player.attach(fakeEl)

    fireVideo(fakeVideo, 'error')
    expect(player.state.value.error?.code).toBe(VIDEO_PLAYER_ERROR_CODE.localDecodeFailed)
  })
})

// ===================================================================
// 統合TC-5（フロー5）: composable → component の slot props 伝播 + コントロール描画
// ===================================================================

describe('統合: コンポーネント結合（slot props 伝播）', () => {
  const stubs = {
    UButton: { inheritAttrs: false, template: '<button v-bind="$attrs"><slot /></button>' },
    USelect: { inheritAttrs: false, props: ['modelValue', 'items'], template: '<select v-bind="$attrs"><slot /></select>' },
    USkeleton: { inheritAttrs: false, template: '<div v-bind="$attrs"></div>' },
    UAlert: { inheritAttrs: false, template: '<div v-bind="$attrs"><slot /><slot name="actions" /></div>' },
    UIcon: true
  }

  it('loadedmetadata 後の durationMs が timeline/overlay スロット props に伝播し、コントロールが描画される', async () => {
    const fakeVideo = stubVideoElement(60)
    const file = new File(['x'], 'm.mp4', { type: 'video/mp4' })
    const player = useVideoPlayer({ type: 'local', file })

    const renderSlot = (testid: string) => (sp: VideoPlayerSlotProps) =>
      h('div', { 'data-testid': testid, 'data-duration': sp.durationMs ?? '' })

    const wrapper = mount(VideoPlayer, {
      props: { player },
      slots: { timeline: renderSlot('tl'), overlay: renderSlot('ov') },
      global: { stubs }
    })
    await flushPromises() // onMounted → attach → createHtml5Adapter.mount

    fireVideo(fakeVideo, 'loadedmetadata')
    await nextTick()

    expect(wrapper.find('[data-testid="tl"]').attributes('data-duration')).toBe('60000')
    expect(wrapper.find('[data-testid="ov"]').attributes('data-duration')).toBe('60000')

    // コントロール描画（TC-008-01）
    expect(wrapper.find('[data-testid="vp-toggle"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="vp-seek"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="vp-time"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="vp-rate"]').exists()).toBe(true)
  })
})
