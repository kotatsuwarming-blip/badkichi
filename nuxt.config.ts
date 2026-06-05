// https://nuxt.com/docs/api/configuration/nuxt-config

// @types/node を導入していないため、設定ファイルで使う process.env を型のみ宣言する。
// 実体は Node ランタイムの process。CI の `nuxt typecheck` で TS2591 を出さないための型宣言。
declare const process: { env: Record<string, string | undefined> }

export default defineNuxtConfig({
  modules: [
    '@nuxt/eslint',
    '@nuxt/test-utils/module',
    '@nuxt/ui',
    '@nuxtjs/supabase',
    '@nuxtjs/i18n',
    '@sentry/nuxt/module'
  ],

  devtools: {
    enabled: false
  },

  css: ['~/assets/css/main.css'],

  runtimeConfig: {
    public: {
      sentry: {
        dsn: ''
      },
      env: 'development'
    }
  },

  // routeRules の '/' prerender は削除 (ADR-010 D6)

  compatibilityDate: '2025-01-15',

  eslint: {
    config: {
      stylistic: {
        commaDangle: 'never',
        braceStyle: '1tbs'
      }
    }
  },

  i18n: {
    locales: [
      { code: 'ja', file: 'ja.json', name: '日本語' },
      { code: 'en', file: 'en.json', name: 'English' }
    ],
    defaultLocale: 'ja',
    strategy: 'no_prefix',
    detectBrowserLanguage: false,
    // @nuxtjs/i18n v10 は langDir を <rootDir>/i18n/ 基準で解決するため
    // 実ファイルは i18n/locales/*.json に配置する (restructureDir 既定 'i18n')
    langDir: 'locales/'
  },

  // @sentry/nuxt v10 では dsn/environment/sampleRate は runtime init オプションのため
  // nuxt.config の sentry キー (build-time 専用) ではなく sentry.client.config.ts 側で設定する。
  // dsn / env は runtimeConfig.public 経由で NUXT_PUBLIC_SENTRY_DSN / NUXT_PUBLIC_ENV から注入 (error-handling.md §8.2/§8.3)
  sentry: {
    // ビルドテレメトリの Sentry への外部送信を無効化 (社内ツール、不要な送信を避ける)
    telemetry: false
  },

  supabase: {
    redirect: false,
    redirectOptions: {
      login: '/login',
      callback: '/confirm',
      exclude: []
    },
    // cookie の secure フラグ: 本番(https)のみ true。
    // ローカル dev は http://localhost のため secure:true だと Safari が Secure クッキーを保存せず、
    // PKCE の code_verifier クッキーが消えて OAuth コード交換が無言で失敗する (Chrome は localhost を例外的に許容)。
    // dev では secure:false にして全ブラウザで OAuth コールバックを成立させる。
    cookieOptions: {
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production'
    },
    types: '~/types/supabase.ts'
  }
})
