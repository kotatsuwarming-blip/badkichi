// https://nuxt.com/docs/api/configuration/nuxt-config
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
    enabled: true
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
    types: '~/types/supabase.ts'
  }
})
