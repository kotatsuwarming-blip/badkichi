// ========================================
// 基本型
// ========================================

/** チーム識別子 */
export type Team = 'A' | 'B'

/** コート上の左右位置 */
export type CourtSide = 'left' | 'right'

/** 選手ID */
export type PlayerId = string

// ========================================
// 入力型（rule-engine に渡すデータ）
// ========================================

/** セットの設定 */
export interface SetConfig {
  /** 目標ポイント（例: 21, 15） */
  targetPoints: number
  /** デュースを有効にするか */
  enableDeuce: boolean
  /** デュース時の上限得点（例: 30）。enableDeuce が true の場合のみ使用 */
  deucePointCap: number
  /** このセットの最初のサーブ権を持つチーム */
  firstServingTeam: Team
}

/** セット開始時の選手立ち位置 */
export interface SetPlayerPosition {
  playerId: PlayerId
  team: Team
  position: CourtSide
}

/** ラリー結果（applyRally への入力） */
export interface RallyResult {
  /** 得点チーム。レットの場合は null */
  pointWinner: Team | null
  /** レットかどうか */
  isLet: boolean
}

// ========================================
// 状態型（rule-engine が管理する現在の状態）
// ========================================

/** スコア */
export interface Score {
  teamA: number
  teamB: number
}

/** チームのポジション（左右の選手配置） */
export interface TeamPositions {
  teamA: { left: PlayerId; right: PlayerId }
  teamB: { left: PlayerId; right: PlayerId }
}

/** ゲームの現在の状態 */
export interface GameState {
  /** 現在のスコア */
  score: Score
  /** サーブ権を持つチーム */
  servingTeam: Team
  /** サーバーの選手ID */
  server: PlayerId
  /** レシーバーの選手ID */
  receiver: PlayerId
  /** サーバーのコート位置（スコアの偶奇で決定） */
  serverPosition: CourtSide
  /** 各チームの現在のポジション */
  positions: TeamPositions
}

/** セット結果（試合勝者判定への入力） */
export interface SetResult {
  winner: Team
}
