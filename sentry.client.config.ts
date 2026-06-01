import * as Sentry from '@sentry/nuxt'

// @sentry/nuxt v10: このファイルは module により defineNuxtPlugin でラップされ、
// useRuntimeConfig() を呼べる (build/esm/module.js のクライアント設定ラップ参照)。
// dsn / environment は runtimeConfig.public 経由で env (NUXT_PUBLIC_SENTRY_DSN / NUXT_PUBLIC_ENV) から注入。
// dsn が空 (未設定) の場合 Sentry は no-op となり dev でも安全 (error-handling.md §8.2/§8.5)。
const config = useRuntimeConfig()

Sentry.init({
  dsn: config.public.sentry.dsn,
  environment: config.public.env,
  // Performance / Session Replay は Phase 2 で有効化 (error-handling.md §8.2)
  tracesSampleRate: 0,
  replaysSessionSampleRate: 0,
  replaysOnErrorSampleRate: 0
})
