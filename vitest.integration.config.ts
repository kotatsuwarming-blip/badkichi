import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    include: ['tests/integration/**/*.integration.test.ts'],
    globalSetup: ['./tests/setup/create-test-users.ts'],
    testTimeout: 30_000,
    pool: 'forks',
    poolOptions: {
      forks: { singleFork: true }
    }
  }
})
