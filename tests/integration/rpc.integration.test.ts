/**
 * TASK-0015: RPC 統合テスト
 *
 * テスト対象: SECURITY DEFINER RPC
 *   - create_group_with_owner
 *   - generate_invitation_code
 *   - join_group_with_code
 *
 * 実行コマンド: pnpm test:integration
 * 設定ファイル: vitest.integration.config.ts
 *
 * 【テスト方針】
 * - tdd-testcases.md TC-15-01〜TC-15-11
 * - globalSetup で作成済みの User A・B を inject('users') で取得
 * - 認証クライアント (anon key) + service_role クライアント (秘密鍵) を使い分け
 * - TC-15-07 (5 回連続衝突) は B 案 (テスト用 RPC test_force_collision_invitation_code) を使用
 * - afterAll で cleanupTestUserData([userAId, userBId]) を呼び出し副作用リーク防止
 *
 * 【ADR-006 追補 (2026-05-24, TASK-0018)】
 *   TC-15-11 は 1 ユーザー = 1 Group 制約により、UNIQUE 違反 (23505) ではなく
 *   join_group_with_code 冒頭の `IF EXISTS (group_members WHERE user_id = auth.uid())`
 *   ガードが先に発火し `already_in_group` 例外がスローされる。
 *
 * 【テスト順序】
 *   join_group_with_code 内では TC-15-09/10 (User B 未所属時の異常系) を
 *   TC-15-08 (参加) より先に実行する。ADR-006 早期失敗ガードが TC-15-09/10 の
 *   invitation_not_found / invitation_expired より先に発火するのを避けるため。
 *   TC-15-11 は TC-15-08 の後にのみ意味を持つ。
 */

import { describe, it, expect, beforeAll, afterAll, inject } from 'vitest'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { cleanupTestUserData } from '../setup/create-test-users'
import {
  createExpiredInvitation,
  deleteInvitationByCode,
  seedCollisionInvitation
} from './helpers/rpc-fixtures'

// ========================================
// 環境変数チェック
// ========================================

const url = process.env.NUXT_PUBLIC_SUPABASE_URL
const anonKey = process.env.NUXT_PUBLIC_SUPABASE_KEY
const serviceRoleKey = process.env.NUXT_SUPABASE_SECRET_KEY
const skip = !url || !anonKey || !serviceRoleKey

// ========================================
// テスト本体
// ========================================

