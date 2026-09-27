import type { Database } from '~/types/supabase'

/** 利き手。players.handedness CHECK と 1:1。
 *  🔵 players.handedness CHECK (handedness IN ('right','left','unknown'))
 *  生成型では text (string) のため、ドメイン側でこの union に narrow する。 */
export type Handedness = 'right' | 'left' | 'unknown'

/** メンバー区分。players.roster_type CHECK と 1:1（player-profile REQ-001）。
 *  member = 自チーム / opponent = 対戦相手（記録のために登録した相手選手）。 */
export type RosterType = 'member' | 'opponent'

/** 一覧・表示が使う players の部分集合。
 *  🔵 interfaces.ts §1 Player。クエリ:
 *  from('players').select('id, name, handedness, roster_type').eq('group_id', gid)
 *    .is('deleted_at', null).order('roster_type').order('name') */
export interface Player extends PlayerProfile {
  id: Database['public']['Tables']['players']['Row']['id']
  name: Database['public']['Tables']['players']['Row']['name']
  handedness: Handedness
  roster_type: RosterType
}

/** 追加入力。group_id は composable が useCurrentGroup から付与するため含めない。
 *  🔵 REQ-002 / REQ-102。handedness 省略時は 'unknown' (DB DEFAULT)。
 *  rosterType 省略時は 'member'（player-profile REQ-002: 新規登録時から選択可・既定は自チーム）。 */
export interface CreatePlayerInput {
  name: string
  handedness?: Handedness
  rosterType?: RosterType
  /** プロフィール (省略時は全て未入力 = DB DEFAULT, REQ-103) */
  profile?: PlayerProfileInput
}

/** 編集入力。🔵 REQ-003 + player-profile REQ-002（区分は編集でも変更可能）。 */
export interface UpdatePlayerInput {
  name: string
  handedness: Handedness
  rosterType: RosterType
  profile: PlayerProfileInput
}

// ========================================
// プロフィール (player-profile PR ②, REQ-101/102)
// ========================================

/** 性別。players.sex CHECK と 1:1。ミックス分析の軸 (REQ-101) */
export type PlayerSex = 'male' | 'female' | 'unspecified'

/** 練習頻度 5 段階。players.practice_frequency CHECK と 1:1 (REQ-101, ヒアリング2026-09-27) */
export type PracticeFrequency = 'daily' | 'several_per_week' | 'weekly' | 'monthly' | 'rarely'

/** プレースタイル 9 種・複数選択可。players.play_styles CHECK と 1:1 (REQ-102) */
export type PlayStyle
  = | 'attacker' | 'defender' | 'all_round' | 'front_player' | 'rear_player'
    | 'rally_oriented' | 'speed_oriented' | 'technical' | 'power'

/** 選手プロフィール (全項目任意, REQ-101)。年齢・歴は保存せず表示時導出 (REQ-105) */
export interface PlayerProfile {
  sex: PlayerSex
  height_cm: number | null
  weight_kg: number | null
  /** YYYY-MM-DD。年齢の導出元 */
  birthdate: string | null
  /** YYYY-MM-DD (月単位入力・日は 1 固定)。バドミントン歴の導出元 */
  badminton_since: string | null
  practice_frequency: PracticeFrequency | null
  play_styles: PlayStyle[]
}

/** プロフィール入力 (フォーム → composable)。camelCase */
export interface PlayerProfileInput {
  sex: PlayerSex
  heightCm: number | null
  weightKg: number | null
  birthdate: string | null
  badmintonSince: string | null
  practiceFrequency: PracticeFrequency | null
  playStyles: PlayStyle[]
}
