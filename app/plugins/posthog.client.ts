/**
 * posthog.client.ts — PostHog (product analytics / session replay) の CSR 初期化 (ADR-016)
 *
 * 方針:
 *   - `.client.ts` 命名で CSR 限定 (ADR-010 / posthog-js はブラウザ専用)。echarts.client.ts と同様。
 *   - key 未設定 (dev / 鍵配布前) は init せず即 return → $posthog を provide しない。
 *     useAnalytics 側の optional chaining で安全に no-op 化する (Sentry DSN 空と同思想)。
 *   - Nuxt は SPA 遷移のため自動 pageview が初回しか飛ばない。router.afterEach で明示送信する。
 *   - 認証状態に追随して identify / reset。作者・DF アカウントは opt_out で送信自体を止める (§3)。
 *   - セッションリプレイ有効 (§3 の中心機能)。入力値は全マスク。表示テキスト (選手名等) の
 *     マスク方針は PostHog ダッシュボードで要確認 (§5)。
 */
import posthog from 'posthog-js'

export default defineNuxtPlugin(() => {
  const config = useRuntimeConfig()
  const { key, host, excludeEmails } = config.public.posthog

  // 鍵が無ければ計測基盤を起動しない (no-op)。$posthog は undefined のままとなる。
  if (!key) return

  posthog.init(key, {
    api_host: host,
    // pageview は posthog-js に任せる (既定 capture_pageview:true で初回ロード + SPA history 遷移を自動送信)。
    // 手動 router.afterEach は初回ロードで発火せず初回 pageview を取り逃すため使わない (併用は二重計上)。
    // セッションリプレイ: 入力値は全マスク (§5)。
    session_recording: {
      maskAllInputs: true
    },
    persistence: 'localStorage+cookie'
  })

  // dev 限定デバッグ: 送信ログをコンソールに出し、`window.posthog` から触れるようにする。
  // (本番ビルドでは import.meta.dev=false で無効。計測挙動には影響しない)
  if (import.meta.dev) {
    posthog.debug()
    Object.assign(window, { posthog })
  }

  // 認証状態に追随。作者・DF アカウントは送信停止、それ以外は identify。
  const user = useSupabaseUser()
  const excluded = excludeEmails
    .split(',')
    .map(s => s.trim().toLowerCase())
    .filter(Boolean)

  watch(user, (u) => {
    if (!u) {
      posthog.reset()
      return
    }
    const email = (u.email ?? '').toLowerCase()
    // 作者・DF は自分の操作でメトリクスが濁るため送信自体を止める (§3)。
    if (email && excluded.includes(email)) {
      posthog.opt_out_capturing()
      return
    }
    posthog.opt_in_capturing()
    // uid は user.sub (user.id ではない、既存 composable と同じ規約)。
    posthog.identify(u.sub, { email })
  }, { immediate: true })

  return {
    provide: {
      posthog
    }
  }
})
