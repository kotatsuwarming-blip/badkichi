/**
 * shot-stats 型定義
 *
 * RPC 行型（supabase/migrations/20260805150000_shot_stats_read_functions.sql の
 * RETURNS TABLE と 1:1）と、クライアント純関数の派生型。
 *
 * 関連設計: docs/design/shot-stats/interfaces.ts
 * スタイル: セミコロンなし / no comma dangle
 */

import type { ShotType, EndReason, Hand, OutDirection } from '~/types/shot-annotation'
import type { Team } from '~/utils/rule-engine/types'

// ========================================
// RPC 行型
// ========================================

/** stats_annotation_coverage の行（試合ごと 1 行） */
export interface AnnotationCoverageRow {
  match_id: string
  shots_total: number
  shots_typed: number
  shots_pointed: number
  shots_handed: number
  shots_attributed: number
  rallies_total: number
  rallies_ended: number
  rallies_fully_timed: number
}

/** stats_shot_types の行（grain: 打者 × 球種 × hand） */
export interface ShotTypeStatRow {
  /** null = 打者未注釈 */
  hit_player_id: string | null
  /** null = 種別未注釈 */
  shot_type: ShotType | null
  /** null = 未判定（フォア扱い禁止, REQ-102） */
  hand: Hand | null
  shots: number
  serve_first_shots: number
  serve_won: number
  decisive_won: number
  miss_lost: number
  rallies: number
  rallies_won: number
}

/** stats_shot_zones の行（選手視点ミラー済み・クランプ済み） */
export interface ShotZoneRow {
  hit_player_id: string
  shot_type: ShotType | null
  /** 0（自陣バック）〜 zones*2-1（相手コート奥） */
  zone_row: number
  /** 0（打者視点左）〜 zones-1（右） */
  zone_col: number
  shots: number
}

/** stats_shot_placement の行（grain: 打者 × 球種 × 打点セル × 配球先セル） */
export interface ShotPlacementRow {
  hit_player_id: string
  shot_type: ShotType | null
  /** 自陣半面 0=バック側 〜 zones-1=ネット側 */
  origin_row: number
  origin_col: number
  /** 相手半面 0=ネット側 〜 zones-1=バック側 */
  dest_row: number
  dest_col: number
  shots: number
}

/** F: 配球先セル（球種内訳つき, ヒアリング2026-08-08） */
export interface PlacementDestCell extends ZoneCell {
  breakdown: { type: ShotType | null, count: number }[]
}

/** stats_serve_types の行（grain: サーバー × 1打目種別 × ポジション） */
export interface ServeTypeStatRow {
  server_player_id: string
  /** 1 打目の注釈（null = 未注釈） */
  shot_type: ShotType | null
  server_position: 'right' | 'left'
  total: number
  won: number
}

/** stats_rally_endings の行（確定ラリー 1 行） */
export interface RallyEndingRow {
  rally_id: string
  match_id: string
  set_number: number
  rally_number: number
  serving_team: Team
  point_winner: Team
  end_reason: EndReason | null
  /** null = 最終打者未注釈（REQ-108） */
  last_hitter_team: Team | null
  decisive_shot_type: ShotType | null
  decisive_hit_player_id: string | null
  land_x: number | null
  land_y: number | null
  out_direction: OutDirection | null
  /** カメラ手前チーム（座標の向き解決に使用。null = 向き不明 → 落下点は集計不能） */
  camera_near_team: Team | null
  team_a_player1_id: string
  team_a_player2_id: string
  team_b_player1_id: string
  team_b_player2_id: string
}

/** stats_rally_tempo の行（確定ラリー 1 行） */
export interface RallyTempoRow {
  rally_id: string
  match_id: string
  set_number: number
  rally_number: number
  serving_team: Team
  point_winner: Team
  shot_count: number
  timed_count: number
  duration_ms: number | null
  last3_avg_interval_ms: number | null
  team_a_player1_id: string
  team_a_player2_id: string
  team_b_player1_id: string
  team_b_player2_id: string
}

// ========================================
// 派生型（クライアント純関数の入出力, REQ-407）
// ========================================

