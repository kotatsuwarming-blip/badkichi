/**
 * SV 採点重み — 調整可能定数の唯一の置き場（REQ-002）
 *
 * 暫定値（🟡 実データ較正前提, interview-record Q2/Q7/Q9）:
 * - induce: ミス誘発（相手ミスの 1 本前の決定打）を決め(+1)と同額にするか
 * - setback: 遡り配点。決着側から同チーム 1 本前 / 2 本前（それ以前は 0）
 *
 * 較正手順: 注釈済み実試合で球種ランキングを見て、値を変えたときの順位の
 * 安定性とチームの試合感覚を照合して確定する（マイグレーション不要 — RPC は
 * 役割カウントのみ返す設計, REQ-401）。
 */
import type { SvRole, SvWeights } from '~/types/shot-value'

export const SV_WEIGHTS: SvWeights = { induce: 1.0, setback: [0.7, 0.5] }

/** 役割 → 点数（正 = 稼いだ / 負 = 失った） */
export function roleScore(role: SvRole, w: SvWeights = SV_WEIGHTS): number {
  switch (role) {
    case 'kime': return 1
    case 'yuhatsu': return w.induce
    case 'fuseki1': return w.setback[0]
    case 'fuseki2': return w.setback[1]
    case 'miss': return -1
    case 'yurushi1': return -w.setback[0]
    case 'yurushi2': return -w.setback[1]
  }
}
