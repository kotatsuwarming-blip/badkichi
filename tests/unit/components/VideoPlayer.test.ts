// @vitest-environment happy-dom
/**
 * VideoPlayer.client.vue 標準コントロール UI 単体テスト
 *
 * 関連タスク: TASK-0008
 * 関連設計: docs/design/video-playback/architecture.md / interfaces.ts
 *
 * テスト方針:
 *   - happy-dom 環境 + @vue/test-utils。Nuxt UI（U*）は最小スタブに差し替え。
 *   - player は useVideoPlayer のモック（state ref + controls スパイ + attach/detach スパイ）。
 *   - 分岐の最小集合のみ（feedback_test_coverage）。冗長ケースは作らない。
 *
 * スタイル: セミコロンなし / no comma dangle（CLAUDE.md ESLint 規約）
 */

import { describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { ref } from 'vue'
import type { UseVideoPlayerReturn, VideoPlayerState } from '~/types/video-playback'

// useI18n は vue-i18n から直接 import するため、キーをそのまま返すフェイクに差し替える
vi.mock('vue-i18n', () => ({
  useI18n: () => ({ t: (key: string) => key })
}))

// eslint-disable-next-line import/first
import VideoPlayer from '~/components/VideoPlayer.client.vue'

// -------------------------------------------------------------------
// モック player ファクトリ
// -------------------------------------------------------------------

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
  const controls = {
    play: vi.fn(),
    pause: vi.fn(),
    seekToMs: vi.fn(),
    setPlaybackRate: vi.fn(),
    getCurrentTimeMs: vi.fn(() => null)
  }
  return {
    state: state as UseVideoPlayerReturn['state'],
    controls,
    attach: vi.fn(() => Promise.resolve()),
    detach: vi.fn()
  }
}

// Nuxt UI コンポーネントの最小スタブ（イベント/属性が素の DOM に届くようにする）
const stubs = {
  UButton: { inheritAttrs: false, template: '<button v-bind="$attrs"><slot /></button>' },
  USelect: { inheritAttrs: false, props: ['modelValue', 'items'], template: '<select v-bind="$attrs"><slot /></select>' },
  USkeleton: { inheritAttrs: false, template: '<div v-bind="$attrs"></div>' },
  UIcon: true
}

function mountPlayer(player: UseVideoPlayerReturn) {
  return mount(VideoPlayer, {
    props: { player },
    global: { stubs }
  })
}

describe('VideoPlayer.client.vue', () => {
  // ケース1: コントロール要素の描画（REQ-008）
  it('再生トグル・シークバー・時刻表示・速度選択が描画される', async () => {
    const player = createMockPlayer({ status: 'paused', durationMs: 60000 })
    const wrapper = mountPlayer(player)
    await flushPromises()

    expect(wrapper.find('[data-testid="vp-toggle"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="vp-seek"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="vp-time"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="vp-rate"]').exists()).toBe(true)
  })

  // ケース2: 再生トグルで controls.play / playing 時は controls.pause（REQ-008）
  it('トグルは paused で controls.play、playing で controls.pause を呼ぶ', async () => {
    const paused = createMockPlayer({ status: 'paused' })
    const w1 = mountPlayer(paused)
    await flushPromises()
    await w1.find('[data-testid="vp-toggle"]').trigger('click')
    expect(paused.controls.play).toHaveBeenCalledTimes(1)
    expect(paused.controls.pause).not.toHaveBeenCalled()

    const playing = createMockPlayer({ status: 'playing' })
    const w2 = mountPlayer(playing)
    await flushPromises()
    await w2.find('[data-testid="vp-toggle"]').trigger('click')
    expect(playing.controls.pause).toHaveBeenCalledTimes(1)
    expect(playing.controls.play).not.toHaveBeenCalled()
  })

  // ケース3: シークバー 50% → seekToMs(30000) / durationMs null では呼ばれない（REQ-202）
  it('シークバー 50% 操作で seekToMs(30000) が呼ばれ、durationMs が null では呼ばれない', async () => {
    const player = createMockPlayer({ durationMs: 60000 })
    const wrapper = mountPlayer(player)
    await flushPromises()
    await wrapper.find('[data-testid="vp-seek"]').setValue('0.5')
    expect(player.controls.seekToMs).toHaveBeenCalledWith(30000)

    const noDuration = createMockPlayer({ durationMs: null })
    const w2 = mountPlayer(noDuration)
    await flushPromises()
    await w2.find('[data-testid="vp-seek"]').setValue('0.5')
    expect(noDuration.controls.seekToMs).not.toHaveBeenCalled()
  })

  // ケース4: buffering 中はローディング提示 + コントロール操作可能（NFR-202 / EDGE-004）
  it('buffering 中はローディングを表示し、コントロールは disabled にならない', async () => {
    const player = createMockPlayer({ status: 'buffering', durationMs: 60000 })
    const wrapper = mountPlayer(player)
    await flushPromises()

    expect(wrapper.find('[data-testid="vp-loading"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="vp-toggle"]').attributes('disabled')).toBeUndefined()
  })

  // ケース5: mount で attach(el)・unmount で detach
  it('mount 時に attach(el) が、unmount 時に detach が呼ばれる', async () => {
    const player = createMockPlayer()
    const wrapper = mountPlayer(player)
    await flushPromises()

    expect(player.attach).toHaveBeenCalledTimes(1)
    expect(player.attach.mock.calls[0][0]).toBeInstanceOf(HTMLElement)

    wrapper.unmount()
    expect(player.detach).toHaveBeenCalledTimes(1)
  })
})
