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
export interface Player {
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
}

/** 編集入力。🔵 REQ-003 + player-profile REQ-002（区分は編集でも変更可能）。 */
export interface UpdatePlayerInput {
  name: string
  handedness: Handedness
  rosterType: RosterType
}
