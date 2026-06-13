/**
 * stats-dashboard 型定義
 *
 * 作成日: 2026-06-09
 * 関連設計: docs/design/stats-dashboard/{architecture,dataflow,database-schema.sql,api-endpoints,interfaces.ts}
 * 関連要件: docs/spec/stats-dashboard/requirements.md
 * 型定義ソース: docs/design/stats-dashboard/interfaces.ts
 *
 * スタイル: セミコロンなし / no comma dangle（CLAUDE.md ESLint 規約）
 */

import type { Ref } from 'vue'
import type { VideoSource } from '~/types/video-playback'

// ========================================
// 基本型
// ========================================

/** チーム識別子（rule-engine と整合） 🔵 initial_schema rallies.serving_team */
export type Team = 'A' | 'B'

/** 集計の役割視点 🔵 REQ-003（サービス時 / レシーブ時） */
export type StatsRole = 'serve' | 'receive'

/** ダッシュボードのスコープ 🔵 REQ-001 / REQ-002 */
export type StatsScope
  = | { kind: 'match', matchId: string }
    | { kind: 'group', groupId: string }

// ========================================
// RPC 行（Postgres 集計の生返却。snake_case = DB 由来） 🔵 database-schema.sql
// ========================================

/** stats_player_rates の 1 行（選手別 母数・分子） 🔵 REQ-003 */
export interface PlayerRateRow {
  player_id: string
  serve_total: number
  serve_won: number
  receive_total: number
  receive_won: number
}

/** stats_pair_rates の 1 行（ペア別 母数・分子。player1_id < player2_id 正規化） 🔵 REQ-012 */
export interface PairRateRow {
  player1_id: string
  player2_id: string
  serve_total: number
  serve_won: number
  receive_total: number
  receive_won: number
}

/** stats_rally_length の 1 行（ラリー長別 本数分布 + サーブ側勝数。shot_count >= 1） 🔵 REQ-005 */
export interface RallyLengthRow {
  shot_count: number
  rallies: number
  serve_won: number
}

/**
 * stats_rallies の 1 行（ラリーテーブル / クロスフィルタ / 再生用）
 * 全ライブラリー（レット・未確定含む）。再生のため試合の動画ソースを同梱。
 * 🔵 REQ-006 / REQ-007 / REQ-104 / database-schema.sql stats_rallies
 */
export interface RallyRow {
  rally_id: string
  match_id: string
  match_name: string
  set_number: number
  rally_number: number
  serving_team: Team
  server_player_id: string
  receiver_player_id: string
  point_winner: Team | null
  is_let: boolean
  is_point_confirmed: boolean
  shot_count: number
  video_start_timestamp_ms: number | null
  video_source_type: 'youtube' | 'local'
  video_source_url: string
}

// ========================================
// クライアント派生型（compute-* utils の出力）
// ========================================

/** 得点率 1 件（母数併記必須 NFR-201、0 除算は rate=null） 🔵 REQ-202 / NFR-201 / EDGE-001 */
export interface RateValue {
  /** 0..1。母数 0 のとき null（「-」表示） */
  rate: number | null
  /** 母数（対象ラリー数）。NFR-201 で必ず併記 */
  denominator: number
  /** 分子（得点したラリー数） */
  numerator: number
}

/** 選手別の serve/receive 得点率 🔵 REQ-003 */
export interface PlayerRate {
  playerId: string
  playerName: string
  serve: RateValue
  receive: RateValue
}

/**
 * ペア別の serve/receive 得点率（player_id の組で識別） 🔵 REQ-012 / REQ-004
 * チーム A/B はフィルタ・出力に用いない（ヒアリング2026-06-09）。
 */
export interface PairRate {
  player1Id: string
  player2Id: string
  pairLabel: string
  serve: RateValue
  receive: RateValue
}

/** ラリー長分布 + 勝率の 1 点（ショット数粒度。RPC 生値由来） 🔵 REQ-005 */
export interface RallyLengthPoint {
  shotCount: number
  rallies: number
  serveWinRate: number | null
}

/**
 * ラリー長ビン定義（チャートの区間）。max=null は「それ以上」。
 * 🔵 ヒアリング2026-06-09（区間で表示・絞り込み）
 */
export interface ShotBin {
  key: string
  label: string
  min: number
  max: number | null
}

/** 既定ビン（境界は調整可。1〜3 / 4〜7 / 8〜12 / 13+） 🔵 ヒアリング2026-06-09 */
export const RALLY_LENGTH_BINS: readonly ShotBin[] = [
  { key: '1-3', label: '1〜3 打', min: 1, max: 3 },
  { key: '4-7', label: '4〜7 打', min: 4, max: 7 },
  { key: '8-12', label: '8〜12 打', min: 8, max: 12 },
  { key: '13+', label: '13 打以上', min: 13, max: null }
]

