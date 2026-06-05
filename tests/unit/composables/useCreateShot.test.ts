/**
 * useCreateShot 単体テスト
 * mock: from('shots') → insert → select → single
 * REQ-005
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

const { insertMock, singleMock } = vi.hoisted(() => {
  const singleMock = vi.fn()
  const selectAfterInsert = vi.fn(() => ({ single: singleMock }))
  const insertMock = vi.fn(() => ({ select: selectAfterInsert }))
  return { insertMock, singleMock }
})

vi.mock('#imports', async (importOriginal) => {
  const vue = await importOriginal<typeof import('vue')>()
  return { ref: vue.ref, useSupabaseClient: () => ({ from: () => ({ insert: insertMock }) }) }
})
vi.mock('#supabase-client', () => ({ useSupabaseClient: () => ({ from: () => ({ insert: insertMock }) }) }))

// eslint-disable-next-line import/first
import { useCreateShot } from '~/composables/useCreateShot'

describe('useCreateShot', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    singleMock.mockResolvedValue({ data: { id: 'sh1' }, error: null })
  })

  it('TC1: rally_id/shot_number/ms + input_source=manual で insert', async () => {
    const { createShot } = useCreateShot()
    const r = await createShot({ rallyId: 'r1', shotNumber: 2, videoTimestampMs: 9999 })
    expect(insertMock).toHaveBeenCalledWith({
      rally_id: 'r1', shot_number: 2, video_timestamp_ms: 9999, input_source: 'manual'
    })
    expect(r).toEqual({ data: 'sh1', error: null })
  })

  it('TC2: error は ActionResult.error に詰める', async () => {
    singleMock.mockResolvedValue({ data: null, error: new Error('rls') })
    const { createShot } = useCreateShot()
    const r = await createShot({ rallyId: 'r1', shotNumber: 1, videoTimestampMs: 0 })
    expect(r.data).toBeNull()
    expect(r.error).toBeInstanceOf(Error)
  })
})
