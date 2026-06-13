/**
 * stats-dashboard 型定義
 *
 * 作成日: 2026-06-08
 * 関連設計: architecture.md / dataflow.md / database-schema.sql / api-endpoints.md
 * 関連要件: docs/spec/stats-dashboard/requirements.md
 *
 * スタイル: セミコロンなし / no comma dangle（CLAUDE.md ESLint 規約）
 *
 * 信頼性レベル:
 * - 🔵 青信号: 要件定義書・設計文書・ユーザヒアリング・既存スキーマを参考にした確実な型
 * - 🟡 黄信号: 妥当な推測による型
 * - 🔴 赤信号: 出典のない推測による型
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

/**
 * stats_player_rates の 1 行（選手別 母数・分子）
 * 🔵 REQ-003 / database-schema.sql stats_player_rates
 */
export interface PlayerRateRow {
  player_id: string // 🔵 rallies.server_player_id / receiver_player_id
  serve_total: number // 🔵 確定ラリーでサーバーだった数（母数）
  serve_won: number // 🔵 そのうちサーブ側が得点した数（分子）
  receive_total: number // 🔵 確定ラリーでレシーバーだった数（母数）
  receive_won: number // 🔵 そのうちレシーブ側が得点した数（分子）
}

/**
 * stats_pair_rates の 1 行（ペア別 母数・分子）
 * 🔵 REQ-012 / database-schema.sql stats_pair_rates
 * player1_id < player2_id（無向ペアの正規化順） 🔵
 */
export interface PairRateRow {
  player1_id: string // 🔵 ペア構成選手（正規化: 小さい uuid）
  player2_id: string // 🔵 ペア構成選手（正規化: 大きい uuid）
  serve_total: number // 🔵 ペアの所属チームが serving だった確定ラリー数
  serve_won: number // 🔵 そのうちペア側が得点した数
  receive_total: number // 🔵 ペアの所属チームが receiving だった確定ラリー数
  receive_won: number // 🔵 そのうちペア側が得点した数
}

/**
 * stats_rally_length の 1 行（ラリー長別 本数分布 + サーブ側勝数）
 * 🔵 REQ-005 / ヒアリング2026-06-08（本数分布 + 勝率）/ database-schema.sql stats_rally_length
 * shot_count = 0 は除外済み（EDGE-102） 🔵
 */
export interface RallyLengthRow {
  shot_count: number // 🔵 ラリーの shot 本数（>= 1）
  rallies: number // 🔵 その本数の確定ラリー数（分布）
  serve_won: number // 🔵 そのうちサーブ側が得点した数（勝率 = serve_won / rallies）
}

/**
 * stats_rallies の 1 行（ラリーテーブル / クロスフィルタ / 再生用）
 * 🔵 REQ-006 / REQ-007 / REQ-104 / database-schema.sql stats_rallies
 * 全ライブラリー（レット・未確定含む）。再生のため試合の動画ソースを同梱（Group 横断のソース切替用）。
 */
export interface RallyRow {
  rally_id: string // 🔵 rallies.id
  match_id: string // 🔵 再生時の動画ソース解決（REQ-104）
  match_name: string // 🔵 Group 横断テーブルの表示
  set_number: number // 🔵 sets.set_number
  rally_number: number // 🔵 rallies.rally_number
  serving_team: Team // 🔵 rallies.serving_team
  server_player_id: string // 🔵 rallies.server_player_id
  receiver_player_id: string // 🔵 rallies.receiver_player_id
  point_winner: Team | null // 🔵 rallies.point_winner（レット/未確定は null）
  is_let: boolean // 🔵 rallies.is_let
  is_point_confirmed: boolean // 🔵 rallies.is_point_confirmed
  shot_count: number // 🔵 shots(count)（ラリー長）
  video_start_timestamp_ms: number | null // 🔵 rallies（null はジャンプ不可 EDGE-103）
  video_source_type: 'youtube' | 'local' // 🔵 matches.video_source_type（ソース切替）
  video_source_url: string // 🔵 matches.video_source_url
}

// ========================================
// クライアント派生型（compute-* utils の出力） 🔵
// ========================================

/** 得点率 1 件（母数併記必須 NFR-201、0 除算は rate=null） 🔵 REQ-202 / NFR-201 */
export interface RateValue {
  /** 0..1。母数 0 のとき null（「-」表示） 🔵 EDGE-001 */
  rate: number | null
  /** 母数（対象ラリー数）。NFR-201 で必ず併記 🔵 */
  denominator: number
  /** 分子（得点したラリー数） 🔵 */
  numerator: number
}

