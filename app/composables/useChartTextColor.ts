/**
 * useChartTextColor — グラフ(ECharts)の文字色をテーマ(ライト/ダーク)に追従させる。
 *
 * 背景: usability-test-01 (U-06)。当初グラフ文字が薄く読みづらい→濃色化したところ、
 *       ダークモードでは背景が暗く濃い文字が見えなくなった。テーマに応じて切替える。
 * 方針: Nuxt UI は <html> に 'dark' クラスを付与する。@nuxtjs/color-mode 由来の
 *       useColorMode はサブパス export が無くコンポーネント単体テストでモックしづらいため、
 *       DOM クラスを直接読む。SSR では document 不在のためライト既定で描画し、
 *       onMounted 後に補正、テーマ切替も MutationObserver で追従する。
 */
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'

const LIGHT = '#111827' // gray-900
const DARK = '#e5e7eb' // gray-200

export function useChartTextColor() {
  const isDark = ref(false)
  let observer: MutationObserver | null = null

  function read(): void {
    isDark.value = document.documentElement.classList.contains('dark')
  }

  onMounted(() => {
    read()
    observer = new MutationObserver(read)
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] })
  })

  onBeforeUnmount(() => {
    observer?.disconnect()
    observer = null
  })

  return computed(() => (isDark.value ? DARK : LIGHT))
}
