/**
 * match-recording 型定義
 *
 * 関連設計: docs/design/match-recording/architecture.md / interfaces.ts
 * スタイル: セミコロンなし / no comma dangle（CLAUDE.md ESLint 規約）
 *
 * 方針:
 * - ドメイン型は camelCase。DB I/O 時に snake_case へマッピング（既存 useCreateMatch/useMatches 準拠）。
 * - rule-engine の公開型（Team/CourtSide/PlayerId/SetConfig/SetPlayerPosition/GameState）を再利用し再定義しない。
 * - 録画系テーブルは data-foundation 確定済を消費（新規スキーマ無し、REQ-406）。
 */

import type { Ref } from 'vue'
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

type SetRow = Database['public']['Tables']['sets']['Row']
type RallyRow = Database['public']['Tables']['rallies']['Row']
type ShotRow = Database['public']['Tables']['shots']['Row']
type OverrideType = Database['public']['Tables']['position_overrides']['Row']['override_type']

// ========================================
// セット設定・立ち位置（入力）
// ========================================

/**
 * セット設定入力。rule-engine SetConfig（targetPoints/enableDeuce/deucePointCap/firstServingTeam）
 * に DB 専用列（set_number / camera_near_team_at_start）を加えたもの。REQ-002。
 */
export type SetSetupInput = SetConfig & {
  setNumber: number
  cameraNearTeamAtStart: Team | null
}

/** 初期立ち位置入力（4選手）。rule-engine SetPlayerPosition と同形。REQ-003。 */
export type SetPositionInput = SetPlayerPosition

/** セット概要（useSets の射影）。採番・再開・決着判定に使う。REQ-002/010。 */
export type SetSummary = SetSetupInput & {
  id: SetRow['id']
  winner: Team | null
}

// ========================================
// ラリー denormalize 写像（GameState → rallies 列）
// ========================================

/** ラリー行へ書き込む denormalize 値。ラリー開始時点で GameState から確定する部分。REQ-410。 */
export interface RallyDenorm {
  servingTeam: Team
  serverPosition: CourtSide
  serverPlayerId: PlayerId
  receiverPlayerId: PlayerId
  cameraNearTeam: Team | null
}

/** map-game-state.ts: GameState → RallyDenorm の純関数写像。REQ-410。 */
export type MapGameStateToRallyDenorm = (state: GameState, cameraNearTeam: Team | null) => RallyDenorm

/** override_type 決定（純関数）: 既存 override 回数の偶奇（偶=swapped / 奇=restored）。REQ-105。 */
export type DecideOverrideType = (existingOverrideCount: number) => OverrideType

// ========================================
// 録画中の UI 状態（useRecordingSession が所有）
// ========================================

/** 楽観追加されたショットのドラフト。REQ-005。 */
export interface ShotDraft {
  shotId: ShotRow['id'] | null
  shotNumber: number
  videoTimestampMs: number
  synced: boolean
}

/** 進行中ラリーのメモリ状態。rallyId は遅延生成（初ショット/得点時に確定）。 */
export interface CurrentRally {
  rallyNumber: number
  rallyId: RallyRow['id'] | null
  shots: ShotDraft[]
  isPending: boolean
}

/**
 * undo スタックの1ステップ。各記録操作で push し、直前 GameState スナップショットと DB 参照を保持。
 * undoLast() が pop して逆操作（物理削除/復元 + GameState 復元）を行う。REQ-110。
 */
export interface UndoStep {
  kind: 'shot' | 'point' | 'let' | 'skip' | 'override'
  prevGameState: GameState | null
  rallyId: RallyRow['id'] | null
  rowId: string | null
  deletesEmptyRally: boolean
  pendingInsert: Promise<unknown> | null
}

/** ラリー履歴一覧の1行（read 射影）。REQ-009。 */
export interface RallyHistoryItem {
  rallyNumber: RallyRow['rally_number']
  servingTeam: Team
  serverPlayerId: PlayerId
  pointWinner: Team | null
  isLet: boolean
  isPointConfirmed: boolean
  shotCount: number
  /** 該当ラリーの動画開始位置 (ms)。[▶] ジャンプに使う。null=動画アラインメントなし。REQ-009。 */
  videoStartTimestampMs: number | null
}