/** 選手別の serve/receive 得点率（チャート/ドリルダウン用） 🔵 REQ-003 */
export interface PlayerRate {
  playerId: string
  playerName: string // 🔵 players.name を UI で解決
  serve: RateValue
  receive: RateValue
}

/**
 * ペア別の serve/receive 得点率（player_id の組で識別） 🔵 REQ-012
 * - per-match: その試合の 2 ペア（= 旧「チーム視点」。A/B ラベルではなく実際の 2 人）
 * - group: 横断で同じ 2 人が組んだラリーの累計
 * ドリルダウン元（ペア → 個人）。team A/B はフィルタ・出力に用いない（ヒアリング2026-06-09）。
 */
export interface PairRate {
  player1Id: string // 🔵 正規化: 小さい uuid
  player2Id: string // 🔵 正規化: 大きい uuid
  pairLabel: string // 🔵 「田中 / 佐藤」等 UI で解決
  serve: RateValue
  receive: RateValue
}

/** ラリー長分布 + 勝率の 1 点（ショット数粒度。RPC 生値由来） 🔵 REQ-005 */
export interface RallyLengthPoint {
  shotCount: number // 🔵 ラリー長
  rallies: number // 🔵 本数
  serveWinRate: number | null // 🔵 サーブ側勝率 = serve_won / rallies（0 件は null）
}

/**
 * ラリー長ビン定義（チャートの区間）。境界は調整可能な定数として一元管理。
 * 🔵 ヒアリング2026-06-09（個別ショット数ではなく区間で表示・絞り込み）
 * max=null は「それ以上」（上限なし）。
 */
export interface ShotBin {
  key: string // 🔵 例: '1-3' / '13+'（選択状態のキー）
  label: string // 🔵 UI 表示（例: '1〜3 打'）
  min: number // 🔵 下限（含む）
  max: number | null // 🔵 上限（含む）。null = それ以上
}

/** 既定ビン（境界は調整可。ヒアリング例 1〜3 / 4〜7 / 8〜12 / 13+ に準拠） 🔵 ヒアリング2026-06-09 */
export const RALLY_LENGTH_BINS: readonly ShotBin[] = [
  { key: '1-3', label: '1〜3 打', min: 1, max: 3 },
  { key: '4-7', label: '4〜7 打', min: 4, max: 7 },
  { key: '8-12', label: '8〜12 打', min: 8, max: 12 },
  { key: '13+', label: '13 打以上', min: 13, max: null }
]

/** ビン単位に集約したラリー長分布 + 勝率（チャート表示・複数選択用） 🔵 ヒアリング2026-06-09 */
export interface RallyLengthBin {
  bin: ShotBin // 🔵 区間定義
  rallies: number // 🔵 区間内の本数（棒）
  serveWinRate: number | null // 🔵 区間内のサーブ側勝率（線）。0 件は null
}

// ========================================
// クロスフィルタ 🔵 REQ-010 / REQ-012
// ========================================

/**
 * クロスフィルタ状態。チャート選択で更新し、ラリーテーブルへ連動。
 * 🔵 REQ-010（連動絞り込み）/ REQ-012（選手 or ペア）
 * すべて未指定（null）= 絞り込みなし。
 */
export interface StatsFilter {
  /** 1 選手で絞る（role と併用＝サーブ時/レシーブ時） 🔵 REQ-004 */
  playerId: string | null
  /** ペアで絞る（同一の 2 選手＝player_id の組）。playerId と排他。role と連動（サーブ側/レシーブ側） 🔵 REQ-012 / ヒアリング2026-06-09 */
  pair: { player1Id: string, player2Id: string } | null
  /** 役割（サーブ時 / レシーブ時）。未指定は両方。選手・ペアと連動 🔵 REQ-003 / ヒアリング2026-06-09 */
  role: StatsRole | null
  /**
   * ラリー長ビンで絞る（複数選択可）。選択ビンの**和集合**でラリーを絞る。
   * 空配列 = ラリー長フィルタなし。例: ['1-3','4-7'] → 1〜7 打。
   * 🔵 ヒアリング2026-06-09（区間・複数選択）
   */
  shotBinKeys: string[]
}

/** ラリー長の絞り込み範囲（OR 結合）。bin から導出 🔵 ヒアリング2026-06-09 */
export interface ShotRange {
  min: number
  /** null = 上限なし（「それ以上」） */
  max: number | null
}

