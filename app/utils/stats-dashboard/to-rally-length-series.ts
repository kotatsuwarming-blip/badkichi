/**
 * ラリー長チャート用シリーズ整形
 *
 * RallyLengthBin[] を echarts のコンボチャート（本数=棒 / サーブ側勝率=線）に渡しやすい
 * ラベル・系列配列へ変換する純関数。
 *
 * 関連設計: docs/design/stats-dashboard/architecture.md（StatsRallyLengthChart）
 * 関連要件: REQ-005 / ヒアリング2026-06-09
 * スタイル: セミコロンなし / no comma dangle
 */

import type { RallyLengthBin } from '~/types/stats-dashboard'

export interface RallyLengthSeries {
  /** ビンキー（選択状態の照合に使用） */
  keys: string[]
  /** ビンラベル（x 軸） */
  labels: string[]
  /** 本数（棒） */
  counts: number[]
  /** サーブ側勝率 %（線）。区間 0 件は null */
  winRatesPct: (number | null)[]
}

export function toRallyLengthSeries(bins: RallyLengthBin[]): RallyLengthSeries {
  return {
    keys: bins.map(b => b.bin.key),
    labels: bins.map(b => b.bin.label),
    counts: bins.map(b => b.rallies),
    winRatesPct: bins.map(b => (b.serveWinRate === null ? null : Math.round(b.serveWinRate * 100)))
  }
}
