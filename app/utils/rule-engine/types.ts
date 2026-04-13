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

/** ラリー情報（rule-engine への入力） */
export interface Rally {
  /** セット内の連番（1始まり） */
  rallyNumber: number
  /** 得点チーム。レットの場合は null */
  pointWinner: Team | null
  /** レットかどうか */
  isLet: boolean
}

/** PositionOverride（左右入れ替わり） */
export interface PositionOverride {
  /** このラリーからオーバーライドが適用される */
  rallyNumber: number
  /** どちらのチームで起きたか */
  team: Team
}

// ========================================
// 出力型（rule-engine が返すデータ）
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

/** 各ラリーの計算結果 */
export interface RallyState {
  rallyNumber: number
  /** サーバーの選手ID */
  server: PlayerId
  /** レシーバーの選手ID */
  receiver: PlayerId
  /** サーバーのコート位置 */
  serverPosition: CourtSide
  /** このラリー時点でのスコア（このラリーの得点を含む） */
  scoreAfter: Score
  /** サーブ権を持つチーム */
  servingTeam: Team
  /** このラリーの各チームの実際のポジション */
  positions: TeamPositions
}

/** 次のサーバー情報 */
export interface NextServerInfo {
  /** サーブ権を持つチーム */
  servingTeam: Team
  /** サーバーの選手ID */
  server: PlayerId
  /** サーバーのコート位置 */
  serverPosition: CourtSide
  /** レシーバーの選手ID */
  receiver: PlayerId
  /** 現在のスコア */
  currentScore: Score
  /** 各チームの現在のポジション */
  positions: TeamPositions
}

/** セット結果（試合勝者判定への入力） */
export interface SetResult {
  winner: Team
}
