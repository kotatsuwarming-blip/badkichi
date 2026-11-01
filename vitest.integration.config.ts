import { defineConfig } from 'vitest/config'
import path from 'node:path'

export default defineConfig({
  resolve: {
    // @supabase/supabase-js は devDependencies の直接依存なので node_modules 直下の
    // シンボリックリンク経由で解決する (vitest.config.ts の alias と同方針)。
    // 以前は .pnpm 配下のバージョン入りパスを直書きしていたため、依存更新のたびに
    // ERR_LOAD_URL で統合テストが落ちていた。バージョン非依存のパスにして追従不要にする。
    alias: {
      '@supabase/supabase-js': path.resolve('./node_modules/@supabase/supabase-js')
    }
  },
  test: {
    include: ['tests/integration/**/*.integration.test.ts'],
    globalSetup: ['./tests/setup/create-test-users.ts'],
    // .env.test から NUXT_PUBLIC_SUPABASE_URL / NUXT_PUBLIC_SUPABASE_KEY を読み込む。
    // NUXT_SUPABASE_SECRET_KEY (sb_secret_*) は strict secret policy に従い
    // シェル env で渡す: NUXT_SUPABASE_SECRET_KEY=<key> pnpm test:integration
    envFile: '.env.test',
    testTimeout: 30_000,
    // beforeAll/afterAll も dev DB へ複数行を順次投入するため、testTimeout と揃える
    // (デフォルト 10s だと stats-rpc の beforeAll が 2 試合+6 ラリー投入でタイムアウトする)
    hookTimeout: 30_000,
    pool: 'forks',
    // Vitest 4: poolOptions は非推奨。singleFork は forks プールのトップレベルオプション
    forks: { singleFork: true },
    // 複数ファイルの並列実行を禁止する。dev DB を共有しているため、ファイル A の
    // afterAll がファイル B の beforeAll 投入データを削除する cross-file interference を防ぐ
    // (例: create-test-users の afterAll が rls の userB 行まで削除し TC-14-30 が失敗)。
    fileParallelism: false
  }
})
