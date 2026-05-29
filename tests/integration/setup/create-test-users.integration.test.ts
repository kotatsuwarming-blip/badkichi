import { describe, it, expect, beforeAll, afterAll, inject } from 'vitest'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { cleanupTestUserData } from '../../setup/create-test-users'

const url = process.env.NUXT_PUBLIC_SUPABASE_URL
const serviceRoleKey = process.env.NUXT_SUPABASE_SECRET_KEY
const skip = !url || !serviceRoleKey

let serviceClient: SupabaseClient

describe.skipIf(skip)('cleanupTestUserData (integration)', () => {
  let userAId: string
  let userBId: string

  beforeAll(() => {
    serviceClient = createClient(url!, serviceRoleKey!, {
      auth: { autoRefreshToken: false, persistSession: false }
    })
    const users = inject('users')
    userAId = users.userA.id
    userBId = users.userB.id
  })

  afterAll(async () => {
    // 念のためテスト由来の group_members / groups を掃除
    const { data: memberships } = await serviceClient
      .from('group_members')
      .select('group_id')
      .in('user_id', [userAId, userBId])
    if (memberships && memberships.length > 0) {
      const groupIds = memberships.map((m: { group_id: string }) => m.group_id)
      await serviceClient.from('groups').delete().in('id', groupIds)
    }
    await serviceClient.from('group_members').delete().in('user_id', [userAId, userBId])
  })

  it('cleanupTestUserData は user 所属 groups と group_members を削除し auth.users は残す', async () => {
    // 【初期条件】: User A 名義の Group を service_role で作成し group_members に登録
    const { data: group, error: insertErr } = await serviceClient
      .from('groups')
      .insert({ name: 'TC-13-05 sandbox group' })
      .select('id')
      .single()
    expect(insertErr).toBeNull()
    expect(group?.id).toBeTruthy()

    const { error: memberErr } = await serviceClient.from('group_members').insert({
      group_id: group!.id,
      user_id: userAId
    })
    expect(memberErr).toBeNull()

    // 【実行】: cleanupTestUserData に対象ユーザ ID を渡す
    await cleanupTestUserData([userAId, userBId])

    // 【検証 1】: 作成した group が削除されている (CASCADE で配下も)
    const { data: remainingGroup } = await serviceClient
      .from('groups')
      .select('id, name, deleted_at')
      .eq('id', group!.id)
      .maybeSingle()
    // DEBUG: dump remaining state to understand what cleanupTestUserData left
    if (remainingGroup) {
      const { data: remainingMembersAll } = await serviceClient
        .from('group_members')
        .select('id, group_id, user_id, deleted_at')
        .eq('group_id', group!.id)
      console.log('[cleanupTestUserData DEBUG] remainingGroup:', JSON.stringify(remainingGroup, null, 2))
      console.log('[cleanupTestUserData DEBUG] remainingMembers for that group:', JSON.stringify(remainingMembersAll, null, 2))
      const { data: allUserMembers } = await serviceClient
        .from('group_members')
        .select('id, group_id, user_id, deleted_at')
        .in('user_id', [userAId, userBId])
      console.log('[cleanupTestUserData DEBUG] all group_members for test users:', JSON.stringify(allUserMembers, null, 2))
    }
    expect(remainingGroup).toBeNull()

    // 【検証 2】: group_members から user_a 関連が消えている
    const { data: remainingMembers } = await serviceClient
      .from('group_members')
      .select('id')
      .in('user_id', [userAId, userBId])
    expect(remainingMembers ?? []).toEqual([])

    // 【検証 3】: auth.users 自体は残る (globalSetup の再利用前提)
    const { data: usersListing, error: listErr } = await serviceClient.auth.admin.listUsers({
      page: 1,
      perPage: 1000
    })
    expect(listErr).toBeNull()
    const ids = usersListing.users.map(u => u.id)
    expect(ids).toContain(userAId)
    expect(ids).toContain(userBId)
  })
})
