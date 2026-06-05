/**
 * TASK-0003: useMatches 統合テスト
 *
 * テスト対象: useMatches が使う PostgREST 埋め込み select の実 DB 動作
 * 実行コマンド: pnpm test:integration
 * 設定ファイル: vitest.integration.config.ts
 *
 * 【テスト方針】
 * - 複合 FK (matches→players) の **制約名ヒント埋め込み** が実 DB で 4 選手名を解決すること
 *   (実地検証 2026-06-05: 単一列ヒントは PGRST200、制約名ヒントは解決可)。
 * - 削除済 player (deleted_at セット) でも名前が解決されること (EDGE-007)。
 * - RLS により他 Group の試合が埋め込み select で返らないこと (NFR-101 / matches_select)。
 *   (越境 SELECT 自体は rls.integration.test.ts TC-14-04 でもカバー)。
 */

import { describe, it, expect, beforeAll, afterAll, inject } from 'vitest'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { createGroupForUserB, cleanupUserBData } from './helpers/rls-fixtures'

// useMatches.ts と同一の埋め込み select (複合 FK は制約名ヒントで解決)
const MATCHES_SELECT = 'id, name, match_date, created_at, video_source_type, video_source_url, ta1:players!matches_group_id_team_a_player1_id_fkey(id, name), ta2:players!matches_group_id_team_a_player2_id_fkey(id, name), tb1:players!matches_group_id_team_b_player1_id_fkey(id, name), tb2:players!matches_group_id_team_b_player2_id_fkey(id, name)'

const url = process.env.NUXT_PUBLIC_SUPABASE_URL
const anonKey = process.env.NUXT_PUBLIC_SUPABASE_KEY
const serviceRoleKey = process.env.NUXT_SUPABASE_SECRET_KEY
const skip = !url || !anonKey || !serviceRoleKey

async function createNamedPlayer(client: SupabaseClient, groupId: string, name: string, deleted = false): Promise<string> {
  const { data, error } = await client
    .from('players')
    .insert({ group_id: groupId, name, deleted_at: deleted ? new Date().toISOString() : null })
    .select('id')
    .single()
  if (error || !data) throw new Error(`createNamedPlayer failed: ${error?.message}`)
  return data.id
}

describe.skipIf(skip)('useMatches 統合テスト: TASK-0003', () => {
  let serviceClient: SupabaseClient
  let userAClient: SupabaseClient

  let groupAId: string // User A 自 Group
  let groupBId: string // 他 Group (越境テスト用)
  const names = { p1: 'A-佐藤', p2: 'B-鈴木(削除済)', p3: 'C-高橋', p4: 'D-田中' }

  beforeAll(async () => {
    const { userA, userB } = inject('users')

    serviceClient = createClient(url!, serviceRoleKey!, {
      auth: { autoRefreshToken: false, persistSession: false }
    })

    // 【User A 自 Group + 4 選手 (p2 は削除済) + 試合】
    groupAId = await createGroupForUserB(serviceClient, userA.id)
    const p1 = await createNamedPlayer(serviceClient, groupAId, names.p1)
    const p2 = await createNamedPlayer(serviceClient, groupAId, names.p2, true) // 削除済 (EDGE-007)
    const p3 = await createNamedPlayer(serviceClient, groupAId, names.p3)
    const p4 = await createNamedPlayer(serviceClient, groupAId, names.p4)
    const { error: mErr } = await serviceClient
      .from('matches')
      .insert({
        group_id: groupAId,
        team_a_player1_id: p1,
        team_a_player2_id: p2,
        team_b_player1_id: p3,
        team_b_player2_id: p4,
        video_source_type: 'youtube',
        video_source_url: 'https://youtu.be/embedtest',
        match_date: '2026-06-05'
      })
    if (mErr) throw new Error(`create match A failed: ${mErr.message}`)

    // 【他 Group + 4 選手 + 試合 (越境テスト用)】
    groupBId = await createGroupForUserB(serviceClient, userB.id)
    const q1 = await createNamedPlayer(serviceClient, groupBId, 'B1')
    const q2 = await createNamedPlayer(serviceClient, groupBId, 'B2')
    const q3 = await createNamedPlayer(serviceClient, groupBId, 'B3')
    const q4 = await createNamedPlayer(serviceClient, groupBId, 'B4')
    const { error: mbErr } = await serviceClient
      .from('matches')
      .insert({
        group_id: groupBId,
        team_a_player1_id: q1,
        team_a_player2_id: q2,
        team_b_player1_id: q3,
        team_b_player2_id: q4,
        video_source_type: 'youtube',
        video_source_url: 'https://youtu.be/other'
      })
    if (mbErr) throw new Error(`create match B failed: ${mbErr.message}`)

    // 【User A 認証セッション】
    userAClient = createClient(url!, anonKey!, {
      auth: { autoRefreshToken: false, persistSession: false }
    })
    const { error: signInError } = await userAClient.auth.signInWithPassword({
      email: userA.email,
      password: userA.password
    })
    if (signInError) throw new Error(`User A signIn failed: ${signInError.message}`)
  }, 60_000)

  afterAll(async () => {
    if (groupAId) await cleanupUserBData(serviceClient, groupAId)
    if (groupBId) await cleanupUserBData(serviceClient, groupBId)
    await userAClient?.auth.signOut()
  }, 60_000)

  it('TC-INT-1: 複合 FK 埋め込みで 4 選手名を解決する (削除済 player も名前維持 EDGE-007)', async () => {
    const { data, error } = await userAClient
      .from('matches')
      .select(MATCHES_SELECT)
      .eq('group_id', groupAId)
      .is('deleted_at', null)
      .order('match_date', { ascending: false })
      .order('created_at', { ascending: false })

    expect(error).toBeNull()
    expect(data?.length).toBe(1)
    const row = data![0] as unknown as {
      ta1: { name: string }
      ta2: { name: string }
      tb1: { name: string }
      tb2: { name: string }
    }
    // 埋め込みは to-one で単一オブジェクトを返す。4 選手名が解決される
    expect(row.ta1.name).toBe(names.p1)
    expect(row.ta2.name).toBe(names.p2) // 削除済でも名前維持 (EDGE-007)
    expect(row.tb1.name).toBe(names.p3)
    expect(row.tb2.name).toBe(names.p4)
  })

  it('TC-INT-2: RLS により他 Group の試合は埋め込み select で返らない (NFR-101)', async () => {
    const { data, error } = await userAClient
      .from('matches')
      .select(MATCHES_SELECT)
      .eq('group_id', groupBId)
      .is('deleted_at', null)

    expect(error).toBeNull()
    expect(data ?? []).toEqual([])
  })
})
