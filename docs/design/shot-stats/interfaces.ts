/**
 * shot-stats 型定義
 *
 * 作成日: 2026-08-03
 * 関連設計: architecture.md / database-schema.sql
 * 実装配置想定: app/types/shot-stats.ts（RPC 行型・派生型）
 *               既存の app/types/shot-annotation.ts（ShotType/EndReason/Hand 等）と
 *               app/types/stats-dashboard.ts（StatsGlobalFilter/RallyRow 等）を再利用する
 *
 * 信頼性レベル:
 * - 🔵 青信号: 要件定義・実装済み型・RPC 定義（database-schema.sql）に準拠
 * - 🟡 黄信号: 妥当な推測
 * - 🔴 赤信号: 出典のない推測
 */

// CourtPoint（座標型）も実装時に '~/types/shot-annotation' から import して純関数で使用する
import type { ShotType, EndReason, Hand, OutDirection } from '~/types/shot-annotation' // 🔵 実装済み
import type { Team } from '~/utils/rule-engine/types' // 🔵 実装済み

// ========================================
// RPC 行型（database-schema.sql の RETURNS TABLE と 1:1）
// ========================================

/** stats_annotation_coverage の行 🔵 */
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

/** stats_shot_types の行（grain: 打者 × 球種 × hand） 🔵 */
export interface ShotTypeStatRow {
  hit_player_id: string | null // null = 打者未注釈
  shot_type: ShotType | null // null = 種別未注釈
  hand: Hand | null // null = 未判定（フォア扱い禁止, REQ-102）
  shots: number
  serve_first_shots: number
  serve_won: number
  decisive_won: number
  miss_lost: number
  rallies: number
  rallies_won: number
}

/** stats_shot_zones の行（選手視点ミラー済み・クランプ済み） 🔵 */
export interface ShotZoneRow {
  hit_player_id: string
  shot_type: ShotType | null
  zone_row: number // 0（自陣バック）〜 zones*2-1（相手コート奥）
  zone_col: number // 0（左）〜 zones-1（右）
  shots: number
}

/** stats_rally_endings の行（確定ラリー 1 行） 🔵 */
export interface RallyEndingRow {
  rally_id: string
  match_id: string
  set_number: number
  rally_number: number
  serving_team: Team
  point_winner: Team
  end_reason: EndReason | null
  last_hitter_team: Team | null // null = 最終打者未注釈（REQ-108）
  decisive_shot_type: ShotType | null
  decisive_hit_player_id: string | null
  land_x: number | null
  land_y: number | null
  out_direction: OutDirection | null
  team_a_player1_id: string
  team_a_player2_id: string
  team_b_player1_id: string
  team_b_player2_id: string
}

/** stats_rally_tempo の行（確定ラリー 1 行） 🔵 */
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

/** 決着 4 分類 + 不明 🔵 REQ-005 / EDGE-105 */
export type EndingCategory
  = | 'ace' // エースで獲得（body / floor×最終打者=勝者）
    | 'opponent_error' // 相手ミスで獲得（net / not_over / service_fault / floor×最終打者=敗者）
    | 'own_error' // 自ミスで失点
    | 'opponent_ace' // 被エースで失点
export type EndingCategoryOrUnknown = EndingCategory | 'unknown' // 🔵 unknown/未注釈は別掲（REQ-108）

/** 決着分類の集計（選手/ペア視点） 🔵 */
export interface EndingBreakdown {
  subject: StatsSubject
  won: Record<'ace' | 'opponent_error', number>
  lost: Record<'own_error' | 'opponent_ace', number>
  unknown: number
  totalRallies: number // 母数併記用（NFR-201）
  annotatedRallies: number
}

/** 分析対象（既存 StatsGlobalFilter.entity と同形） 🔵 stats-dashboard 実装 */
export type StatsSubject
  = | { kind: 'all' }
    | { kind: 'player', playerId: string }
    | { kind: 'pair', player1Id: string, player2Id: string }

/** ゾーンセル（SVG コート図の描画単位） 🔵 REQ-007/011 */
export interface ZoneCell {
  row: number
  col: number
  count: number
  ratio: number // セル内最大値に対する比（ヒート色算出用の補助フィールド。ヒアリング2026-08-04 了承）
}

/** J: 局面キー 🔵 REQ-013/014（3 分割 + 接戦） */
export type PhaseKey = 'early' | 'mid' | 'late'
export interface PhaseRate {
  phase: PhaseKey
  total: number
  won: number
  clutchTotal: number // 終盤かつ 2 点差以内（延長含む）
  clutchWon: number
}

