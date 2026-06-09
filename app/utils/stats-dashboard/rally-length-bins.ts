/**
 * ラリー長ビン集約ユーティリティ
 *
 * ショット数粒度の RPC 行（RallyLengthRow）を区間（ShotBin）へ集約し、
 * チャート用のビン分布 + サーブ側勝率を生成する。複数選択ビン → OR 範囲変換も提供。
 *
 * 関連設計: docs/design/stats-dashboard/interfaces.ts
 * 関連要件: REQ-005 / ヒアリング2026-06-09（区間表示・複数選択）/ EDGE-102
 * スタイル: セミコロンなし / no comma dangle
 */

import { RALLY_LENGTH_BINS } from '~/types/stats-dashboard'
import type { RallyLengthBin, RallyLengthRow, ShotBin, ShotRange } from '~/types/stats-dashboard'

/** shot_count が bin の範囲 [min, max]（max=null は上限なし）に入るか */
function inBin(shotCount: number, bin: ShotBin): boolean {
  return shotCount >= bin.min && (bin.max === null || shotCount <= bin.max)
}

/**
 * ショット数粒度の集計行を区間へ集約する。
 * 区間内本数 = rallies 合計、サーブ側勝率 = serve_won 合計 / rallies 合計（0 件は null）。
 * shot_count=0 は RPC 側で既に除外されている（EDGE-102）。
 */
export function toRallyLengthBins(
  rows: RallyLengthRow[],
  bins: readonly ShotBin[] = RALLY_LENGTH_BINS
): RallyLengthBin[] {
  return bins.map((bin) => {
    const inRange = rows.filter(r => inBin(r.shot_count, bin))
    const rallies = inRange.reduce((acc, r) => acc + r.rallies, 0)
    const won = inRange.reduce((acc, r) => acc + r.serve_won, 0)
    return {
      bin,
      rallies,
      serveWinRate: rallies > 0 ? won / rallies : null
    }
  })
}

/**
 * 選択ビンキー → OR 結合の範囲配列。
 * 該当ビンが無い（空選択）場合は空配列（＝ラリー長フィルタなし）。
 */
export function binsToRanges(
  binKeys: string[],
  bins: readonly ShotBin[] = RALLY_LENGTH_BINS
): ShotRange[] {
  return bins
    .filter(bin => binKeys.includes(bin.key))
    .map(bin => ({ min: bin.min, max: bin.max }))
}
