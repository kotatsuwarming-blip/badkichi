/**
 * match-recording 型定義
 *
 * 作成日: 2026-06-05
 * 関連設計: architecture.md / dataflow.md
 * スタイル: セミコロンなし / no comma dangle（CLAUDE.md ESLint 規約）
 *
 * 信頼性レベル:
 * - 🔵 青信号: EARS要件・確定スキーマ・rule-engine 実装を参考にした確実な型
 * - 🟡 黄信号: 上記から妥当な推測による型
 * - 🔴 赤信号: 出典のない推測による型
 *
 * 方針:
 * - ドメイン型は camelCase。DB I/O 時に snake_case へマッピング（既存 useCreateMatch/useMatches 準拠）。
 * - rule-engine の公開型（Team/CourtSide/SetConfig/SetPlayerPosition/RallyResult/GameState）を再利用し再定義しない。
 * - 録画系テーブルは data-foundation 確定済を消費（新規スキーマ無し、REQ-406）。
 */

import type { Database } from '~/types/supabase'
import type {
  Team,
  CourtSide,
  PlayerId,
  SetConfig,
  SetPlayerPosition,
  GameState
} from '~/utils/rule-engine/types'

// ========================================
// 行 alias（確定スキーマの Row 型を参照）
// ========================================

type SetRow = Database['public']['Tables']['sets']['Row'] // 🔵 sets 定義
type RallyRow = Database['public']['Tables']['rallies']['Row'] // 🔵 rallies 定義
type OverrideType = Database['public']['Tables']['position_overrides']['Row']['override_type'] // 🔵 'swapped' | 'restored'

// ========================================
// セット設定・立ち位置（入力）
// ========================================

/**
 * セット設定入力。rule-engine SetConfig（targetPoints/enableDeuce/deucePointCap/firstServingTeam）
 * に DB 専用列（set_number / camera_near_team_at_start）を加えたもの。
 * 🔵 REQ-002 / sets スキーマ / rule-engine SetConfig
 */
export type SetSetupInput = SetConfig & {
  setNumber: number // 🔵 sets.set_number（採番は useSets の既存数 +1）
  cameraNearTeamAtStart: Team | null // 🔵 REQ-002 セット開始時1回（ヒアリング2026-06-05）。NULL 許容
}

/**
 * 初期立ち位置入力（4選手）。rule-engine SetPlayerPosition と同形。
 * 🔵 REQ-003 / set_player_positions スキーマ
 */
export type SetPositionInput = SetPlayerPosition // { playerId, team, position }

// ========================================
// ラリー denormalize 写像（GameState → rallies 列）
// ========================================

/**
 * ラリー行へ書き込む denormalize 値。ラリー開始時点で GameState から確定する部分。
 * 🔵 REQ-410 / ② B-7 / rallies スキーマ
 */
export interface RallyDenorm {
  servingTeam: Team // 🔵 ← GameState.servingTeam → serving_team
  serverPosition: CourtSide // 🔵 ← GameState.serverPosition → server_position
  serverPlayerId: PlayerId // 🔵 ← GameState.server → server_player_id
  receiverPlayerId: PlayerId // 🔵 ← GameState.receiver → receiver_player_id
  cameraNearTeam: Team | null // 🔵 ← sets.camera_near_team_at_start を carry（MVP セット単位）
}

/**
 * map-game-state.ts: GameState → RallyDenorm の純関数写像。
 * 🔵 REQ-410（denormalize 一貫性）。修正/override 時も同写像で上書きし二重管理しない。
 */
export type MapGameStateToRallyDenorm = (state: GameState, cameraNearTeam: Team | null) => RallyDenorm

/**
 * override_type 決定（純関数）: 当該チームの既存 override 回数の偶奇でラベルを決める。
 * 🔵 REQ-105（偶数回目=swapped / 奇数回目=restored）。engine へは applyOverride(team) を渡す。
 */
export type DecideOverrideType = (existingOverrideCount: number) => OverrideType

// ========================================
// 録画中の UI 状態（useRecordingSession が所有）
// ========================================

/**
 * 進行中ラリーのメモリ状態。rallyId は遅延生成（初ショット/得点時に確定）。
 * 🔵 architecture.md ラリー行ライフサイクル
 */
export interface CurrentRally {
  rallyNumber: number // 🔵 rallies.rally_number（セット内連番）
  rallyId: RallyRow['id'] | null // 🔵 遅延生成。null=未 insert
  shots: ShotDraft[] // 🔵 楽観追加されたショット（痕跡表示用）
  isPending: boolean // 🔵 スキップで未確定（EDGE-003）。true の間 engine 前進不可
}

