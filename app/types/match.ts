import type { Database } from '~/types/supabase'

/** 動画ソース種別。matches.video_source_type CHECK と 1:1。
 *  video_source_type CHECK IN ('youtube','local')。REQ-302: 将来拡張余地あり。 */
export type VideoSourceType = 'youtube' | 'local'

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
  teamA: [MatchPlayerRef, MatchPlayerRef]
  teamB: [MatchPlayerRef, MatchPlayerRef]
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
  teamAPlayer1Id: MatchPlayerRef['id']
  teamAPlayer2Id: MatchPlayerRef['id']
  teamBPlayer1Id: MatchPlayerRef['id']
  teamBPlayer2Id: MatchPlayerRef['id']
  videoSourceType: VideoSourceType
  videoSourceUrl: string
}

/** 編集入力。REQ-003 全項目編集可。形状は Create と同一。 */
export type UpdateMatchInput = CreateMatchInput
