/**
 * singles-support 型定義
 *
 * 作成日: 2026-08-28
 * 関連設計: architecture.md / dataflow.md
 * 関連要件: docs/spec/singles-support/requirements.md
 * スタイル: セミコロンなし / no comma dangle（CLAUDE.md ESLint 規約）
 *
 * 信頼性レベル:
 * - 🔵 青信号: EARS要件・確定スキーマ・既存実装（プロトタイプで検証済み）
 * - 🟡 黄信号: 妥当な推測
 *
 * 方針:
 * - 新規の型は最小限。既存型の「差分」を示す（実装先は各 app/types/*.ts）。
 * - rule-engine の型（TeamPositions / SetPlayerPosition / GameState）は変更しない。
 */

import type { Ref, ComputedRef } from 'vue'
import type { Team, CourtSide, PlayerId, SetConfig, SetPlayerPosition, GameState } from '~/utils/rule-engine/types'

// ========================================
// app/types/match.ts への追加・変更 🔵
// ========================================

/** 対戦形式。matches.match_type CHECK と 1:1。singles = 各チーム 1 選手 (player2 は null)。 */
export type MatchType = 'singles' | 'doubles'

/** 形式ごとのチーム人数。ロスター検証・選手不足判定・将来形式追加の集約点 (NFR-302)。 */
export const PLAYERS_PER_TEAM: Record<MatchType, 1 | 2> = { singles: 1, doubles: 2 }

export interface MatchPlayerRef {
  id: string
  name: string
}

/** 一覧射影。teamA/teamB はタプル [ref, ref] から可変長配列へ変更 (singles=1 / doubles=2)。 */
export interface MatchListItem {
  id: string
  name: string | null
  matchDate: string
  matchType: MatchType // 追加
  teamA: MatchPlayerRef[] // 変更: [MatchPlayerRef, MatchPlayerRef] → MatchPlayerRef[]
  teamB: MatchPlayerRef[]
  videoSourceType: 'youtube' | 'local'
  videoSourceUrl: string
  recordingStatus: 'none' | 'recording' | 'done'
  setsWonA: number
  setsWonB: number
}

/** 作成/編集入力。player2 は singles で null (DB CHECK matches_match_type_players_check と一致)。 */
export interface CreateMatchInput {
  name?: string | null
  matchDate: string
  matchType: MatchType // 追加
  teamAPlayer1Id: string
  teamAPlayer2Id: string | null // 変更: string → string | null
  teamBPlayer1Id: string
  teamBPlayer2Id: string | null
  videoSourceType: 'youtube' | 'local'
  videoSourceUrl: string
}
export type UpdateMatchInput = CreateMatchInput

// ========================================
// app/schemas/match-form.ts の契約 🔵
// ========================================

/**
 * matchFormSchema の入力/出力契約。
 * - 入力: matchType 必須、player2 は nullish
 * - superRefine: doubles → player2 必須 (path 付き player_required) / 相異判定は形式別人数
 *   (singles=[A1,B1] / doubles=[A1,A2,B1,B2]) で `new Set(ids).size !== ids.length`
 * - transform: singles の player2 を常に null に正規化 (UI の残存値を DB へ送らない、EDGE-001)
 */
export interface MatchFormInput {
  name?: string | null
  matchDate: string
  matchType: MatchType
  teamAPlayer1Id: string
  teamAPlayer2Id?: string | null
  teamBPlayer1Id: string
  teamBPlayer2Id?: string | null
  videoSourceType: 'youtube' | 'local'
  videoSourceUrl: string
}
export type MatchFormOutput = CreateMatchInput

/** 追加するエラーコード (i18n errors.*) */
export type SinglesSupportErrorCode = 'invalid_match_type' // matchType 不正
// 既存 'player_required' を doubles の player2 欠落にも流用 (path: teamAPlayer2Id / teamBPlayer2Id)
// 既存 'players_must_be_distinct' の文言を「4 選手」から形式非依存に変更

// ========================================
// app/types/match-recording.ts への追加 🔵
// ========================================

export interface RosterEntry {
  playerId: PlayerId
  name: string
  team: Team
}

/** 録画対象試合。matchType 追加、roster は 2 人 (singles) or 4 人 (doubles)。 */
export interface MatchForRecording {
  id: string
  name: string | null
  matchType: MatchType // 追加
  videoSourceType: 'youtube' | 'local'
  videoSourceUrl: string
  completedAt: string | null
  roster: RosterEntry[]
}

/** 初期立ち位置入力。doubles=4 行 / singles=各チーム right の 2 行。型は不変。 */
export type SetPositionInput = SetPlayerPosition

// ========================================
// app/utils/rule-engine/create-initial-state.ts の契約 🔵
// ========================================

