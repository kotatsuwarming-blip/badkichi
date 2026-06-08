/**
 * useCreateRally 単体テスト
 * mock: from('rallies') → insert → select → single
 * REQ-007 / REQ-410
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
import { useCreateRally } from '~/composables/useCreateRally'

const input = {
  setId: 's1',
  rallyNumber: 1,
  denorm: { servingTeam: 'A' as const, serverPosition: 'right' as const, serverPlayerId: 'A2', receiverPlayerId: 'B1', cameraNearTeam: 'A' as const },
  videoStartTimestampMs: 12345
}

describe('useCreateRally', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    singleMock.mockResolvedValue({ data: { id: 'r1' }, error: null })
  })

  it('TC1: denorm 列 + rally_number + ms を insert し rally id を返す', async () => {
    const { createRally } = useCreateRally()
    const r = await createRally(input)
    expect(insertMock).toHaveBeenCalledWith({
      set_id: 's1', rally_number: 1, serving_team: 'A', server_position: 'right',
      server_player_id: 'A2', receiver_player_id: 'B1', camera_near_team: 'A',
      video_start_timestamp_ms: 12345
    })
    expect(r).toEqual({ data: 'r1', error: null })
  })

  it('TC2: video_start_timestamp_ms=null (動画アラインメントなし) を許容', async () => {
    const { createRally } = useCreateRally()
    await createRally({ ...input, videoStartTimestampMs: null })
    expect(insertMock).toHaveBeenCalledWith(expect.objectContaining({ video_start_timestamp_ms: null }))
  })
})
