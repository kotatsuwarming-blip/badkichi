import { createClient, type SupabaseClient } from '@supabase/supabase-js'

export interface TestUser {
  id: string
  email: string
  password: string
}

let adminClient: SupabaseClient | null = null
let createdUserIds: string[] = []
let currentUsers: { userA: TestUser, userB: TestUser } | null = null

function getAdminClient(): SupabaseClient {
  if (adminClient) return adminClient
  const url = process.env.NUXT_PUBLIC_SUPABASE_URL
  const serviceRoleKey = process.env.NUXT_SUPABASE_SECRET_KEY
  if (!url || !serviceRoleKey) {
    throw new Error(
      'NUXT_PUBLIC_SUPABASE_URL / NUXT_SUPABASE_SECRET_KEY が未設定です (.env.test 参照)'
    )
  }
  adminClient = createClient(url, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false }
  })
  return adminClient
}

async function createOne(client: SupabaseClient, email: string): Promise<TestUser> {
  const password = `test-${globalThis.crypto.randomUUID()}`
  const { data, error } = await client.auth.admin.createUser({
    email,
    password,
    email_confirm: true
  })
  if (error || !data.user) {
    throw new Error(`createUser failed: ${error?.message ?? 'no user returned'}`)
  }
  createdUserIds.push(data.user.id)
  return { id: data.user.id, email, password }
}

export async function setupTestUsers(): Promise<{ userA: TestUser, userB: TestUser }> {
  const client = getAdminClient()
  const emailA = process.env.TEST_USER_A_EMAIL || 'test-a@example.com'
  const emailB = process.env.TEST_USER_B_EMAIL || 'test-b@example.com'
  const userA = await createOne(client, emailA)
  const userB = await createOne(client, emailB)
  currentUsers = { userA, userB }
  return currentUsers
}

export async function teardownTestUsers(): Promise<void> {
  if (createdUserIds.length === 0) return
  const client = getAdminClient()
  for (const id of createdUserIds) {
    await client.auth.admin.deleteUser(id)
  }
  createdUserIds = []
  currentUsers = null
}

/**
 * afterEach 用 cleanup (B3 確定方針, 2026-05-13)。
 * groups の owner / group_members の user_id で User A/B 系のテストデータを削除し、
 * auth.users 自体は残す (globalSetup の作成済みを再利用するため)。
 */
export async function cleanupTestUserData(): Promise<void> {
  if (createdUserIds.length === 0) return
  const client = getAdminClient()
  await client.from('groups').delete().in('owner_user_id', createdUserIds)
  await client.from('group_members').delete().in('user_id', createdUserIds)
}

export function getCurrentTestUsers(): { userA: TestUser, userB: TestUser } {
  if (!currentUsers) {
    throw new Error('setupTestUsers() が未実行です (vitest globalSetup を確認)')
  }
  return currentUsers
}

export default async function globalSetup(): Promise<() => Promise<void>> {
  await setupTestUsers()
  return async () => {
    await teardownTestUsers()
  }
}
