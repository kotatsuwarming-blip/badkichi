/**
 * useMatchForRecording 単体テスト
 *
 * mock 戦略: useMatches.test.ts 確立パターン (vi.hoisted + #imports/#supabase-client/#async-data mock)。
 * クエリチェーン: from('matches') → select → eq(id) → is(deleted_at) → single
 * REQ-001 / REQ-004
 */

import { beforeEach, describe, expect, it, vi } from 'vitest'

const {
  fromMock,
  eqMock,
  isMock,
  singleMock,
  useAsyncDataMock
} = vi.hoisted(() => {
  const singleMock = vi.fn()
  const isMock = vi.fn(() => ({ single: singleMock }))
  const eqMock = vi.fn(() => ({ is: isMock }))
  const selectMock = vi.fn(() => ({ eq: eqMock }))
  const fromMock = vi.fn(() => ({ select: selectMock }))

  const useAsyncDataMock = vi.fn(async (_key: string, handler: () => Promise<unknown>) => {
    const { ref } = await import('vue')
    const errorRef = ref<Error | null>(null)
    let data: unknown = null
    try {
      data = await handler()
    } catch (e) {
      errorRef.value = e as Error
    }
    return { data: ref(data), pending: ref(false), error: errorRef, refresh: vi.fn() }
  })

  return { fromMock, eqMock, isMock, singleMock, useAsyncDataMock }
})

vi.mock('#imports', async (importOriginal) => {
  const vue = await importOriginal<typeof import('vue')>()
  return {
    ref: vue.ref,
    useSupabaseClient: () => ({ from: fromMock }),
    useAsyncData: useAsyncDataMock
  }
})

vi.mock('#supabase-client', () => ({
  useSupabaseClient: () => ({ from: fromMock })
}))

vi.mock('#async-data', () => ({
  useAsyncData: useAsyncDataMock
}))

// eslint-disable-next-line import/first
import { useMatchForRecording } from '~/composables/useMatchForRecording'

const rowFixture = {
  id: 'm1',
  name: 'XX練習会',
  video_source_type: 'youtube',
  video_source_url: 'https://youtu.be/abc',
  completed_at: null,
  ta1: { id: 'p1', name: '佐藤' },
  ta2: { id: 'p2', name: '鈴木' },
  tb1: { id: 'p3', name: '高橋' },
  tb2: { id: 'p4', name: '田中' }
}

describe('useMatchForRecording', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    singleMock.mockResolvedValue({ data: rowFixture, error: null })
  })

  it('TC1: match を VideoSource材料 + 4選手ロスターへ射影する', async () => {
    const { data } = await useMatchForRecording('m1')
    expect(fromMock).toHaveBeenCalledWith('matches')
    expect(eqMock).toHaveBeenCalledWith('id', 'm1')
    expect(isMock).toHaveBeenCalledWith('deleted_at', null)
    expect(data.value?.videoSourceType).toBe('youtube')
    expect(data.value?.videoSourceUrl).toBe('https://youtu.be/abc')
    expect(data.value?.roster).toEqual([
      { playerId: 'p1', name: '佐藤', team: 'A' },
      { playerId: 'p2', name: '鈴木', team: 'A' },
      { playerId: 'p3', name: '高橋', team: 'B' },
      { playerId: 'p4', name: '田中', team: 'B' }
    ])
  })

  it('TC2: 取得エラーは error に伝播する', async () => {
    singleMock.mockResolvedValue({ data: null, error: new Error('rls') })
    const { data, error } = await useMatchForRecording('m1')
    expect(data.value).toBeNull()
    expect(error.value).toBeInstanceOf(Error)
  })
})
