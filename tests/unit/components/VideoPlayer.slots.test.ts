// @vitest-environment happy-dom
/**
 * VideoPlayer.client.vue オーバーレイスロット + エラー/再選択 UI 単体テスト
 *
 * 関連タスク: TASK-0009
 * 関連設計: docs/design/video-playback/architecture.md / interfaces.ts（VideoPlayerSlotProps）
 *
 * テスト方針:
 *   - happy-dom + @vue/test-utils。Nuxt UI（U*）は最小スタブ。
 *   - スロットはドメイン非依存（REQ-009/405）。slot props の伝播と上位での位置算出可能性を検証。
 *   - エラー/再選択は分岐の最小集合のみ（feedback_test_coverage）。
 *
 * スタイル: セミコロンなし / no comma dangle（CLAUDE.md ESLint 規約）
 */

import { describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { h, ref } from 'vue'
import type {
  UseVideoPlayerReturn,
  VideoPlayerSlotProps,
  VideoPlayerState
} from '~/types/video-playback'
import { VIDEO_PLAYER_ERROR_CODE } from '~/types/video-playback'

vi.mock('vue-i18n', () => ({
  useI18n: () => ({ t: (key: string) => key })
}))

// eslint-disable-next-line import/first
import VideoPlayer from '~/components/VideoPlayer.client.vue'

function createMockPlayer(overrides: Partial<VideoPlayerState> = {}): UseVideoPlayerReturn {
  const state = ref<VideoPlayerState>({
    status: 'paused',
    durationMs: 60000,
    currentTimeMs: 0,
    rate: 1,
    needsReselect: false,
    error: null,
    ...overrides
  })
  return {
    state: state as UseVideoPlayerReturn['state'],
    controls: {
      play: vi.fn(),
      pause: vi.fn(),
      seekToMs: vi.fn(),
      setPlaybackRate: vi.fn(),
      getCurrentTimeMs: vi.fn(() => null)
    },
    attach: vi.fn(() => Promise.resolve()),
    detach: vi.fn()
  }
}

// UAlert スタブは actions 名前付きスロットも描画する
const stubs = {
  UButton: { inheritAttrs: false, template: '<button v-bind="$attrs"><slot /></button>' },
  USelect: { inheritAttrs: false, props: ['modelValue', 'items'], template: '<select v-bind="$attrs"><slot /></select>' },
  USkeleton: { inheritAttrs: false, template: '<div v-bind="$attrs"></div>' },
  UAlert: { inheritAttrs: false, template: '<div v-bind="$attrs"><slot /><slot name="actions" /></div>' },
  UIcon: true
}

describe('VideoPlayer.client.vue（スロット / エラー / 再選択）', () => {
  // ケース1+2: timeline / overlay スロットへ slot props が渡り、上位が left = ms/durationMs を算出できる
  it('timeline / overlay スロットへ {durationMs, currentTimeMs, status} が渡り left 算出が可能', async () => {
    const player = createMockPlayer({ durationMs: 60000, currentTimeMs: 30000, status: 'playing' })

    const renderSlot = (testid: string) => (sp: VideoPlayerSlotProps) =>
      h('div', {
        'data-testid': testid,
        'data-left': sp.durationMs ? `${(sp.currentTimeMs / sp.durationMs) * 100}%` : '',
        'data-status': sp.status
      })

    const wrapper = mount(VideoPlayer, {
      props: { player },
      slots: {
        timeline: renderSlot('tl'),
        overlay: renderSlot('ov')
      },
      global: { stubs }
    })
    await flushPromises()

    const tl = wrapper.find('[data-testid="tl"]')
    const ov = wrapper.find('[data-testid="ov"]')
    expect(tl.exists()).toBe(true)
    expect(ov.exists()).toBe(true)
    // 上位が slot props から left = ms/durationMs を算出できる（video-playback 側は算出しない）
    expect(tl.attributes('data-left')).toBe('50%')
    expect(tl.attributes('data-status')).toBe('playing')
    expect(ov.attributes('data-left')).toBe('50%')
  })

  // ケース3: state.error 時 banner + 文言キー / youtube-load-failed で別動画導線 → requestNewSource emit
  it('state.error で banner を表示し、youtube-load-failed では別動画導線 click で requestNewSource を emit', async () => {
    const player = createMockPlayer({
      error: {
        code: VIDEO_PLAYER_ERROR_CODE.youtubeLoadFailed,
        messageKey: 'videoPlayer.error.youtubeLoadFailed'
      }
    })
    const wrapper = mount(VideoPlayer, { props: { player }, global: { stubs } })
    await flushPromises()

    const banner = wrapper.find('[data-testid="vp-error"]')
    expect(banner.exists()).toBe(true)
    // 文言は messageKey で解決（フェイク t はキーをそのまま返す）
    expect(banner.attributes('title')).toBe('videoPlayer.error.youtubeLoadFailed')

    const newSource = wrapper.find('[data-testid="vp-new-source"]')
    expect(newSource.exists()).toBe(true)
    await newSource.trigger('click')
    expect(wrapper.emitted('requestNewSource')).toHaveLength(1)
  })

  // ケース3-2: youtube-load-failed 以外では別動画導線を出さない（分岐）
  it('youtube-invalid-url では別動画導線を出さない', async () => {
    const player = createMockPlayer({
      error: {
        code: VIDEO_PLAYER_ERROR_CODE.youtubeInvalidUrl,
        messageKey: 'videoPlayer.error.youtubeInvalidUrl'
      }
    })
    const wrapper = mount(VideoPlayer, { props: { player }, global: { stubs } })
    await flushPromises()

    expect(wrapper.find('[data-testid="vp-error"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="vp-new-source"]').exists()).toBe(false)
  })

  // ケース4: needsReselect 時に再選択 UI 表示 / file 選択で reselectFile emit（自動再アクセスなし）
  it('needsReselect で再選択 UI を表示し、file 選択で reselectFile を emit する', async () => {
    const player = createMockPlayer({ needsReselect: true })
    const wrapper = mount(VideoPlayer, { props: { player }, global: { stubs } })
    await flushPromises()

    expect(wrapper.find('[data-testid="vp-reselect"]').exists()).toBe(true)

    // mount 時点では自動再アクセスしない = まだ emit されていない（NFR-101）
    expect(wrapper.emitted('reselectFile')).toBeUndefined()

    const input = wrapper.find('[data-testid="vp-reselect-input"]')
    const file = new File(['x'], 'match.mp4', { type: 'video/mp4' })
    Object.defineProperty(input.element, 'files', { value: [file], configurable: true })
    await input.trigger('change')

    const emitted = wrapper.emitted('reselectFile')
    expect(emitted).toHaveLength(1)
    expect((emitted![0][0] as File).name).toBe('match.mp4')
  })
})