/** 楽観追加されたショットのドラフト。🔵 REQ-005 / shots スキーマ */
export interface ShotDraft {
  shotId: Database['public']['Tables']['shots']['Row']['id'] | null // 🔵 楽観 insert 後に確定（undo で削除対象）
  shotNumber: number // 🔵 shots.shot_number（ラリー内連番）
  videoTimestampMs: number // 🔵 shots.video_timestamp_ms（getCurrentTimeMs）
  synced: boolean // 🟡 楽観書込の同期済みフラグ（失敗時 false で再試行導線）
}

/**
 * undo スタックの1ステップ。各記録操作で push し、直前 GameState スナップショットと DB 参照を保持。
 * undoLast() が pop して逆操作（行削除/復元 + GameState 復元）を行う。
 * 🔵 REQ-110（linear undo・現在セット内）。engine は前方関数のみのため巻き戻しは snapshot 復元で行う。
 */
export interface UndoStep {
  kind: 'shot' | 'point' | 'let' | 'skip' | 'override' // 🔵 REQ-110a/b/c
  prevGameState: GameState | null // 🔵 復元用スナップショット（shot は null=GameState 不変）
  rallyId: RallyRow['id'] | null // 🔵 対象ラリー
  /** 物理削除対象の行 id（shot.id / override.id）。point/let は rally を update で戻す 🔵 REQ-110a/c */
  rowId: string | null
  /** shot 取り消しで空になった遅延生成 rally も物理削除する場合 true 🔵 REQ-110a */
  deletesEmptyRally: boolean
  /** 楽観 insert がまだ未解決の場合、解決を待ってから削除（delete が insert を追い越さない）🔵 REQ-110d */
  pendingInsert: Promise<unknown> | null
}

/** ラリー履歴一覧の1行（read 射影）。🔵 REQ-009 / NFR-203 相当 */
export interface RallyHistoryItem {
  rallyNumber: RallyRow['rally_number'] // 🔵
  servingTeam: Team // 🔵 serving_team
  serverPlayerId: PlayerId // 🔵 server_player_id（表示は選手名解決）
  pointWinner: Team | null // 🔵 point_winner（null=レット/未確定）
  isLet: boolean // 🔵 is_let
  isPointConfirmed: boolean // 🔵 is_point_confirmed（未確定の明示）
  shotCount: number // 🔵 shots の件数（PRD §5.4 「Nショット」表示）
}

// ========================================
// useRecordingSession（集約オーケストレータ）
// ========================================

/**
 * 録画セッションの公開 API。GameState を所有し、操作別 composable を統合。
 * getCurrentTimeMs は page（useVideoPlayer.controls）から注入（テスト時はフェイク）。
 * 🔵 ヒアリング2026-06-05（useRecordingSession 集約）/ NFR-303
 */
export interface UseRecordingSessionReturn {
  /** 現在の rule-engine 状態（スコア/サーバー/レシーバー/サーバー位置/ポジション）。null=セット未設定 🔵 REQ-008 */
  gameState: Readonly<Ref<GameState | null>>
  /** 進行中ラリー 🔵 */
  currentRally: Readonly<Ref<CurrentRally | null>>
  /** ラリー履歴（現在セット）🔵 REQ-009 */
  history: Readonly<Ref<RallyHistoryItem[]>>
  /** セット番号（現在）🔵 */
  currentSetNumber: Readonly<Ref<number | null>>
  /** セット勝者検知（≠null で「次のセットへ」CTA）🔵 REQ-010 */
  setWinner: Readonly<Ref<Team | null>>
  /** 試合勝者（先取セット数到達）🟡 REQ-011（先取数ルールは実装時確定） */
  matchWinner: Readonly<Ref<Team | null>>

  // --- セットアップ（同期）---
  configureAndStartSet: (setup: SetSetupInput, positions: SetPositionInput[]) => Promise<ActionResult<SetRow['id']>> // 🔵 REQ-002/003
  advanceToNextSet: () => void // 🔵 REQ-107（先攻=前勝者を既定提示、入力は再度 configureAndStartSet）