/** stats_rallies のサーバー側フィルタ引数（Group 横断の絞り込み後取得） 🔵 REQ-010 / api-endpoints.md */
export interface RallyQueryArgs {
  serverPlayerId?: string | null
  receiverPlayerId?: string | null
  pairPlayer1Id?: string | null
  pairPlayer2Id?: string | null
  /** 選手・ペア絞り込みの役割連動（serve/receive。指定時のみ有効） 🔵 ヒアリング2026-06-09 */
  role?: StatsRole | null
  /** ラリー長ビンの和集合範囲（OR）。jsonb として RPC へ渡す 🔵 ヒアリング2026-06-09 */
  shotRanges?: ShotRange[] | null
  limit?: number // 既定 200
  offset?: number // 既定 0
}

// ========================================
// composable 戻り値 🔵 ADR-007 / useAsyncData 既存パターン
// ========================================

/** 集計結果（試合単位 / Group 横断 共通）。useAsyncData で包む 🔵 */
export interface StatsAggregate {
  playerRates: PlayerRate[] // 🔵 REQ-003（選手別）
  pairRates: PairRate[] // 🔵 REQ-012 / REQ-004（per-match=その試合の2ペア / group=ペア累計。ペア→個人ドリルダウン元）
  rallyLength: RallyLengthPoint[] // 🔵 REQ-005
  /** 確定ラリーが 0 件（空状態判定用） 🔵 REQ-103 */
  isEmpty: boolean
}

/**
 * useMatchStats / useGroupStats の戻り値（useAsyncData 準拠）
 * 🔵 既存 useMatches / useMatchSummary と同型
 */
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

/**
 * useStatsFilter の戻り値（クロスフィルタ状態 + 操作）
 * 🔵 REQ-010 / REQ-012
 */
export interface UseStatsFilterReturn {
  filter: Ref<StatsFilter>
  /** チャート選択 → フィルタ設定（同一選択の再クリックでトグル解除） 🔵 */
  setFilter: (patch: Partial<StatsFilter>) => void
  clear: () => void
  /** per-match: 読み込み済みラリー行へクライアント絞り込みを適用 🔵 */
  apply: (rows: RallyRow[]) => RallyRow[]
  /** group: サーバー側フェッチ用の引数へ変換 🔵 */
  toQueryArgs: () => RallyQueryArgs
}

// ========================================
// 純関数ヘルパー（実装は app/utils/stats-dashboard/） 🔵
// ========================================
//
// computePlayerRate(total: number, won: number): RateValue
//   母数 0 → { rate: null, denominator: 0, numerator: 0 }（0 除算回避, EDGE-001） 🔵
//
// filterRallies(rows: RallyRow[], filter: StatsFilter): RallyRow[]
//   選手 / ペア（いずれも player_id・role 連動）/ ラリー長ビン（複数選択の和集合）で絞り込み（per-match クライアント, REQ-010） 🔵
//   ※ チーム A/B はフィルタ軸にしない。serve/receive 判定の内部利用のみ（ヒアリング2026-06-09）
//   - ペア × role: 各 rally の試合チーム構成からペアの所属チームを判定し、serve=ペアが serving 側 / receive=受け側 🔵 ヒアリング2026-06-09
//   - shot_count = 0 はラリー長ビンに含めない（テーブルには出るが長さ分析からは除外, EDGE-102）
//
// binsToRanges(binKeys: string[], bins: readonly ShotBin[]): ShotRange[]
//   選択ビンキー → OR 結合の範囲配列（隣接ビンは結合してもよい） 🔵 ヒアリング2026-06-09
//
// toRallyLengthBins(rows: RallyLengthRow[], bins: readonly ShotBin[]): RallyLengthBin[]
//   ショット数粒度の RPC 行を区間へ集約し 本数(棒) + サーブ側勝率(線) 化（区間内 0 件は serveWinRate=null） 🔵 ヒアリング2026-06-09

// ========================================
// コンポーネント契約（props/emits） 🔵
// ========================================

/** StatsVideoPane の props（既存 VideoPlayer を再利用） 🔵 REQ-007 */
export interface StatsVideoPaneProps {
  /** 現在の動画ソース（Group 横断では選択ラリーに応じて切替, REQ-104） 🔵 */
  source: VideoSource
  /** timeline に重ねるラリー区切りの ms 配列（video-playback の汎用スロット, REQ-009） 🔵 */
  rallyMarkersMs: number[]
}

// ========================================
// 信頼性レベルサマリー
// ========================================
/**
 * - 🔵 青信号: 約 95%
 * - 🟡 黄信号: 約 5%（limit/offset 既定値・shotCount フィルタ拡張）
 * - 🔴 赤信号: 0 件
 *
 * 品質評価: 高品質
 */
