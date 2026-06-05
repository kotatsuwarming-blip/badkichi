/**
 * TASK-0001: 録画系 DELETE RLS ポリシー 統合テスト
 *
 * テスト対象: 20260605130000_match_recording_add_delete_policies.sql で追加した
 *   rallies_delete / shots_delete / po_delete (FK 経由 is_member_of)
 * 実行コマンド: pnpm test:integration
 * 設定ファイル: vitest.integration.config.ts
 *
 * 【テスト方針】
 * - 自 Group: 所属メンバー (User A) が own group の shots / position_overrides / 空 rally を
 *   物理削除でき、行が消えることを検証 (REQ-110a / REQ-110c)。
 * - 他 Group: User A が User B の rally / shot / position_overrides を DELETE しても
 *   RLS USING で 0 行となり、行が残ることを検証 (NFR-101 / REQ-401)。
 * - DELETE は .select() を併用して RLS フィルタ後の影響行を取得する。
 */

import { describe, it, expect, beforeAll, afterAll, inject } from 'vitest'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import {
  createGroupForUserB,
  createPlayer,
  createMatch,
  createSet,
  createRally,
  createShot,
  createPositionOverride
} from '../helpers/rls-fixtures'

const url = process.env.NUXT_PUBLIC_SUPABASE_URL
const anonKey = process.env.NUXT_PUBLIC_SUPABASE_KEY
const serviceRoleKey = process.env.NUXT_SUPABASE_SECRET_KEY
const skip = !url || !anonKey || !serviceRoleKey