/** 決着 4 分類（REQ-005） */
export type EndingCategory
  = | 'ace' // エースで獲得（body / floor×最終打者=勝者）
    | 'opponent_error' // 相手ミスで獲得（net / not_over / service_fault / floor×最終打者=敗者）
    | 'own_error' // 自ミスで失点
    | 'opponent_ace' // 被エースで失点

/** unknown / 未注釈は別掲（REQ-108 / EDGE-105） */
export type EndingCategoryOrUnknown = EndingCategory | 'unknown'

/** 分析対象（既存 StatsGlobalFilter.entity と同形） */
export type StatsSubject
  = | { kind: 'all' }
    | { kind: 'player', playerId: string }
    | { kind: 'pair', player1Id: string, player2Id: string }

/** 決着分類の集計（選手/ペア視点） */
export interface EndingBreakdown {
  won: { ace: number, opponent_error: number }
  lost: { own_error: number, opponent_ace: number }
  unknown: number
  /** 母数併記用（NFR-201）: 対象の確定ラリー総数 */
  totalRallies: number
  /** end_reason 注釈済みのラリー数 */
  annotatedRallies: number
}

/** A: 対象（選手/ペア）ごとの決着内訳（entity=all は選手ごとに 1 エントリ） */
export interface EndingEntry {
  subjectId: string
  label: string
  breakdown: EndingBreakdown
}

/** A: 決定打球種ランキングの 1 行（REQ-006。null 種別は「未注釈」, REQ-108） */
export interface DecisiveRankRow {
  shotType: ShotType | null
  count: number
}

/** A: 落下点ゾーン集計の結果（座標 null は out_direction フォールバック, REQ-103） */
export interface LandZoneResult {
  cells: ZoneCell[]
  outFallback: { side: number, back: number, both: number }
  /** 座標も out_direction も無い決着数 */
  unlocated: number
}

/** ゾーンセル（SVG コート図の描画単位） */
export interface ZoneCell {
  row: number
  col: number
  count: number
  /** セル内最大値に対する比（ヒート色算出用） */
  ratio: number
}

/** J: 局面キー（序盤 0-7 / 中盤 8-14 / 終盤 15-。リード側基準, REQ-014） */
export type PhaseKey = 'early' | 'mid' | 'late'

/** J: 局面別の得点率素材 */
export interface PhaseRate {
  phase: PhaseKey
  total: number
  won: number
  /** 接戦 = 終盤かつ 2 点差以内（延長含む） */
  clutchTotal: number
  clutchWon: number
}

/** K: テンポ measure（切替トグル, REQ-016） */
export type TempoMeasure = 'avg' | 'last3'

/** K: 適格ラリーのテンポ値（分布描画用, REQ-015/106） */
export interface TempoSample {
  rallyId: string
  /** 選択中の視点チームが取ったか（null = 視点なし = 対象全体） */
  won: boolean | null
  /** (shot_count - 1) / (duration_ms / 1000) 打/秒 */
  avgShotsPerSec: number
  /** ラスト 3 打の 2 間隔平均（ms）。3 本未満は null */
  last3IntervalMs: number | null
}

/**
 * ラリー展開タブの統合行（stats_rallies × stats_rally_tempo を rally_id でマージ。
 * tempo 側は確定ラリーのみ返すため、マージ結果も確定ラリーのみ = REQ-101 充足）
 */
export interface FlowRally {
  rallyId: string
  matchId: string
  setNumber: number
  rallyNumber: number
  servingTeam: Team
  pointWinner: Team
  scoreA: number
  scoreB: number
  videoStartMs: number | null
  shotCount: number
  timedCount: number
  durationMs: number | null
  last3Ms: number | null
  teamA: [string, string]
  teamB: [string, string]
}

/** J: 対象（選手/ペア）ごとの局面別得点率（entity=all は選手ごとに 1 エントリ） */
export interface PhaseRateEntry {
  subjectId: string
  label: string
  rates: PhaseRate[]
}

/** L: セット推移の 1 点（REQ-017） */
export interface WormPoint {
  rallyId: string
  rallyNumber: number
  /** 視点チームから見た得点差（+1/−1 の累積） */
  diff: number
  scoreA: number
  scoreB: number
  videoStartMs: number | null
}

/** L: 連取/連失区間（3 連続以上をハイライト, REQ-018） */
export interface Run {
  startIndex: number
  endIndex: number
  kind: 'won' | 'lost'
  length: number
}