describe.skipIf(skip)('RPC 統合テスト: TASK-0015', () => {
  let serviceClient: SupabaseClient
  let userAClient: SupabaseClient
  let userBClient: SupabaseClient
  let userAId: string
  let userBId: string

  beforeAll(async () => {
    const { userA, userB } = inject('users')
    userAId = userA.id
    userBId = userB.id

    serviceClient = createClient(url!, serviceRoleKey!, {
      auth: { autoRefreshToken: false, persistSession: false }
    })

    userAClient = createClient(url!, anonKey!, {
      auth: { autoRefreshToken: false, persistSession: false }
    })
    const { error: signInA } = await userAClient.auth.signInWithPassword({
      email: userA.email,
      password: userA.password
    })
    if (signInA) throw new Error(`User A サインイン失敗: ${signInA.message}`)

    userBClient = createClient(url!, anonKey!, {
      auth: { autoRefreshToken: false, persistSession: false }
    })
    const { error: signInB } = await userBClient.auth.signInWithPassword({
      email: userB.email,
      password: userB.password
    })
    if (signInB) throw new Error(`User B サインイン失敗: ${signInB.message}`)

    // ADR-006: 1 ユーザー = 1 Group 制約のため、テスト前に既存所属を全削除する
    await cleanupTestUserData([userAId, userBId])
  })

  afterAll(async () => {
    await cleanupTestUserData([userAId, userBId])
  })

  // ========================================
  // create_group_with_owner
  // ========================================

  describe('create_group_with_owner', () => {
    afterAll(async () => {
      // 後続 describe (generate_invitation_code) でも groupA を新規作成するため
      // ADR-006 違反を防ぐべく User A の所属を一旦クリア
      await cleanupTestUserData([userAId])
    })

    it('TC-15-01: 正常 — User A が新規 Group を作成 → uuid 返却、groups + group_members に行', async () => {
      const { data, error } = await userAClient.rpc('create_group_with_owner', {
        group_name: 'テストG'
      })
      expect(error).toBeNull()
      expect(data).toMatch(/^[0-9a-f-]{36}$/)

      const { data: groupRow, error: gErr } = await serviceClient
        .from('groups')
        .select('id, name')
        .eq('id', data!)
        .single()
      expect(gErr).toBeNull()
      expect(groupRow?.name).toBe('テストG')

      const { data: memberRow, error: mErr } = await serviceClient
        .from('group_members')
        .select('group_id, user_id')
        .eq('group_id', data!)
        .eq('user_id', userAId)
        .single()
      expect(mErr).toBeNull()
      expect(memberRow?.user_id).toBe(userAId)
    })

    it('TC-15-02: 異常 — 未認証 → not_authenticated', async () => {
      const anonClient = createClient(url!, anonKey!, {
        auth: { autoRefreshToken: false, persistSession: false }
      })
      const { error } = await anonClient.rpc('create_group_with_owner', {
        group_name: 'x'
      })
      expect(error?.message).toContain('not_authenticated')
    })

    it('TC-15-03: 境界 — 空文字列 → invalid_group_name', async () => {
      const { error } = await userAClient.rpc('create_group_with_owner', {
        group_name: ''
      })
      expect(error?.message).toContain('invalid_group_name')
    })

    it('TC-15-04: 境界 — 51 文字 → invalid_group_name', async () => {
      const { error } = await userAClient.rpc('create_group_with_owner', {
        group_name: 'a'.repeat(51)
      })
      expect(error?.message).toContain('invalid_group_name')
    })
  })

  // ========================================
  // generate_invitation_code
  // ========================================

  describe('generate_invitation_code', () => {
    let groupAId: string

    beforeAll(async () => {
      const { data, error } = await userAClient.rpc('create_group_with_owner', {
        group_name: 'gen-code G'
      })
      if (error || !data) throw new Error(`Group 作成失敗: ${error?.message}`)
      groupAId = data
    })

    afterAll(async () => {
      // 後続 describe (join_group_with_code) のため User A の所属をクリア
      await cleanupTestUserData([userAId])
    })

    it('TC-15-05: 正常 — メンバー User A → 8 文字 hex 大文字コード、group_invitations に行', async () => {
      const { data, error } = await userAClient.rpc('generate_invitation_code', {
        target_group_id: groupAId
      })
      expect(error).toBeNull()
      expect(data).toMatch(/^[A-F0-9]{8}$/)

      const { data: invRow, error: iErr } = await serviceClient
        .from('group_invitations')
        .select('code, group_id')
        .eq('code', data!)
        .single()
      expect(iErr).toBeNull()
      expect(invRow?.group_id).toBe(groupAId)
    })

    it('TC-15-06: 異常 — 非メンバー User B → not_a_member', async () => {
      const { error } = await userBClient.rpc('generate_invitation_code', {
        target_group_id: groupAId
      })
      expect(error?.message).toContain('not_a_member')
    })

    it('TC-15-07: 異常 — 5 回連続 UNIQUE 衝突 → invitation_code_collision_after_retry (B 案テスト用 RPC)', async () => {
      // B 案: test_force_collision_invitation_code は固定コード 'DEADBEEF' を使用。
      // service_role で同コードを事前 INSERT すれば 5 回連続 UNIQUE 違反が確定する。
      const fixedCode = 'DEADBEEF'
      await seedCollisionInvitation(serviceClient, {
        groupId: groupAId,
        createdBy: userAId,
        code: fixedCode
      })

      const { error } = await userAClient.rpc('test_force_collision_invitation_code', {
        target_group_id: groupAId
      })
      expect(error?.message).toContain('invitation_code_collision_after_retry')

      await deleteInvitationByCode(serviceClient, fixedCode)
    })
  })

  // ========================================
  // join_group_with_code
  // ========================================

  describe('join_group_with_code', () => {
    let groupAId: string
    let validCode: string

    beforeAll(async () => {
      const { data: gid, error: ge } = await userAClient.rpc('create_group_with_owner', {
        group_name: 'join 用 G'
      })
      if (ge || !gid) throw new Error(`Group 作成失敗: ${ge?.message}`)
      groupAId = gid

      const { data: code, error: ce } = await userAClient.rpc('generate_invitation_code', {
        target_group_id: groupAId
      })
      if (ce || !code) throw new Error(`招待コード発行失敗: ${ce?.message}`)
      validCode = code
    })

    afterAll(async () => {
      await cleanupTestUserData([userAId, userBId])
    })

    // 順序: 09 → 10 → 08 → 11
    // ADR-006 早期失敗ガードは User B が groupAId 参加後に発火するため、
    // TC-15-09/10 (invitation_not_found / invitation_expired) は参加前に実行する。

    it('TC-15-09: 異常 — 不正コード INVALID0 → invitation_not_found', async () => {
      const { error } = await userBClient.rpc('join_group_with_code', {
        invite_code: 'INVALID0'
      })
      expect(error?.message).toContain('invitation_not_found')
    })

    it('TC-15-10: 異常 — 期限切れコード → invitation_expired (EDGE-001, EDGE-101)', async () => {
      const expiredCode = await createExpiredInvitation(serviceClient, {
        groupId: groupAId,
        createdBy: userAId,
        code: 'EXPIRED1'
      })

      const { error } = await userBClient.rpc('join_group_with_code', {
        invite_code: expiredCode
      })
      expect(error?.message).toContain('invitation_expired')

      await deleteInvitationByCode(serviceClient, expiredCode)
    })

    it('TC-15-08: 正常 — User B が有効コードで参加 → group_members に行追加', async () => {
      const { data, error } = await userBClient.rpc('join_group_with_code', {
        invite_code: validCode
      })
      expect(error).toBeNull()
      expect(data).toBe(groupAId)

      const { data: memberRow, error: mErr } = await serviceClient
        .from('group_members')
        .select('group_id, user_id')
        .eq('group_id', groupAId)
        .eq('user_id', userBId)
        .single()
      expect(mErr).toBeNull()
      expect(memberRow?.user_id).toBe(userBId)
    })

    it('TC-15-11: 異常 — 既メンバー再参加 → already_in_group (ADR-006 早期失敗ガード)', async () => {
      const { error } = await userBClient.rpc('join_group_with_code', {
        invite_code: validCode
      })
      expect(error?.message).toContain('already_in_group')
    })
  })
})
