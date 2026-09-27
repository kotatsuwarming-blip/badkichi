/**
 * shot-value TypeScript インターフェース設計
 *
 * 実装先: app/types/shot-value.ts + app/utils/shot-value/
 * 関連要件: REQ-001〜007, REQ-401
 * スタイル: セミコロンなし / no comma dangle（実装時に準拠）
 */

// ========================================
// RPC 行（stats_shot_value）
// ========================================

/** 採点役割（排他, REQ-001）。none はカウント外（n にのみ寄与） */
export type SvRole = 'kime' | 'yuhatsu' | 'fuseki1' | 'fuseki2' | 'miss' | 'yurushi1' | 'yurushi2'

/**
 * stats_shot_value の行（grain: 打者 × 球種 × hand × ゾーン）。
 * zone_row/zone_col は placement の origin と同一系
 * （0 = 自陣バック 〜 2 = ネット際 / 0 = 打者視点左）。null = 座標なし or 向き不明。
 */
export interface ShotValueRow {
  hit_player_id: string
  /** shot_type null は 'unknown' に COALESCE 済み（REQ-103） */
  shot_type: string
  hand: string | null
  zone_row: number | null
  zone_col: number | null
  /** この grain の総打数（分母） */
  n: number
  kime: number
  yuhatsu: number
  fuseki1: number
  fuseki2: number
  miss: number
  yurushi1: number
  yurushi2: number
}

// ========================================
// 重み定数（app/utils/shot-value/weights.ts）
// ========================================

/** 採点重み。実データ較正まで暫定値（REQ-002 🟡） */
export interface SvWeights {
  /** ミス誘発の重み w（決め=1 に対する比） */
  induce: number
  /** 遡り配点 [同チーム1本前 b1, 2本前 b2] */
  setback: [number, number]
}

export const SV_WEIGHTS: SvWeights = { induce: 1.0, setback: [0.7, 0.5] }

/** 役割 → 点数（重みから導出。score.ts 内部） */
export function roleScore(role: SvRole, w: SvWeights): number {
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

// ========================================
// クライアント集計（app/utils/shot-value/score.ts）
// ========================================

/** 合算後の役割カウント（ゾーン選択・フィルタ適用後） */
export type SvRoleCounts = Record<SvRole, number> & { n: number }

/** 収支集計（合計タイル・セル・内訳行の共通形） */
export interface SvAggregate {
  n: number
  /** +成分計 /100本（稼いだ） */
  earned100: number
  /** −成分計 /100本（失った。正の値で持つ） */
  lost100: number
  /** 収支 = earned100 - lost100 */
  sv100: number
  /** 95% 信頼区間の片幅（±この値）。score の標本分散から算出（REQ-006） */
  ci95: number
}

/** 球種別内訳の 1 行（REQ-005） */
export interface SvTypeBreakdownRow extends SvAggregate {
  shotType: string
  /** 役割別 /100本（積み上げセグメント値。ホバー表示にも使用） */
  per100: Record<SvRole, number>
  /** n < 5 → 薄表示 + 本数不足（REQ-007） */
  lowSample: boolean
}

/** コートセル 1 つ分（REQ-004） */
export interface SvZoneCell {
  zoneRow: number
  zoneCol: number
  n: number
  sv100: number
}

/** 画面全体のビュー状態 */
export interface SvViewState {
  /** 選択中ゾーン（'r0c0' 形式）。空 = コート全体（REQ-004） */
  selectedZones: Set<string>
  hitPlayerId: string | null
  hand: string | null
}

// 主要関数シグネチャ（score.ts）
// aggregateRoles(rows: ShotValueRow[], zones: Set<string> | null): SvRoleCounts
//   — zones=null(未選択) は zone null 行も含める / 選択中は zone 一致行のみ（REQ-101）
// toAggregate(counts: SvRoleCounts, w: SvWeights): SvAggregate
//   — mean = Σ(count×score)/n, var = Σ(count×score²)/n − mean², ci95 = 1.96×√(var/n)×100
// typeBreakdown(rows: ShotValueRow[], zones: Set<string> | null, w: SvWeights): SvTypeBreakdownRow[]
//   — n 降順（REQ-005）
// zoneCells(rows: ShotValueRow[], w: SvWeights): SvZoneCell[]  — 9 セル分
