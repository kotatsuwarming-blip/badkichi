import { defineVitestConfig } from '@nuxt/test-utils/config'

export default defineVitestConfig({
  test: {
    passWithNoTests: true,
    // mock unit テストは tests/unit/ に集約 (ADR-012 D5)。integration は別 config。
    include: ['tests/unit/**/*.test.ts'],
    exclude: [
      '**/node_modules/**',
      '**/dist/**',
      '**/.{idea,git,cache,output,temp}/**',
      '**/{karma,rollup,webpack,vite,vitest,jest,ava,babel,nyc,cypress,tsup,build,eslint,prettier}.config.*',
      '**/*.integration.test.ts'
    ]
  }
})
