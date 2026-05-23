import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import {
  cleanupTestUserData,
  getCurrentTestUsers
} from '../../setup/create-test-users'

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
    const users = getCurrentTestUsers()
    userAId = users.userA.id
    userBId = users.userB.id
  })

  afterAll(async () => {
    await serviceClient.from('groups').delete().in('owner_user_id', [userAId, userBId])
  })

  it('User A が作成した groups を削除し auth.users は残す', async () => {
    const { error: insertErr } = await serviceClient.from('groups').insert({
      name: 'TC-13-05 sandbox group',
      owner_user_id: userAId
    })
    expect(insertErr).toBeNull()

    await cleanupTestUserData()

    const { data: remainingGroups, error: selectErr } = await serviceClient
      .from('groups')
      .select('id')
      .eq('owner_user_id', userAId)
    expect(selectErr).toBeNull()
    expect(remainingGroups ?? []).toEqual([])

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