  // --- ラリー記録（楽観/遅延）---
  recordShot: () => Promise<void> // 🔵 REQ-005（内部で getCurrentTimeMs、null は no-op EDGE-001）
  recordPoint: (team: Team) => Promise<void> // 🔵 REQ-006/007
  recordLet: () => Promise<void> // 🔵 REQ-102
  skipRally: () => Promise<void> // 🔵 REQ-103
  confirmSkipped: (team: Team) => Promise<void> // 🔵 REQ-104
  recordOverride: (team: Team) => Promise<void> // 🔵 REQ-105

  // --- 統一「取り消し」（linear undo・現在セット内）---
  /** 直近の記録操作を1つ戻す（shot/point/let/skip/override）。空なら no-op 🔵 REQ-110 */
  undoLast: () => Promise<void>
  /** 次に取り消す対象の文脈ラベル（UI 表示用）。null=取り消し対象なし 🔵 REQ-110（文脈ラベル） */
  undoLabelKey: Readonly<Ref<string | null>>

  /** 進行中の楽観書込が全て同期済みか（離脱前ガード表示用）🟡 不整合窓の可視化 */
  allSynced: Readonly<Ref<boolean>>
}

// ========================================
// 操作別 composable（Write / Read）の戻り型
// ========================================

/** 既存規約（useCreateMatch.ts）と同一の結果型。🔵 */
export interface ActionResult<T> {
  data: T | null
  error: unknown
}

/** 同期 Write の共通形（pending 付き）。🔵 useCreateMatch 準拠 */
export interface SyncWriteReturn<TInput, TData> {
  action: (input: TInput) => Promise<ActionResult<TData>>
  pending: Ref<boolean>
}

/**
 * 楽観 Write の共通形。即時にローカル反映し、戻りの promise は DB 反映の解決を表す。
 * 失敗時は ActionResult.error に詰め、呼び出し側（session）が toast + 未同期マーク。
 * 🔵 architecture.md 永続化（楽観）
 */
export interface OptimisticWriteReturn<TInput, TData> {
  action: (input: TInput) => Promise<ActionResult<TData>>
}

// 例: 具体 composable の戻り型
export type UseCreateSetReturn = SyncWriteReturn<SetSetupInput & { matchId: string }, SetRow['id']> // 🔵 REQ-002
export type UseUpdateRallyReturn = OptimisticWriteReturn<UpdateRallyInput, RallyRow['id']> // 🔵 REQ-006/103/106
// undo は物理削除（hard delete）。soft delete は使わない（REQ-110a/c、ユーザー方針2026-06-05）。
export type UseDeleteShotReturn = OptimisticWriteReturn<{ shotId: string }, true> // 🔵 REQ-110a（undo: shot 行を物理削除）
export type UseDeleteRallyReturn = OptimisticWriteReturn<{ rallyId: string }, true> // 🔵 REQ-110a（undo: 空 rally を物理削除）
export type UseDeleteOverrideReturn = OptimisticWriteReturn<{ overrideId: string }, true> // 🔵 REQ-110c（undo: override を物理削除）

/** rallies の update 入力（得点確定/スキップ/修正）。🔵 rallies スキーマ */
export interface UpdateRallyInput {
  rallyId: RallyRow['id'] // 🔵
  pointWinner: Team | null // 🔵 point_winner
  isLet: boolean // 🔵 is_let
  isPointConfirmed: boolean // 🔵 is_point_confirmed
}

// ========================================
// 録画対象の試合（read 射影）
// ========================================

/**
 * useMatchForRecording: matches を1件読み、VideoSource 構築材料 + 4選手ロスターへ。
 * 🔵 REQ-001 / REQ-004 / matches スキーマ
 */
export interface MatchForRecording {
  id: string // 🔵 matches.id
  name: string | null // 🔵 matches.name
  videoSourceType: 'youtube' | 'local' // 🔵 matches.video_source_type
  videoSourceUrl: string // 🔵 matches.video_source_url（youtube=URL/ID, local=ファイル名ラベル）
  roster: { playerId: PlayerId, name: string, team: Team }[] // 🔵 4選手（立ち位置入力の選択肢）
}

// ========================================
// 信頼性レベルサマリー
// ========================================
/**
 * - 🔵 青信号: 約44件 (95%) … UndoStep / undoLast / UseDeleteShotReturn を含む（REQ-110）
 * - 🟡 黄信号: 2件 (5%) … ShotDraft.synced / matchWinner（先取数ルールは実装時確定）
 * - 🔴 赤信号: 0件 (0%)
 *
 * 品質評価: 高品質（rule-engine 実装型 + 確定スキーマ Row 型を直接参照）
 */
