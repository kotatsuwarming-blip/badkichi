/**
 * useAnnotationSave 単体テスト (TASK-0005)
 * mock: from('shots'/'rallies') → update → eq
 * 検証: camel→snake 写像 / annotation_source 併記 / 直列順序 / エラー時もキュー継続
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

const { updateMock, eqMock, fromMock } = vi.hoisted(() => {
  const eqMock = vi.fn()
  const updateMock = vi.fn(() => ({ eq: eqMock }))
  const fromMock = vi.fn(() => ({ update: updateMock }))
  return { updateMock, eqMock, fromMock }
})

vi.mock('#imports', async (importOriginal) => {
  const vue = await importOriginal<typeof import('vue')>()
  return { ref: vue.ref, useSupabaseClient: () => ({ from: fromMock }) }
})
vi.mock('#supabase-client', () => ({ useSupabaseClient: () => ({ from: fromMock }) }))

// eslint-disable-next-line import/first
import { useAnnotationSave } from '~/composables/useAnnotationSave'

describe('useAnnotationSave', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    eqMock.mockResolvedValue({ error: null })
  })

  it('shots: camel→snake 写像 + annotation_source=human を併記 (REQ-301)', async () => {
    const { saveShotPatch } = useAnnotationSave()
    const r = await saveShotPatch('sh1', { shotType: 'smash', hitX: 0.3, hitY: 0.1 })
    expect(fromMock).toHaveBeenCalledWith('shots')
    expect(updateMock).toHaveBeenCalledWith({
      shot_type: 'smash',
      hit_x: 0.3,
      hit_y: 0.1,
      annotation_source: 'human'
    })
    expect(eqMock).toHaveBeenCalledWith('id', 'sh1')
    expect(r).toEqual({ data: true, error: null })
  })

  it('undefined のフィールドは書かない・null は明示的に書く (undo の旧値 null)', async () => {
    const { saveShotPatch } = useAnnotationSave()
    await saveShotPatch('sh1', { shotType: null, hand: null })
    expect(updateMock).toHaveBeenCalledWith({
      shot_type: null,
      hand: null,
      annotation_source: 'human'
    })
  })

  it('rallies: end_reason / land / out_direction の写像 (annotation_source なし)', async () => {
    const { saveRallyPatch } = useAnnotationSave()
    await saveRallyPatch('r1', { endReason: 'out', landX: 1.1, landY: 0.5, outDirection: null })
    expect(fromMock).toHaveBeenCalledWith('rallies')
    expect(updateMock).toHaveBeenCalledWith({
      end_reason: 'out',
      land_x: 1.1,
      land_y: 0.5,
      out_direction: null
    })
  })

  it('空パッチは no-op で成功を返す', async () => {
    const { saveShotPatch } = useAnnotationSave()
    const r = await saveShotPatch('sh1', {})
    expect(updateMock).not.toHaveBeenCalled()
    expect(r).toEqual({ data: true, error: null })
  })

  it('直列キュー: 先行 UPDATE の解決を待ってから次を送出する (last-write-wins の順序保証)', async () => {
    let resolveFirst!: (v: { error: null }) => void
    eqMock
      .mockImplementationOnce(() => new Promise((resolve) => {
        resolveFirst = resolve
      }))
      .mockResolvedValueOnce({ error: null })

    const { saveShotPatch, pending } = useAnnotationSave()
    const p1 = saveShotPatch('sh1', { shotType: 'clear' })
    const p2 = saveShotPatch('sh1', { shotType: 'smash' })

    // 1件目が未解決の間、2件目の update はまだ呼ばれない
    await Promise.resolve()
    expect(updateMock).toHaveBeenCalledTimes(1)
    expect(pending.value).toBe(true)

    resolveFirst({ error: null })
    await Promise.all([p1, p2])
    expect(updateMock).toHaveBeenCalledTimes(2)
    expect(updateMock).toHaveBeenNthCalledWith(2, expect.objectContaining({ shot_type: 'smash' }))
    expect(pending.value).toBe(false)
  })

  it('エラーは ActionResult と lastError に載せ、キューは継続する (EDGE-007)', async () => {
    eqMock
      .mockResolvedValueOnce({ error: new Error('rls') })
      .mockResolvedValueOnce({ error: null })

    const save = useAnnotationSave()
    const r1 = await save.saveShotPatch('sh1', { shotType: 'clear' })
    expect(r1.data).toBeNull()
    expect(r1.error).toBeInstanceOf(Error)
    expect(save.lastError.value).toBeInstanceOf(Error)

    const r2 = await save.saveShotPatch('sh1', { shotType: 'smash' })
    expect(r2).toEqual({ data: true, error: null })
  })
})
