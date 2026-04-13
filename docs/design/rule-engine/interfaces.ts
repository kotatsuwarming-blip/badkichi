/**
 * rule-engine 型定義
 *
 * 作成日: 2026-04-10
 * 更新日: 2026-04-13（増分計算アーキテクチャに変更）
 * 関連設計: architecture.md
 *
 * 信頼性レベル:
 * - 🔵 青信号: 要件定義書・設計文書・ユーザヒアリングを参考にした確実な型定義
 * - 🟡 黄信号: 要件定義書・設計文書・ユーザヒアリングから妥当な推測による型定義
 * - 🔴 赤信号: 要件定義書・設計文書・ユーザヒアリングにない推測による型定義
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
 * ラリー結果（applyRally への入力）
 * 🔵 PRD データモデル Rally + REQ-403
 *
 * rallyNumber は rule-engine の関心外（composable 層で管理）
 */
export interface RallyResult {
  /** 得点チーム。レットの場合は null */
  pointWinner: Team | null
  /** レットかどうか */
  isLet: boolean
}

// ========================================
// 状態型（rule-engine が管理する現在の状態）
// ========================================

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
  teamA: { left: PlayerId, right: PlayerId }
  teamB: { left: PlayerId, right: PlayerId }
}

/**
 * ゲームの現在の状態
 * 🔵 REQ-001〜003, REQ-005 + ユーザヒアリング 2026-04-13（増分計算方式）
 *
 * UI に表示する情報そのもの。applyRally / applyOverride で次の状態に遷移する。
 */
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

/**
 * セット結果（統計・記録用）
 * 🔵 ユーザヒアリング 2026-04-14「スコアもあっていい」
 */
export interface SetResult {
  winner: Team
  score: Score
}

// ========================================
// 公開関数の型シグネチャ
// ========================================

/**
 * セットの初期状態を生成する
 * 🔵 REQ-001 + ユーザヒアリング 2026-04-13
 *
 * @param config - セットの設定（目標ポイント、デュースルール、最初のサーブ権）
 * @param initialPositions - セット開始時の選手立ち位置（ダブルスなら4人分）
 * @returns セット開始時の状態（スコア 0-0、初期サーバー等）
 */
export type CreateInitialState = (
  config: SetConfig,
  initialPositions: SetPlayerPosition[]
) => GameState

/**
 * ラリー結果を適用して次の状態を返す
 * 🔵 REQ-001〜006, REQ-010, REQ-011 + ユーザヒアリング 2026-04-13
 *
 * - 得点の場合: スコア更新、サーブ権移動、位置更新
 * - レットの場合: 状態は変化しない
 *
 * @param state - 現在の状態
 * @param rally - ラリー結果（得点チーム or レット）
 * @returns 次の状態
 */
export type ApplyRally = (
  state: GameState,
  rally: RallyResult
) => GameState

/**
 * PositionOverride を適用して位置を反転する
 * 🔵 REQ-104, REQ-105 + ユーザヒアリング 2026-04-13
 *
 * 得点入力とは別の操作。画面の位置表示が映像と異なる場合に使用。
 * 該当チームの左右の選手を入れ替える（トグル）。
 *
 * @param state - 現在の状態
 * @param team - 左右を反転するチーム
 * @returns 位置が反転した状態
 */
export type ApplyOverride = (
  state: GameState,
  team: Team
) => GameState

/**
 * セットの勝者を判定する
 * 🔵 REQ-007, REQ-101〜103
 *
 * @returns 勝者のチーム。まだ決着がついていない場合は null
 */
export type DetermineSetWinner = (score: Score, config: SetConfig) => Team | null

// DetermineMatchWinner は削除
// 🔵 ユーザヒアリング 2026-04-14「どちらが勝ったかの情報は出す必要がないのでいらない」

// ========================================
// 信頼性レベルサマリー
// ========================================
/**
 * - 🔵 青信号: 14 件 (100%)
 * - 🟡 黄信号: 0 件 (0%)
 * - 🔴 赤信号: 0 件 (0%)
 *
 * 品質評価: 高品質
 */