/** ビン単位に集約したラリー長分布 + 勝率（チャート表示・複数選択用） 🔵 ヒアリング2026-06-09 */
export interface RallyLengthBin {
  bin: ShotBin
  rallies: number
  serveWinRate: number | null
}

// ========================================
// クロスフィルタ 🔵 REQ-010 / REQ-012
// ========================================

/**
 * クロスフィルタ状態。チャート選択で更新し、ラリーテーブルへ連動。
 * すべて未指定（null / 空配列）= 絞り込みなし。
 * 🔵 REQ-010 / REQ-012
 */
export interface StatsFilter {
  /** 1 選手で絞る（role と併用＝サーブ時/レシーブ時） 🔵 REQ-004 */
  playerId: string | null
  /** ペアで絞る（同一の 2 選手＝player_id の組）。playerId と排他。role と連動 🔵 REQ-012 */
  pair: { player1Id: string, player2Id: string } | null
  /** 役割（サーブ時 / レシーブ時）。未指定は両方。選手・ペアと連動 🔵 REQ-003 */
  role: StatsRole | null
  /** ラリー長ビンで絞る（複数選択可・和集合）。空配列 = フィルタなし 🔵 ヒアリング2026-06-09 */
  shotBinKeys: string[]
}

/** ラリー長の絞り込み範囲（OR 結合）。bin から導出 🔵 ヒアリング2026-06-09 */
export interface ShotRange {
  min: number
  /** null = 上限なし */
  max: number | null
}

/** stats_rallies のサーバー側フィルタ引数（Group 横断の絞り込み後取得） 🔵 REQ-010 */
export interface RallyQueryArgs {
  serverPlayerId?: string | null
  receiverPlayerId?: string | null
  pairPlayer1Id?: string | null
  pairPlayer2Id?: string | null
  /** 選手・ペア絞り込みの役割連動（serve/receive） 🔵 ヒアリング2026-06-09 */
  role?: StatsRole | null
  /** ラリー長ビンの和集合範囲（OR）。jsonb として RPC へ渡す 🔵 ヒアリング2026-06-09 */
  shotRanges?: ShotRange[] | null
  limit?: number
  offset?: number
}

// ========================================
// composable 戻り値 🔵 ADR-007 / useAsyncData 既存パターン
// ========================================

/** 集計結果（試合単位 / Group 横断 共通） 🔵 */
export interface StatsAggregate {
  playerRates: PlayerRate[]
  pairRates: PairRate[]
  /** ラリー長は既定ビンへ集約済み（チャート直消費, ヒアリング2026-06-09） */
  rallyLength: RallyLengthBin[]
  /** 確定ラリーが 0 件（空状態判定用） 🔵 REQ-103 */
  isEmpty: boolean
}

/** useMatchStats / useGroupStats の戻り値（useAsyncData 準拠） 🔵 */
export interface UseStatsReturn {
  data: Ref<StatsAggregate | null>
  pending: Ref<boolean>
  error: Ref<unknown>
  refresh: () => Promise<void>
}

/** useMatchRallies / useGroupRallies の戻り値 🔵 */
export interface UseRalliesReturn {
  data: Ref<RallyRow[] | null>
  pending: Ref<boolean>
  error: Ref<unknown>
  refresh: () => Promise<void>
}

/** useStatsFilter の戻り値（クロスフィルタ状態 + 操作） 🔵 REQ-010 / REQ-012 */
export interface UseStatsFilterReturn {
  filter: Ref<StatsFilter>
  /** チャート選択 → フィルタ設定（同一選択の再クリックでトグル解除） */
  setFilter: (patch: Partial<StatsFilter>) => void
  clear: () => void
  /** per-match: 読み込み済みラリー行へクライアント絞り込みを適用 */
  apply: (rows: RallyRow[]) => RallyRow[]
  /** group: サーバー側フェッチ用の引数へ変換 */
  toQueryArgs: () => RallyQueryArgs
}

// ========================================
// コンポーネント契約（props） 🔵
// ========================================

/** StatsVideoPane の props（既存 VideoPlayer を再利用） 🔵 REQ-007 / REQ-104 */
export interface StatsVideoPaneProps {
  /** 現在の動画ソース（Group 横断では選択ラリーに応じて切替） */
  source: VideoSource
  /** timeline に重ねるラリー区切りの ms 配列 */
  rallyMarkersMs: number[]
  /**
   * 準備完了後に自動シークする目標 ms（ソース切替後の宣言的シーク, REQ-104）。
   * null は自動シークなし。値変更 or 再生準備完了で 1 回シークする。
   */
  autoSeekMs?: number | null
}
