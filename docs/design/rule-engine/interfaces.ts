/**
 * rule-engine 型定義
 *
 * 作成日: 2026-04-10
 * 関連設計: architecture.md
 *
 * 信頼性レベル:
 * - 🔵 青信号: 要件定義書・PRD・ユーザヒアリングを参考にした確実な型定義
 * - 🟡 黄信号: 要件定義書・PRD・ユーザヒアリングから妥当な推測による型定義
 * - 🔴 赤信号: 要件定義書・PRD・ユーザヒアリングにない推測による型定義
 */

// ========================================
// 基本型
// ========================================

/** チーム識別子 🔵 PRD データモデルより */
export type Team = 'A' | 'B'

/** コート上の左右位置 🔵 PRD F-03「偶数=右コート、奇数=左コート」 */
export type CourtSide = 'left' | 'right'

/** 選手ID 🔵 PRD データモデル Player.id */
export type PlayerId = string

// ========================================
// 入力型（rule-engine に渡すデータ）
// ========================================

/**
 * セットの設定
 * 🔵 REQ-103 + ユーザヒアリング「得点も21や15などのバリエーション」
 * 🔵 ユーザヒアリング 2026-04-12「デュースあり/なし + 上限得点の2パラメータ」
 */
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

/**
 * セット開始時の選手立ち位置
 * 🔵 PRD データモデル SetPlayerPosition
 */
export interface SetPlayerPosition {
  playerId: PlayerId
  team: Team
  position: CourtSide
}

/**
 * ラリー情報（rule-engine への入力）
 * 🔵 PRD データモデル Rally + REQ-403
 */
export interface Rally {
  /** セット内の連番（1始まり） */
  rallyNumber: number
  /** 得点チーム。レットの場合は null */
  pointWinner: Team | null
  /** レットかどうか */
  isLet: boolean
}

/**
 * PositionOverride（左右入れ替わり）
 * 🔵 REQ-104/105 + ユーザヒアリング 2026-04-10「トグル方式」
 *
 * swapped / restored の区別はなく、毎回トグル（反転）として扱う。
 * 同じチームに2回オーバーライドすると元に戻る。
 */
export interface PositionOverride {
  /** このラリーからオーバーライドが適用される */
  rallyNumber: number
  /** どちらのチームで起きたか */
  team: Team
}

// ========================================
// 出力型（rule-engine が返すデータ）
// ========================================

/**
 * 各ラリーの計算結果
 * 🔵 REQ-001 の出力仕様
 */
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

/**
 * 次のサーバー情報
 * 🟡 REQ-001 の「ラリー配列が空の場合」を含むため、RallyState とは別に定義
 */
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

/**
 * スコア
 * 🔵 REQ-005
 */
export interface Score {
  teamA: number
  teamB: number
}

/**
 * チームのポジション（左右の選手配置）
 * 🔵 REQ-003 + REQ-104
 */
export interface TeamPositions {
  teamA: { left: PlayerId; right: PlayerId }
  teamB: { left: PlayerId; right: PlayerId }
}

/**
 * セット結果（試合勝者判定への入力）
 * 🟡 REQ-008 から推測
 */
export interface SetResult {
  winner: Team
}

// ========================================
// 公開関数の型シグネチャ
// ========================================

/**
 * セット内の全ラリーの状態を計算する
 * 🔵 REQ-001〜006, REQ-104/105
 *
 * @param config - セットの設定（目標ポイント、デュースルール、最初のサーブ権）
 * @param initialPositions - セット開始時の選手立ち位置（ダブルスなら4人分）
 * @param rallies - ラリー結果の配列（全ラリー確定済み）
 * @param overrides - PositionOverride の配列
 * @returns 各ラリーの計算結果
 */
export type ComputeRallyStates = (
  config: SetConfig,
  initialPositions: SetPlayerPosition[],
  rallies: Rally[],
  overrides: PositionOverride[]
) => RallyState[]

/**
 * 次のラリーのサーバー情報を返す
 * 🔵 REQ-001〜003
 *
 * ラリー配列が空の場合（セット開始直後）は初期位置に基づく最初のサーバーを返す。
 */
export type ComputeNextServer = (
  config: SetConfig,
  initialPositions: SetPlayerPosition[],
  rallies: Rally[],
  overrides: PositionOverride[]
) => NextServerInfo

/**
 * 現在のスコアを計算する
 * 🔵 REQ-005, REQ-006
 *
 * レット（isLet: true）はスコアに加算しない。
 */
export type ComputeScore = (rallies: Rally[]) => Score

/**
 * セットの勝者を判定する
 * 🔵 REQ-007, REQ-101〜103
 *
 * @returns 勝者のチーム。まだ決着がついていない場合は null
 */
export type DetermineSetWinner = (score: Score, config: SetConfig) => Team | null

/**
 * 試合の勝者を判定する
 * 🟡 REQ-008（3セットマッチ、先に2セット取ったチームが勝利）
 *
 * @returns 勝者のチーム。まだ決着がついていない場合は null
 */
export type DetermineMatchWinner = (setResults: SetResult[]) => Team | null

/**
 * セットが終了しているか判定する
 * 🟡 REQ-007 から導出
 */
export type IsSetComplete = (score: Score, config: SetConfig) => boolean

// ========================================
// 信頼性レベルサマリー
// ========================================
/**
 * - 🔵 青信号: 17 件 (81%)
 * - 🟡 黄信号: 4 件 (19%)
 * - 🔴 赤信号: 0 件 (0%)
 *
 * 品質評価: 高品質
 */
