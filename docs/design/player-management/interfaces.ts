/**
 * player-management 型定義 (設計成果物)
 *
 * 作成日: 2026-06-02
 * 位置づけ: architecture.md「composable 構成」で要約した composable 戻り値の **詳細契約**。
 *   実装 (app/composables/*.ts, app/schemas/*.ts, app/types/*.ts) はこの契約に従う。
 *
 * 信頼性: 🔵 requirements.md (🔵100%) + ADR-007 + error-handling.md §6.4 + app/types/supabase.ts 実測
 *   (テーブル Row は生成済み型を真とする)。auth-onboarding/interfaces.ts と同方針。
 *
 * 注意: 本ファイルは設計上の「契約」を表す参照用 .ts であり、実装ファイルそのものではない。
 *   Nuxt の auto-import 型 (Ref / AsyncData 等) は実装時に解決される前提で形だけ示す。
 */

import type { Ref } from 'vue'
import type { Database } from '~/types/supabase'

/* ============================================================
 * 1. ドメイン型 (app/types/player.ts — 必要に応じ集約)
 * ============================================================ */

/** 利き手。players.handedness CHECK と 1:1。
 *  🔵 initial_schema.sql players.handedness CHECK (handedness IN ('right','left','unknown'))
 *  生成型では text (string) になるため、ドメイン側でこの union に narrow する。 */
export type Handedness = 'right' | 'left' | 'unknown'

/** 一覧・表示が使う players の部分集合。
 *  🔵 players Row のうち UI が使う列のみ。handedness は Handedness に narrow。
 *  クエリ: from('players').select('id, name, handedness').eq('group_id', gid)
 *          .is('deleted_at', null).order('name') */
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

/* ============================================================
 * 2. 共通の戻り値ヘルパ型 (auth-onboarding/interfaces.ts より継承)
 * ============================================================ */

/** Nuxt useAsyncData の戻りのうち本単位が使う部分集合 (Read 系共通、ADR-007 D4)。 */
export interface AsyncState<T> {
  data: Ref<T | null>
  pending: Ref<boolean>
  error: Ref<Error | null>
  refresh: () => Promise<void>
}

/** Supabase native の {data, error} (Write 系アクションの生戻り)。
 *  page は error を成否分岐にのみ使い、表示はチャネル state を見る (ADR-007 §補遺)。 */
export interface ActionResult<T> {
  data: T | null
  error: unknown
}

/* ============================================================
 * 3. domain composable 戻り契約 (ADR-007)
 * ============================================================ */

/** usePlayers: 所属 Group の未削除選手一覧を name 昇順で返す Read composable。
 *  🔵 REQ-001 / REQ-201 / NFR-001。useAsyncData<Player[]>('players', …) 固定キー。 */
export type UsePlayersReturn = AsyncState<Player[]>

/** useCreatePlayer: players へ insert。🔵 REQ-002 / REQ-102。
 *  pending は二重送信防止、notice/field エラーはチャネル composable 側で保持。 */
export interface UseCreatePlayerReturn {
  createPlayer: (input: CreatePlayerInput) => Promise<ActionResult<Player>>
  pending: Ref<boolean>
}

/** useUpdatePlayer: players の name/handedness を update。🔵 REQ-003。 */
export interface UseUpdatePlayerReturn {
  updatePlayer: (id: Player['id'], input: UpdatePlayerInput) => Promise<ActionResult<Player>>
  pending: Ref<boolean>
}

/** useDeletePlayer: players.deleted_at を now() に update (ソフト削除)。
 *  🔵 REQ-004 / REQ-103 / REQ-104。確認ダイアログは page 側で出さない (無警告)。 */
export interface UseDeletePlayerReturn {
  deletePlayer: (id: Player['id']) => Promise<ActionResult<null>>
  pending: Ref<boolean>
}

/* ============================================================
 * 4. バリデーション (app/schemas/player-name.ts — Zod)
 * ============================================================
 * group-name.ts と同型。DB players_name_length_check (1〜50字, trim 後) と一致させる。
 * 🔵 REQ-101 / EDGE-001 / EDGE-002
 *
 *   import { z } from 'zod'
 *   export const playerNameSchema = z.string().trim().min(1).max(50)
 *
 * handedness は Handedness union を直接使う (z.enum(['right','left','unknown']) でも可)。
 */

/* ============================================================
 * 5. エラーコード方針
 * ============================================================
 * 本単位は **新規 APP_ERROR_CODE を追加しない**。
 * - name 検証 → クライアント Zod → UFormField inline (error-handling §6①)
 * - RLS 拒否 / PostgREST / 通信 → useToast() (§6④)
 * - 想定外 → error.vue + Sentry (§6⑦)
 * auth-onboarding の ALREADY_IN_GROUP のような DB 例外 1:1 マッピングは本単位には無い。
 */

// ========================================
// 信頼性レベルサマリー
// ========================================
/**
 * - 🔵 青信号: 全型 (確定スキーマ + 🔵100% 要件 + ADR-007 が出典)
 * - 🟡 黄信号: 0
 * - 🔴 赤信号: 0
 *
 * 品質評価: 高品質
 */