/**
 * createInitialState(config, positions):
 * - 各チームで left/right の片方しか無い場合、もう一方を同一選手で埋める (fillSingleSlot)。
 * - 両方ある場合 (doubles) は従来どおり。
 * - applyRally / applyOverride / determineSetWinner は変更しない (REQ-405)。
 */
export type CreateInitialState = (config: SetConfig, positions: SetPlayerPosition[]) => GameState

// ========================================
// app/utils/match-recording/build-set-input.ts の契約 🔵
// ========================================

export interface BuildSetParams {
  setNumber: number
  targetPoints: number
  enableDeuce: boolean
  deucePointCap: number
  firstServingTeam: Team
  cameraNearTeamAtStart: Team | null
  /** ファースト (右コート)。singles では唯一の選手の id を渡す */
  aFirstPlayerId: PlayerId
  bFirstPlayerId: PlayerId
}

/**
 * buildSetInput(roster, params):
 * - 各チーム 1 人 (singles) または 2 人 (doubles)。人数不一致・偏り・0 人は throw。
 * - 1 人: [{ first, team, 'right' }] / 2 人: [{ first, 'right' }, { other, 'left' }]。
 * - ファーストがチーム外なら throw (従来どおり)。
 */
export type BuildSetInput = (roster: RosterEntry[], params: BuildSetParams) => {
  setup: SetConfig & { setNumber: number, cameraNearTeamAtStart: Team | null }
  positions: SetPositionInput[]
}

// ========================================
// コンポーネント props 差分 🔵
// ========================================

/** RecordingCourtDiagram: singles 描画用に 2 props 追加 */
export interface CourtDiagramProps {
  positions: GameState['positions']
  servingTeam: Team
  server: PlayerId
  receiver: PlayerId
  cameraNearTeam: Team | null
  names: Record<PlayerId, string>
  /** 追加: true なら serverPosition 側のサービスコートにだけ選手を描く */
  singles?: boolean
  /** 追加: 現在のサーブ位置 (偶数=right / 奇数=left) */
  serverPosition?: CourtSide
}

/** RecordingCourtDiagram 内部のセル表現。empty=true は singles の空サービスコート */
export interface CourtCell {
  id: string // 選手 id。空セルは `empty-${team}-${side}` (v-for key 用)
  name: string
  isServer: boolean
  isReceiver: boolean
  empty: boolean
}

/** RecordingPositionControls: 入替ボタンの表示制御 (withDefaults で既定 true) */
export interface PositionControlsProps {
  disabled?: boolean
  canAdvance?: boolean
  showOverride?: boolean // 追加: singles は false
}

/** RecordingSetSetupForm: props は不変。内部で isSingles = A 1 人 && B 1 人 を導出 */
export interface SetSetupFormProps {
  roster: RosterEntry[]
  setNumber: number
  suggestedFirstServingTeam?: Team | null
}

/** StatsGlobalFilterBar: ペア別モードの表示制御 (withDefaults で既定 true) */
export interface StatsGlobalFilterBarPropsDiff {
  showPairMode?: boolean // 追加: singles 試合の単体統計では false
}

// ========================================
// app/types/shot-annotation.ts への追加 🔵
// ========================================

export interface AnnotationMatchInfo {
  id: string
  videoSourceType: 'youtube' | 'local'
  videoSourceUrl: string
  matchType: MatchType // 追加
}

/**
 * useTypePass.inputType の追加挙動:
 * - 3 打目以降で hitterCandidates.length === 1 なら、patch に hitPlayerId を同時に含めて advance()。
 * - 2 人なら従来どおり awaitingHitter = true。
 */
export interface TypePassSinglesContract {
  hitterCandidates: ComputedRef<RosterEntry[]>
  awaitingHitter: Ref<boolean>
}

// ========================================
// app/types/shot-stats.ts の変更 🔵
// ========================================

/** stats_rally_endings / stats_rally_tempo の行。player2 列が nullable に。 */
export interface TeamPlayerColumnsDiff {
  team_a_player1_id: string
  team_a_player2_id: string | null // 変更
  team_b_player1_id: string
  team_b_player2_id: string | null // 変更
}

/** flow.ts FlowRally: タプルから可変長へ (null を除外した id 配列) */
export interface FlowRallyTeamsDiff {
  teamA: string[] // 変更: [string, string] → string[]
  teamB: string[]
}

// ========================================
// app/types/supabase.ts (生成物) の先行手修正箇所 🔵
// ========================================

/**
 * matches.Row/Insert/Update:
 *   match_type: string (Insert/Update は optional)
 *   team_a_player2_id / team_b_player2_id: string | null
 * Functions.stats_rally_endings / stats_rally_tempo の Returns:
 *   team_a_player2_id / team_b_player2_id: string | null
 * → migration 適用後に `pnpm db:types` で再生成し差分ゼロを確認 (REQ-408)
 */
export type SupabaseTypesManualPatch = never
