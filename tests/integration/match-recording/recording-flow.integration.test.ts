/**
 * TASK-0019: 録画フロー 結合スモーク (DB 書き込みパス)
 *
 * テスト対象: 録画 composable が行う DB 操作を実 PostgreSQL (dev) に対して検証する。
 *   - rallies の denormalize 列 (serving_team/server_position/server_player_id/receiver_player_id) の round-trip (REQ-410)
 *   - shots の挿入 + 得点 update (point_winner / is_point_confirmed)
 *   - undo の物理削除 (shots → 空 rally) が成功すること (REQ-110a)
 * 実行: pnpm test:integration (CI 専用、vitest.integration.config.ts、fileParallelism: false)
 *
 * 注: composable 自体は Nuxt ランタイム依存のため、ここでは composable と同等の DB 操作を
 *     RLS 配下の authenticated クライアント (publishable key) で実行し、スキーマ/RLS/denormalize を検証する。
 */
import { describe, it, expect, beforeAll, afterAll, inject } from 'vitest'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { createGroupForUserB, createPlayer, createMatch } from '../helpers/rls-fixtures'

const url = process.env.NUXT_PUBLIC_SUPABASE_URL
const anonKey = process.env.NUXT_PUBLIC_SUPABASE_KEY
const serviceRoleKey = process.env.NUXT_SUPABASE_SECRET_KEY
const skip = !url || !anonKey || !serviceRoleKey

describe.skipIf(skip)('録画フロー結合: TASK-0019', () => {
  let serviceClient: SupabaseClient
  let userAClient: SupabaseClient
  let groupId: string
  let setId: string
  let players: string[]

  beforeAll(async () => {
    const { userA } = inject('users')
    serviceClient = createClient(url!, serviceRoleKey!, { auth: { autoRefreshToken: false, persistSession: false } })
    userAClient = createClient(url!, anonKey!, { auth: { autoRefreshToken: false, persistSession: false } })
    const { error } = await userAClient.auth.signInWithPassword({ email: userA.email, password: userA.password })
    if (error) throw new Error(`signIn failed: ${error.message}`)
    const { data: au } = await userAClient.auth.getUser()

    groupId = await createGroupForUserB(serviceClient, au.user!.id)
    players = await Promise.all([
      createPlayer(serviceClient, groupId), createPlayer(serviceClient, groupId),
      createPlayer(serviceClient, groupId), createPlayer(serviceClient, groupId)
    ])
    const matchId = await createMatch(serviceClient, groupId, [players[0], players[1], players[2], players[3]])
    const { data: set } = await serviceClient
      .from('sets').insert({ match_id: matchId, set_number: 1, first_serving_team: 'A' }).select('id').single()
    setId = set!.id
  })

  afterAll(async () => {
    if (!groupId) return
    const { data: matches } = await serviceClient.from('matches').select('id').eq('group_id', groupId)
    for (const m of matches ?? []) {
      const { data: sets } = await serviceClient.from('sets').select('id').eq('match_id', m.id)
      for (const s of sets ?? []) {
        const { data: rallies } = await serviceClient.from('rallies').select('id').eq('set_id', s.id)
        for (const r of rallies ?? []) await serviceClient.from('shots').delete().eq('rally_id', r.id)
        await serviceClient.from('rallies').delete().eq('set_id', s.id)
      }
      await serviceClient.from('sets').delete().eq('match_id', m.id)
    }
    await serviceClient.from('matches').delete().eq('group_id', groupId)
    await serviceClient.from('players').delete().eq('group_id', groupId)
    await serviceClient.from('group_members').delete().eq('group_id', groupId)
    await serviceClient.from('groups').delete().eq('id', groupId)
  })

  it('denormalize 列 + ショット + 得点が round-trip し、undo の物理削除が成功する', async () => {
    // ラリー生成 (denorm 列を明示)
    const { data: rally, error: rErr } = await userAClient.from('rallies').insert({
      set_id: setId, rally_number: 1,
      serving_team: 'A', server_position: 'right', server_player_id: players[1], receiver_player_id: players[2],
      camera_near_team: 'A', video_start_timestamp_ms: 12345
    }).select('id').single()
    expect(rErr).toBeNull()
    const rallyId = rally!.id

    // ショット 2 件
    const { data: sh1 } = await userAClient.from('shots').insert({ rally_id: rallyId, shot_number: 1, video_timestamp_ms: 12345, input_source: 'manual' }).select('id').single()
    await userAClient.from('shots').insert({ rally_id: rallyId, shot_number: 2, video_timestamp_ms: 13000, input_source: 'manual' })

    // 得点確定 (update)
    await userAClient.from('rallies').update({ point_winner: 'A', is_point_confirmed: true }).eq('id', rallyId)

    // read back: denorm + shots(count)
    const { data: read } = await userAClient
      .from('rallies')
      .select('serving_team, server_position, server_player_id, receiver_player_id, point_winner, is_point_confirmed, video_start_timestamp_ms, shots(count)')
      .eq('id', rallyId).single()
    expect(read!.serving_team).toBe('A')
    expect(read!.server_position).toBe('right')
    expect(read!.server_player_id).toBe(players[1])
    expect(read!.receiver_player_id).toBe(players[2])
    expect(read!.point_winner).toBe('A')
    expect(read!.is_point_confirmed).toBe(true)
    expect((read!.shots as { count: number }[])[0].count).toBe(2)

    // undo: ショット物理削除 (REQ-110a)
    const { data: delShot } = await userAClient.from('shots').delete().eq('id', sh1!.id).select()
    expect(delShot).toHaveLength(1)

    // 残りショットも消して空 rally を物理削除
    await userAClient.from('shots').delete().eq('rally_id', rallyId)
    const { data: delRally } = await userAClient.from('rallies').delete().eq('id', rallyId).select()
    expect(delRally).toHaveLength(1)
    const { data: gone } = await serviceClient.from('rallies').select('id').eq('id', rallyId)
    expect(gone).toHaveLength(0)
  })
})