describe.skipIf(skip)('録画系 DELETE RLS ポリシー: TASK-0001', () => {
  let serviceClient: SupabaseClient
  let userAClient: SupabaseClient

  // User A 自 Group のデータ
  let userAGroupId: string
  let ownRallyId: string
  let ownShotId: string
  let ownOverrideId: string

  // User B (他 Group) のデータ
  let userBGroupId: string
  let otherRallyId: string
  let otherShotId: string
  let otherOverrideId: string

  beforeAll(async () => {
    const { userA, userB } = inject('users')

    serviceClient = createClient(url!, serviceRoleKey!, {
      auth: { autoRefreshToken: false, persistSession: false }
    })

    // 【User A 認証】
    userAClient = createClient(url!, anonKey!, {
      auth: { autoRefreshToken: false, persistSession: false }
    })
    const { error: signInError } = await userAClient.auth.signInWithPassword({
      email: userA.email,
      password: userA.password
    })
    if (signInError) throw new Error(`User A signIn failed: ${signInError.message}`)
    const { data: aUser } = await userAClient.auth.getUser()
    const userAId = aUser.user!.id

    // 【自 Group データ投入】: User A 名義の group + match → set → rally → shot / override
    userAGroupId = await createGroupForUserB(serviceClient, userAId)
    const ap = await Promise.all([
      createPlayer(serviceClient, userAGroupId),
      createPlayer(serviceClient, userAGroupId),
      createPlayer(serviceClient, userAGroupId),
      createPlayer(serviceClient, userAGroupId)
    ])
    const aMatchId = await createMatch(serviceClient, userAGroupId, [ap[0], ap[1], ap[2], ap[3]])
    const aSetId = await createSet(serviceClient, aMatchId)
    ownRallyId = await createRally(serviceClient, aSetId, ap[0])
    ownShotId = await createShot(serviceClient, ownRallyId)
    ownOverrideId = await createPositionOverride(serviceClient, ownRallyId)

    // 【他 Group データ投入】: User B 名義
    userBGroupId = await createGroupForUserB(serviceClient, userB.id)
    const bp = await Promise.all([
      createPlayer(serviceClient, userBGroupId),
      createPlayer(serviceClient, userBGroupId),
      createPlayer(serviceClient, userBGroupId),
      createPlayer(serviceClient, userBGroupId)
    ])
    const bMatchId = await createMatch(serviceClient, userBGroupId, [bp[0], bp[1], bp[2], bp[3]])
    const bSetId = await createSet(serviceClient, bMatchId)
    otherRallyId = await createRally(serviceClient, bSetId, bp[0])
    otherShotId = await createShot(serviceClient, otherRallyId)
    otherOverrideId = await createPositionOverride(serviceClient, otherRallyId)
  })

  afterAll(async () => {
    // service_role で両 Group を物理削除 (子から順に)
    for (const gid of [userAGroupId, userBGroupId]) {
      if (!gid) continue
      const { data: matches } = await serviceClient.from('matches').select('id').eq('group_id', gid)
      for (const m of matches ?? []) {
        const { data: sets } = await serviceClient.from('sets').select('id').eq('match_id', m.id)
        for (const s of sets ?? []) {
          const { data: rallies } = await serviceClient.from('rallies').select('id').eq('set_id', s.id)
          for (const r of rallies ?? []) {
            await serviceClient.from('shots').delete().eq('rally_id', r.id)
            await serviceClient.from('position_overrides').delete().eq('rally_id', r.id)
          }
          await serviceClient.from('rallies').delete().eq('set_id', s.id)
        }
        await serviceClient.from('sets').delete().eq('match_id', m.id)
      }
      await serviceClient.from('matches').delete().eq('group_id', gid)
      await serviceClient.from('players').delete().eq('group_id', gid)
      await serviceClient.from('group_members').delete().eq('group_id', gid)
      await serviceClient.from('groups').delete().eq('id', gid)
    }
  })

  // ========================================
  // 他 Group: 物理削除は RLS で拒否 (0 行)
  // ========================================

  it('他 Group の shots は DELETE できない (0 行)', async () => {
    const { data, error } = await userAClient.from('shots').delete().eq('id', otherShotId).select()
    expect(error).toBeNull()
    expect(data ?? []).toHaveLength(0)
    // service_role で行が残存していることを確認
    const { data: still } = await serviceClient.from('shots').select('id').eq('id', otherShotId)
    expect(still).toHaveLength(1)
  })

  it('他 Group の position_overrides は DELETE できない (0 行)', async () => {
    const { data, error } = await userAClient.from('position_overrides').delete().eq('id', otherOverrideId).select()
    expect(error).toBeNull()
    expect(data ?? []).toHaveLength(0)
    const { data: still } = await serviceClient.from('position_overrides').select('id').eq('id', otherOverrideId)
    expect(still).toHaveLength(1)
  })

  it('他 Group の rallies は DELETE できない (0 行)', async () => {
    const { data, error } = await userAClient.from('rallies').delete().eq('id', otherRallyId).select()
    expect(error).toBeNull()
    expect(data ?? []).toHaveLength(0)
    const { data: still } = await serviceClient.from('rallies').select('id').eq('id', otherRallyId)
    expect(still).toHaveLength(1)
  })

  // ========================================
  // 自 Group: 物理削除が成功する (子 → 親の順)
  // ========================================

  it('自 Group の shots / position_overrides / 空 rally を物理削除できる', async () => {
    // shot
    const { data: dShot, error: eShot } = await userAClient.from('shots').delete().eq('id', ownShotId).select()
    expect(eShot).toBeNull()
    expect(dShot).toHaveLength(1)

    // override
    const { data: dOv, error: eOv } = await userAClient.from('position_overrides').delete().eq('id', ownOverrideId).select()
    expect(eOv).toBeNull()
    expect(dOv).toHaveLength(1)

    // 空になった rally
    const { data: dRally, error: eRally } = await userAClient.from('rallies').delete().eq('id', ownRallyId).select()
    expect(eRally).toBeNull()
    expect(dRally).toHaveLength(1)

    // service_role で全て消えたことを確認
    const { data: shot } = await serviceClient.from('shots').select('id').eq('id', ownShotId)
    const { data: ov } = await serviceClient.from('position_overrides').select('id').eq('id', ownOverrideId)
    const { data: rally } = await serviceClient.from('rallies').select('id').eq('id', ownRallyId)
    expect(shot).toHaveLength(0)
    expect(ov).toHaveLength(0)
    expect(rally).toHaveLength(0)
  })
})
