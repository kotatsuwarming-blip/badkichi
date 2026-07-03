/**
 * useAnalytics — PostHog イベント送信の薄いラッパ (ADR-016 §4)
 *
 * $posthog は鍵未設定 (dev / 鍵配布前) や SSR では undefined。optional chaining で安全に no-op 化する。
 * Nuxt インスタンス外 (コンポーネント単体テスト等) では tryUseNuxtApp() が null を返すため、
 * useNuxtApp() のように throw せず no-op になる (計測は best-effort でアプリを壊さない)。
 * イベント名は ADR-016 の最小セットに限定し、型で縛って表記ゆれを防ぐ。
 *   - match_recorded: 試合を完了 (記録保存) した   → 第1/第2ゲートの中心
 *   - stats_viewed  : 統計ダッシュボードを開いた   → 第1ゲート (記録→統計ファネル)
 * identify (user/group) はプラグイン側の認証追随 + イベントの group_id プロパティで担う。
 */
export type AnalyticsEvent = 'match_recorded' | 'stats_viewed'

export function useAnalytics() {
  const nuxtApp = tryUseNuxtApp()

  function capture(event: AnalyticsEvent, properties?: Record<string, unknown>): void {
    nuxtApp?.$posthog?.capture(event, properties)
  }

  return { capture }
}