// ========================================
// 操作別 composable（Write / Read）の戻り型
// ========================================

/** 既存規約（useCreateMatch.ts）と同一の結果型。 */
export interface ActionResult<T> {
  data: T | null
  error: unknown
}

/** 同期 Write の共通形（pending 付き）。useCreateMatch 準拠。 */
export interface SyncWriteReturn<TInput, TData> {
  action: (input: TInput) => Promise<ActionResult<TData>>
  pending: Ref<boolean>
}

/** 楽観 Write の共通形。即時ローカル反映し、戻り promise は DB 反映の解決を表す。 */
export interface OptimisticWriteReturn<TInput, TData> {
  action: (input: TInput) => Promise<ActionResult<TData>>
}

/** rallies の update 入力（得点確定/スキップ/修正）。 */
export interface UpdateRallyInput {
  rallyId: RallyRow['id']
  pointWinner: Team | null
  isLet: boolean
  isPointConfirmed: boolean
}

export type UseCreateSetReturn = SyncWriteReturn<SetSetupInput & { matchId: string }, SetRow['id']>
export type UseUpdateRallyReturn = OptimisticWriteReturn<UpdateRallyInput, RallyRow['id']>
// undo は物理削除（hard delete）。soft delete は使わない（REQ-110a/c）。
export type UseDeleteShotReturn = OptimisticWriteReturn<{ shotId: string }, true>
export type UseDeleteRallyReturn = OptimisticWriteReturn<{ rallyId: string }, true>
export type UseDeleteOverrideReturn = OptimisticWriteReturn<{ overrideId: string }, true>

// ========================================
// useRecordingSession（集約オーケストレータ）
// ========================================

/**
 * 録画セッションの公開 API。GameState を所有し、操作別 composable を統合。
 * getCurrentTimeMs は page（useVideoPlayer.controls）から注入（テスト時はフェイク）。NFR-303。
 */
export interface UseRecordingSessionReturn {
  gameState: Readonly<Ref<GameState | null>>
  currentRally: Readonly<Ref<CurrentRally | null>>
  history: Readonly<Ref<RallyHistoryItem[]>>
  currentSetNumber: Readonly<Ref<number | null>>
  setWinner: Readonly<Ref<Team | null>>
  matchWinner: Readonly<Ref<Team | null>>
  /** 次セットの先攻の既定提示（前セット勝者）。セット未決着時 null。REQ-107。 */
  suggestedFirstServingTeam: Readonly<Ref<Team | null>>
  /** カメラ手前チーム（コート描画の向き）。セット開始時に確定。REQ-002。 */
  cameraNearTeam: Readonly<Ref<Team | null>>

  // セットアップ（同期）
  configureAndStartSet: (setup: SetSetupInput, positions: SetPositionInput[]) => Promise<ActionResult<SetRow['id']>>
  advanceToNextSet: () => void

  // ラリー記録（楽観/遅延）
  recordShot: () => Promise<void>
  recordPoint: (team: Team) => Promise<void>
  recordLet: () => Promise<void>
  skipRally: () => Promise<void>
  confirmSkipped: (team: Team) => Promise<void>
  recordOverride: (team: Team) => Promise<void>

  // 統一「取り消し」（linear undo・現在セット内）
  undoLast: () => Promise<void>
  undoLabelKey: Readonly<Ref<string | null>>

  allSynced: Readonly<Ref<boolean>>
}

// ========================================
// 録画対象の試合（read 射影）
// ========================================

/** useMatchForRecording: matches を1件読み、VideoSource 構築材料 + 4選手ロスターへ。REQ-001/004。 */
export interface MatchForRecording {
  id: string
  name: string | null
  videoSourceType: 'youtube' | 'local'
  videoSourceUrl: string
  roster: { playerId: PlayerId, name: string, team: Team }[]
}
