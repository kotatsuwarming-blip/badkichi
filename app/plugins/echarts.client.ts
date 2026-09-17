/**
 * echarts.client.ts — vue-echarts のグローバル登録（CSR 限定・ツリーシェイク）
 *
 * stats-dashboard のチャート（StatsRateChart / StatsRallyLengthChart）で使う最小モジュールのみ
 * use() 登録し、VChart コンポーネントをアプリへ登録する。
 * `.client.ts` 命名で CSR 限定（ADR-010 / REQ-404）。チャートライブラリは vue-echarts（REQ-406）。
 *
 * 関連設計: docs/design/stats-dashboard/architecture.md
 * スタイル: セミコロンなし / no comma dangle
 */

import { use } from 'echarts/core'
import { BarChart, LineChart, ScatterChart } from 'echarts/charts'
import {
  GridComponent,
  LegendComponent,
  MarkAreaComponent,
  MarkLineComponent,
  TooltipComponent
} from 'echarts/components'
import { CanvasRenderer } from 'echarts/renderers'
import VChart from 'vue-echarts'

// ScatterChart / MarkLine / MarkArea は shot-stats（D 散布図・L セット推移）で使用
use([
  CanvasRenderer,
  BarChart,
  LineChart,
  ScatterChart,
  GridComponent,
  TooltipComponent,
  LegendComponent,
  MarkLineComponent,
  MarkAreaComponent
])

export default defineNuxtPlugin((nuxtApp) => {
  nuxtApp.vueApp.component('VChart', VChart)
})