/** K: テンポ measure 🔵 REQ-016（切替トグル） */
export type TempoMeasure = 'avg' | 'last3'
/** K: 適格ラリーのテンポ値（分布描画用） 🔵 REQ-015/106 */
export interface TempoSample {
  rallyId: string
  won: boolean // 選択中の視点チームが取ったか
  avgShotsPerSec: number // (shot_count - 1) / (duration_ms / 1000)
  last3IntervalMs: number | null
}

/** L: セット推移の 1 点 🔵 REQ-017 */
export interface WormPoint {
  rallyId: string
  rallyNumber: number
  diff: number // 視点チームから見た得点差（+1/−1 の累積）
  scoreA: number // タップ時のスコア表示用（stats_rallies の score_a/b）
  scoreB: number
  videoStartMs: number | null
}
/** L: 連取/連失区間（3 連続以上をハイライト） 🔵 REQ-018 */
export interface Run {
  startIndex: number
  endIndex: number
  kind: 'won' | 'lost'
  length: number
}

// ========================================
// 純関数シグネチャ（実装配置: app/utils/shot-stats/*.ts）
// ========================================
// mirror.ts 🔵 REQ-105:
//   mirrorPoint(p: CourtPoint, subjectTeam: Team, pointTeam: Team): CourtPoint
//   zoneOf(p: CourtPoint, zones?: number): { row: number, col: number }  // クランプ算入（EDGE-101）
// endings.ts 🔵 REQ-005/104（derive.ts の deriveInOut / decisiveShotIndex と同一規則, REQ-406）:
//   classifyEnding(row: RallyEndingRow, subjectTeamOf: (matchId: string) => Team): EndingCategoryOrUnknown
//   buildEndingBreakdown(rows: RallyEndingRow[], subject: StatsSubject): EndingBreakdown
//   landZoneCells(rows: RallyEndingRow[], subject: StatsSubject, kind: 'won' | 'lost', zones?: number): ZoneCell[]
//     // land 座標 null 時は out_direction フォールバック（REQ-103, ゾーン外の帯として集計）
// phase.ts 🔵 REQ-013/014:
//   phaseOf(scoreA: number, scoreB: number): PhaseKey          // リード側 0-7 / 8-14 / 15-
//   isClutch(scoreA: number, scoreB: number): boolean          // 終盤かつ 2 点差以内（延長含む）
//   buildPhaseRates(rows: RallyRow[], subject: StatsSubject): PhaseRate[]
// tempo.ts 🔵 REQ-015/016/106:
//   isTempoEligible(row: RallyTempoRow): boolean  // timed_count===shot_count && shot_count>=2 && duration_ms>0
//   toTempoSamples(rows: RallyTempoRow[], subject: StatsSubject): { samples: TempoSample[], excluded: number }
//   densitySeries(samples: TempoSample[], measure: TempoMeasure): { won: [number, number][], lost: [number, number][] }
// momentum.ts 🔵 REQ-017/018:
//   buildWorm(rows: RallyRow[], subjectTeam: Team): WormPoint[]   // レット・未確定は事前除外済み前提
//   detectRuns(points: WormPoint[], minLength?: number): Run[]    // 既定 3（REQ-018）
//   intervalMarkIndex(points: WormPoint[]): number | null         // 11 点到達ラリーの位置
// coverage.ts 🔵 REQ-002/003:
//   sumCoverage(rows: AnnotationCoverageRow[]): AnnotationCoverageRow  // スコープ合計（match_id は無視）
//   coverageRate(n: number, d: number): number | null                  // d=0 は null（EDGE-001）

// ========================================
// RPC 呼び出し（stats-rpc.ts の fn union へ追加） 🔵 実装済みパターン
// ========================================
export type ShotStatsRpcFn
  = | 'stats_annotation_coverage'
    | 'stats_shot_types'
    | 'stats_shot_zones'
    | 'stats_rally_endings'
    | 'stats_rally_tempo'

// ========================================
// 信頼性レベルサマリー
// - 🔵 青信号: 100%（RPC 定義・確定要件・実装済み型に準拠。補助フィールドは 2026-08-04 了承）
// - 🟡 黄信号: 0 件 / 🔴 赤信号: 0 件
// 品質評価: 高品質
// ========================================
