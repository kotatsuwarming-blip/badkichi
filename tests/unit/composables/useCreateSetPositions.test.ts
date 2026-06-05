/**
 * useCreateSetPositions 単体テスト
 * mock: from('set_player_positions') → insert (resolves {error})
 * REQ-003 / EDGE-002
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

const { insertMock } = vi.hoisted(() => ({ insertMock: vi.fn() }))

vi.mock('#imports', async (importOriginal) => {
  const vue = await importOriginal<typeof import('vue')>()
  return { ref: vue.ref, useSupabaseClient: () => ({ from: () => ({ insert: insertMock }) }) }
})
vi.mock('#supabase-client', () => ({ useSupabaseClient: () => ({ from: () => ({ insert: insertMock }) }) }))

// eslint-disable-next-line import/first
import { useCreateSetPositions } from '~/composables/useCreateSetPositions'

const positions = [
  { playerId: 'A1', team: 'A' as const, position: 'left' as const },
  { playerId: 'A2', team: 'A' as const, position: 'right' as const },
  { playerId: 'B1', team: 'B' as const, position: 'left' as const },
  { playerId: 'B2', team: 'B' as const, position: 'right' as const }
]

describe('useCreateSetPositions', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    insertMock.mockResolvedValue({ error: null })
  })

  it('TC1: 4 行を set_id + snake_case で insert する', async () => {
    const { createSetPositions } = useCreateSetPositions()
    const r = await createSetPositions({ setId: 's1', positions })
    expect(insertMock).toHaveBeenCalledWith([
      { set_id: 's1', player_id: 'A1', team: 'A', position: 'left' },
      { set_id: 's1', player_id: 'A2', team: 'A', position: 'right' },
      { set_id: 's1', player_id: 'B1', team: 'B', position: 'left' },
      { set_id: 's1', player_id: 'B2', team: 'B', position: 'right' }
    ])
    expect(r).toEqual({ data: true, error: null })
  })

  it('TC2: UNIQUE 違反 (重複スロット) は error を返す (EDGE-002)', async () => {
    insertMock.mockResolvedValue({ error: { code: '23505', message: 'duplicate' } })
    const { createSetPositions } = useCreateSetPositions()
    const r = await createSetPositions({ setId: 's1', positions })
    expect(r.data).toBeNull()
    expect(r.error).toBeTruthy()
  })
})
