import type { Database } from '~/types/supabase'

/** 利き手。players.handedness CHECK と 1:1。
 *  🔵 players.handedness CHECK (handedness IN ('right','left','unknown'))
 *  生成型では text (string) のため、ドメイン側でこの union に narrow する。 */
export type Handedness = 'right' | 'left' | 'unknown'

/** 一覧・表示が使う players の部分集合。
 *  🔵 interfaces.ts §1 Player。クエリ:
 *  from('players').select('id, name, handedness').eq('group_id', gid)
 *    .is('deleted_at', null).order('name') */
export interface Player {
  id: Database['public']['Tables']['players']['Row']['id']
  name: Database['public']['Tables']['players']['Row']['name']
  handedness: Handedness
}

/** 追加入力。group_id は composable が useCurrentGroup から付与するため含めない。
 *  🔵 REQ-002 / REQ-102。handedness 省略時は 'unknown' (DB DEFAULT)。 */
export interface CreatePlayerInput {
  name: string
  handedness?: Handedness
}

/** 編集入力。🔵 REQ-003。 */
export interface UpdatePlayerInput {
  name: string
  handedness: Handedness
}
