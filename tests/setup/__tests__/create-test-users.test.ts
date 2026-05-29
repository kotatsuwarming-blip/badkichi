import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'

const { mockCreateUser, mockDeleteUser, mockListUsers } = vi.hoisted(() => ({
  mockCreateUser: vi.fn(),
  mockDeleteUser: vi.fn(),
  mockListUsers: vi.fn()
}))

vi.mock('@supabase/supabase-js', () => ({
  createClient: vi.fn(() => ({
    auth: {
      admin: {
        createUser: mockCreateUser,
        deleteUser: mockDeleteUser,
        listUsers: mockListUsers
      }
    }
  }))
}))

beforeEach(() => {
  vi.resetModules()
  mockCreateUser.mockReset()
  mockDeleteUser.mockReset()
  mockListUsers.mockReset()
  // setupTestUsers の冪等性 pre-cleanup 用のデフォルト: 既存ユーザなし
  mockListUsers.mockResolvedValue({ data: { users: [] }, error: null })
  vi.stubEnv('NUXT_PUBLIC_SUPABASE_URL', 'https://stub.supabase.co')
  vi.stubEnv('NUXT_SUPABASE_SECRET_KEY', 'sb_secret_stub')
  vi.stubEnv('TEST_USER_A_EMAIL', '')
  vi.stubEnv('TEST_USER_B_EMAIL', '')
})

afterEach(() => {
  vi.unstubAllEnvs()
})

describe('setupTestUsers', () => {
  it('正常パス: 2 ユーザを作成し id/email/password を返す', async () => {
    mockCreateUser
      .mockResolvedValueOnce({ data: { user: { id: 'uuid-A' } }, error: null })
      .mockResolvedValueOnce({ data: { user: { id: 'uuid-B' } }, error: null })

    const { setupTestUsers } = await import('../create-test-users')
    const { userA, userB } = await setupTestUsers()

    expect(userA.id).toBe('uuid-A')
    expect(userB.id).toBe('uuid-B')
    expect(userA.email).toBe('test-a@example.com')
    expect(userB.email).toBe('test-b@example.com')
    expect(userA.password).toBeTruthy()
    expect(userB.password).toBeTruthy()
    expect(mockCreateUser).toHaveBeenCalledTimes(2)
    expect(mockCreateUser).toHaveBeenNthCalledWith(1, expect.objectContaining({
      email: 'test-a@example.com',
      email_confirm: true
    }))
  })

  it('NUXT_SUPABASE_SECRET_KEY 未設定で Error を throw する', async () => {
    vi.stubEnv('NUXT_SUPABASE_SECRET_KEY', '')

    const { setupTestUsers } = await import('../create-test-users')
    await expect(setupTestUsers()).rejects.toThrow(
      /NUXT_PUBLIC_SUPABASE_URL \/ NUXT_SUPABASE_SECRET_KEY が未設定です/
    )
  })

  it('Admin API が error を返したら Error を throw する', async () => {
    mockCreateUser.mockResolvedValueOnce({
      data: { user: null },
      error: { message: 'Invalid API key' }
    })

    const { setupTestUsers } = await import('../create-test-users')
    await expect(setupTestUsers()).rejects.toThrow(
      /createUser failed: Invalid API key/
    )
  })
})

describe('teardownTestUsers', () => {
  it('createdUserIds 分 deleteUser を呼び、配列を空にリセットする', async () => {
    mockCreateUser
      .mockResolvedValueOnce({ data: { user: { id: 'uuid-A' } }, error: null })
      .mockResolvedValueOnce({ data: { user: { id: 'uuid-B' } }, error: null })
    mockDeleteUser.mockResolvedValue({ data: null, error: null })

    const mod = await import('../create-test-users')
    await mod.setupTestUsers()
    await mod.teardownTestUsers()

    expect(mockDeleteUser).toHaveBeenCalledTimes(2)
    expect(mockDeleteUser).toHaveBeenNthCalledWith(1, 'uuid-A')
    expect(mockDeleteUser).toHaveBeenNthCalledWith(2, 'uuid-B')

    await mod.teardownTestUsers()
    expect(mockDeleteUser).toHaveBeenCalledTimes(2)
  })
})
