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

import type { VideoSource } from '~/types/video-playback'

// ========================================
// 基本型
// ========================================

/** チーム識別子（rule-engine と整合） 🔵 initial_schema rallies.serving_team */
export type Team = 'A' | 'B'

/** 集計の役割視点 🔵 REQ-003（サービス時 / レシーブ時） */
export type StatsRole = 'serve' | 'receive'

/** サービスポジション（偶数点=right / 奇数点=left）。rallies.server_position 由来 🔵 受け入れ2026-06-09 */
export type ServePosition = 'right' | 'left'

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
  match_date: string | null
  set_number: number
  rally_number: number
  serving_team: Team
  /** サービスポジション（偶数=right/奇数=left） 🔵 受け入れ2026-06-09 */
  server_position: ServePosition
  server_player_id: string
  receiver_player_id: string
  point_winner: Team | null
  is_let: boolean
  is_point_confirmed: boolean
  shot_count: number
  video_start_timestamp_ms: number | null
  video_source_type: 'youtube' | 'local'
  video_source_url: string
  /** ラリー開始時の確定スコア（同一セット内・自分より前の確定得点を積算） 🔵 U-06 */
  score_a: number
  score_b: number
  /** ラリー時間 ms（最初〜最後のショットの経過。ショット 0/1 本・時刻なしは null） 🔵 U-06 */
  rally_duration_ms: number | null
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

/**
 * 既定ビン（境界は調整可。1 / 2 / 3〜7 / 8〜12 / 13+） 🔵 ヒアリング2026-06-09 + U-06(2026-06-16)
 * 1打=サーブで決着（サーブミス/エース）、2打=レシーブで決着。ラリー成立（3打以上）と
 * 分けることで「サーブ周りで得しているか」が読めるようにする（川島提案）。
 * ラベルの \n は echarts のカテゴリ軸で2行表示になる（半幅表示で隣と重ならない短文にする）。
 */
export const RALLY_LENGTH_BINS: readonly ShotBin[] = [
  { key: '1', label: '1 打\nサーブ決着', min: 1, max: 1 },
  { key: '2', label: '2 打\nレシーブ決着', min: 2, max: 2 },
  { key: '3-7', label: '3〜7 打', min: 3, max: 7 },
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
// グローバルフィルタ + ドリルダウン 🔵 受け入れ2026-06-09
// ========================================

/** 分析対象（グローバル）。未選択は全体（全選手サマリ） 🔵 受け入れ2026-06-09 */
export type StatsEntity
  = | { kind: 'all' }
    | { kind: 'player', playerId: string }
    | { kind: 'pair', player1Id: string, player2Id: string }

/** 対象モード（選手別/ペア別）。全タブ共通の最上位フィルタ（2026-08-08 フィルタ再編） */
export type SubjectMode = 'player' | 'pair'

/**
 * グローバルフィルタ（チャート外で設定）: 対象モード（選手別/ペア別）+ 選手/ペア選択 +
 * セット + 試合期間。選択が未完（null / 同一選手ペア）の間は全員比較（overview）扱い。
 * dateFrom/dateTo は YYYY-MM-DD（null = 制限なし）。excludedMatchIds は期間内から個別除外する試合。
 * 🔵 受け入れ2026-06-09 + フィルタ再編2026-08-08（モード・選手・セットを同一階層の全タブ共通に）
 */
export interface StatsGlobalFilter {
  subjectMode: SubjectMode
  playerId: string | null
  pair1Id: string | null
  pair2Id: string | null
  /** セット絞り込み（全タブ共通）。null = 全セット */
  setNumber: number | null
  dateFrom: string | null
  dateTo: string | null
  excludedMatchIds: string[]
}

/**
 * ドリルダウン: サービスポジション（右=偶/左=奇）+ ペアからの個人フォーカス + ラリー長ビン。
 * null / 空配列 = その軸では絞らない。役割（サーブ/レシーブ）はグラフの 2 系列として常時表示する。
 * 🔵 受け入れ2026-06-09/10（残すのは右/左の選択。ペア→個人ドリルダウン）
 */
export interface StatsDrilldown {
  /** 役割（サーブ/レシーブ）。棒クリックで選択、非選択側はグラフで薄く表示。null = 両方 */
  role: StatsRole | null
  /** サービスポジション（右=偶/左=奇）。null = 両方 */
  position: ServePosition | null
  /** ペア選択時に個人へドリルダウン（その選手にフォーカス）。null = ペア両名 */
  memberId: string | null
  /** ラリー長ビン（複数選択・和集合） */
  shotBinKeys: string[]
}

/** ラリー長の絞り込み範囲（OR 結合）。bin から導出 🔵 ヒアリング2026-06-09 */
export interface ShotRange {
  min: number
  /** null = 上限なし */
  max: number | null
}

/** 試合メタ（期間フィルタ UI・対象表示用） 🔵 受け入れ2026-06-09 */
export interface MatchMeta {
  id: string
  name: string
  matchDate: string | null
}

// ========================================
// 集計結果型
// ========================================

/** 全体オーバービュー集計（entity=all 時の選手別/ペア別一覧） 🔵 */
export interface StatsOverview {
  playerRates: PlayerRate[]
  pairRates: PairRate[]
}

/** RPC 集計をまとめた値（buildAggregate の戻り） 🔵 */
export interface StatsAggregate {
  playerRates: PlayerRate[]
  pairRates: PairRate[]
  rallyLength: RallyLengthBin[]
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
