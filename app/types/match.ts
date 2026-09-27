import type { Database } from '~/types/supabase'

/** 動画ソース種別。matches.video_source_type CHECK と 1:1。
 *  video_source_type CHECK IN ('youtube','local')。REQ-302: 将来拡張余地あり。 */
export type VideoSourceType = 'youtube' | 'local'

/** 対戦形式。matches.match_type CHECK と 1:1。singles = 各チーム 1 選手 (player2 は null)。 */
export type MatchType = 'singles' | 'doubles'

/** 形式ごとのチーム人数。ロスター検証・選手不足判定に使う。 */
export const PLAYERS_PER_TEAM: Record<MatchType, 1 | 2> = { singles: 1, doubles: 2 }

/** 一覧の 1 行で名前解決済みの選手参照 (PostgREST 埋め込み、EDGE-007)。 */
export interface MatchPlayerRef {
  id: Database['public']['Tables']['players']['Row']['id']
  name: Database['public']['Tables']['players']['Row']['name']
}

/** 一覧・表示が使う matches の射影 (選手名解決済み)。
 *  REQ-001 / NFR-203。name 任意 (null→UI は対戦カード表示)。 */
export interface MatchListItem {
  id: Database['public']['Tables']['matches']['Row']['id']
  name: string | null
  matchDate: string // REQ-008 'YYYY-MM-DD'
  matchType: MatchType
  /** チーム構成 (singles=1 人 / doubles=2 人)。index 0 が player1。 */
  teamA: MatchPlayerRef[]
  teamB: MatchPlayerRef[]
  videoSourceType: VideoSourceType
  videoSourceUrl: string // NOT NULL: local=ファイル名ラベル / youtube=抽出後ID
  // 録画状態 (match-recording): sets.winner から導出。'done'=試合勝者確定(2セット先取) /
  // 'recording'=セットあり未決着 / 'none'=未記録。
  recordingStatus: 'none' | 'recording' | 'done'
  setsWonA: number
  setsWonB: number
}

/** 作成入力。group_id は composable が useCurrentGroup から付与。REQ-002 系。 */
export interface CreateMatchInput {
  name?: string | null
  matchDate: string
  matchType: MatchType
  teamAPlayer1Id: MatchPlayerRef['id']
  /** singles では null (DB CHECK matches_match_type_players_check と一致) */
  teamAPlayer2Id: MatchPlayerRef['id'] | null
  teamBPlayer1Id: MatchPlayerRef['id']
  teamBPlayer2Id: MatchPlayerRef['id'] | null
  videoSourceType: VideoSourceType
  videoSourceUrl: string
}

/** 編集入力。REQ-003 全項目編集可。形状は Create と同一。 */
export type UpdateMatchInput = CreateMatchInput
