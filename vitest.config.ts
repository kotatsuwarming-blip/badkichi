import { defineVitestConfig } from '@nuxt/test-utils/config'

// 【alias 安定化】: pnpm の .pnpm ディレクトリ下の長いバージョン入りパスを避けるため
// node_modules/{パッケージ名} のシンボリックリンクパスを alias に登録する。
// Vitest はモジュール解決時に alias を評価するため、シンボリックリンクのまま登録しても
// vi.mock() のパス照合で正しく一致する。
// パッケージ更新時は vitest.config.ts 1 箇所の alias を更新するだけで全テストが追従する。 🔵
const ROOT = new URL('.', import.meta.url).pathname.replace(/\/$/, '')

export default defineVitestConfig({
  resolve: {
    alias: {
      // 【#nuxt-router】: navigateTo を含む Nuxt app router composable への安定エイリアス
      // nuxt/dist/app/composables/router.js は package.json exports 外のため
      // シンボリックリンクパス経由でアクセスし、バージョン番号入りの .pnpm パスを隠蔽する。
      '#nuxt-router': ROOT + '/node_modules/nuxt/dist/app/composables/router.js',
      // 【#supabase-client】: useSupabaseClient を含む Supabase composable への安定エイリアス
      '#supabase-client': ROOT + '/node_modules/@nuxtjs/supabase/dist/runtime/composables/useSupabaseClient.js'
    }
  },
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
