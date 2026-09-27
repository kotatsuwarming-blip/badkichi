/**
 * shot-value 型定義（SV = ショット別ポイント収支）
 *
 * 関連設計: docs/design/shot-value/interfaces.ts
 * 関連要件: REQ-001〜007, REQ-401
 */

/** 採点役割（1 ショットに高々 1 つ, REQ-001） */
export type SvRole = 'kime' | 'yuhatsu' | 'fuseki1' | 'fuseki2' | 'miss' | 'yurushi1' | 'yurushi2'

export const SV_ROLES: readonly SvRole[] = ['kime', 'yuhatsu', 'fuseki1', 'fuseki2', 'miss', 'yurushi1', 'yurushi2']

/**
 * stats_shot_value の行（grain: 打者 × 球種 × hand × ゾーン）。
 * zone_row: 0 = 自陣バック 〜 2 = ネット際 / zone_col: 0 = 打者視点左。
 * null = 座標なし or camera_near_team null（ゾーン選択中は対象外, REQ-101）。
 */
export interface ShotValueRow {
  hit_player_id: string
  shot_type: string
  hand: string | null
  zone_row: number | null
  zone_col: number | null
  n: number
  kime: number
  yuhatsu: number
  fuseki1: number
  fuseki2: number
  miss: number
  yurushi1: number
  yurushi2: number
}

/** 採点重み。実データ較正まで暫定値（REQ-002 🟡） */
export interface SvWeights {
  /** ミス誘発の重み（決め = 1 に対する比） */
  induce: number
  /** 遡り配点 [同チーム 1 本前, 2 本前] */
  setback: [number, number]
}

/** 合算後の役割カウント */
export interface SvRoleCounts {
  n: number
  kime: number
  yuhatsu: number
  fuseki1: number
  fuseki2: number
  miss: number
  yurushi1: number
  yurushi2: number
}

/** 収支集計（合計タイル・セル・内訳行の共通形, REQ-003/006） */
export interface SvAggregate {
  n: number
  /** +成分計 /100本（稼いだ） */
  earned100: number
  /** −成分計 /100本（失った。正の値で持つ） */
  lost100: number
  /** 収支 = earned100 − lost100 */
  sv100: number
  /** 95% 信頼区間の片幅（± この値） */
  ci95: number
}

/** 球種別内訳の 1 行（REQ-005/007） */
export interface SvTypeBreakdownRow extends SvAggregate {
  shotType: string
  /** 役割別 /100本（積み上げセグメント値） */
  per100: Record<SvRole, number>
  /** n < 5 → 薄表示 + 本数不足 */
  lowSample: boolean
}

/** コートセル 1 つ分（REQ-004） */
export interface SvZoneCell {
  zoneRow: number
  zoneCol: number
  n: number
  sv100: number
}

/** ゾーンキー（'r0c0' 形式） */
export function zoneKeyOf(row: number, col: number): string {
  return `r${row}c${col}`
}
