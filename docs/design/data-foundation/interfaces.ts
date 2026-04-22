/**
 * data-foundation 型定義（設計書）
 *
 * 作成日: 2026-04-22
 * 関連設計: architecture.md, database-schema.sql
 * 関連要件: REQ-006, REQ-007, NFR-301
 *
 * 信頼性レベル:
 * - 🔵 青信号: 要件定義書・設計文書・ヒアリングで確実
 * - 🟡 黄信号: 妥当な推測
 * - 🔴 赤信号: 推測
 *
 * ------------------------------------------------------------
 * このファイルの位置づけ
 * ------------------------------------------------------------
 * data-foundation は Infrastructure Layer であり、
 * rule-engine のような純粋なドメイン型とは異なり「4 層の型」の
 * 役割分担を定義することが主目的。
 *
 *   Layer 1: DB 自動生成型       types/supabase.ts (自動生成、編集禁止)
 *   Layer 2: アプリ側ドメイン型    app/types/domain.ts (薄い派生型)
 *   Layer 3: Zod 入力スキーマ     app/schemas/*.ts (境界バリデーション)
 *   Layer 4: RPC 関数型          types/supabase.ts の Functions (自動生成)
 *
 * このファイルはコンパイル可能な設計例を示すもので、実装時に
 * 各 app/ 配下のファイルへ展開する。
 */

// ========================================
// Layer 1: DB 自動生成型（types/supabase.ts）
// ========================================

/**
 * 🔵 REQ-006, NFR-301 *ヒアリング 2026-04-16 Q6*
 *
 * `supabase gen types typescript --linked` で自動生成される型。
 * `pnpm db:types` がこのコマンドをラップする。
 *
 * 生成される型の大枠:
 *   export type Database = {
 *     public: {
 *       Tables: {
 *         groups:             { Row, Insert, Update }
 *         group_members:      { Row, Insert, Update }
 *         group_invitations:  { Row, Insert, Update }
 *         players:            { Row, Insert, Update }
 *         matches:            { Row, Insert, Update }
 *         sets:               { Row, Insert, Update }
 *         set_player_positions: { Row, Insert, Update }
 *         rallies:            { Row, Insert, Update }
 *         shots:              { Row, Insert, Update }
 *         position_overrides: { Row, Insert, Update }
 *       }
 *       Functions: {
 *         generate_invitation_code: { Args, Returns }
 *         join_group_with_code:     { Args, Returns }
 *         is_member_of:             { Args, Returns }
 *       }
 *       Enums: {}
 *     }
 *   }
 *
 * 編集禁止。スキーマ変更時は `pnpm db:push && pnpm db:types` で再生成する。
 */

// 以下は実装時の想定 import:
// import type { Database } from '~/types/supabase'

// 以下は設計書として型の形を示すための「ダミー定義」。
// 実装時は上の import に置き換わる。
type DatabaseShape = {
  public: {
    Tables: Record<string, {
      Row: Record<string, unknown>
      Insert: Record<string, unknown>
      Update: Record<string, unknown>
    }>
    Functions: Record<string, {
      Args: Record<string, unknown>
      Returns: unknown
    }>
  }
}

// ========================================
// Layer 2: アプリ側ドメイン型（app/types/domain.ts）
// ========================================

/**
 * 🔵 Supabase + TypeScript 標準パターン
 *
 * DB 自動生成型を薄くラップした派生型。UI で使いやすい別名として定義する。
 * 変換ロジック（snake_case → camelCase 等）は行わず、型エイリアスに留める。
 *
 * 理由: camelCase 変換を入れると DB 型とアプリ型が乖離し、同期コストが発生する。
 * Supabase JS クライアントは snake_case のまま返してくるため、
 * そのまま使う方が単純でバグが少ない。
 *
 * （実装時の想定）:
 *   import type { Database } from '~/types/supabase'
 *   type Tables<T extends keyof Database['public']['Tables']> =
 *     Database['public']['Tables'][T]['Row']
 *
 *   export type Group        = Tables<'groups'>
 *   export type GroupMember  = Tables<'group_members'>
 *   export type Player       = Tables<'players'>
 *   export type Match        = Tables<'matches'>
 *   export type SetRow       = Tables<'sets'>
 *   export type Rally        = Tables<'rallies'>
 *   export type Shot         = Tables<'shots'>
 *   ...
 */

// 設計書としての型例（実装時は Database 型から派生させる）
export interface Group {
  id: string
  name: string
  created_at: string
  updated_at: string
  deleted_at: string | null
}

export interface GroupMember {
  id: string
  group_id: string
  user_id: string
  joined_at: string
  created_at: string
  updated_at: string
  deleted_at: string | null
}

export interface GroupInvitation {
  id: string
  group_id: string
  code: string
  created_by: string
  expires_at: string
  created_at: string
  updated_at: string
  deleted_at: string | null
}

/**
 * 🔵 PRD §5.2
 * 利き手は未設定を表す 'unknown' を含む 3 値。
 */
export type Handedness = 'right' | 'left' | 'unknown'

export interface Player {
  id: string
  group_id: string
  name: string
  handedness: Handedness
  created_at: string
  updated_at: string
  deleted_at: string | null
}

/** 🔵 PRD §5.2 動画ソース種別 */
export type VideoSourceType = 'youtube' | 'local'

export interface Match {
  id: string
  group_id: string
  team_a_player1_id: string
  team_a_player2_id: string
  team_b_player1_id: string
  team_b_player2_id: string
  video_source_type: VideoSourceType
  video_source_url: string
  created_at: string
  updated_at: string
  deleted_at: string | null
}

/**
 * 🔵 rule-engine の Team 型と一致させる。
 * rule-engine は `'A' | 'B'`、DB CHECK 制約も `'A' | 'B'`。
 */
export type Team = 'A' | 'B'

export interface SetRow {
  id: string
  match_id: string
  set_number: number
  target_points: number
  enable_deuce: boolean
  deuce_point_cap: number
  first_serving_team: Team
  score_team_a: number
  score_team_b: number
  winner: Team | null
  created_at: string
  updated_at: string
  deleted_at: string | null
}

/** 🔵 rule-engine の CourtSide 型と一致させる。 */
export type CourtSide = 'left' | 'right'

export interface SetPlayerPosition {
  id: string
  set_id: string
  player_id: string
  team: Team
  position: CourtSide
  created_at: string
  updated_at: string
  deleted_at: string | null
}

export interface Rally {
  id: string
  set_id: string
  rally_number: number
  server_player_id: string | null
  receiver_player_id: string | null
  video_start_timestamp: number | null
  point_winner: Team | null
  is_let: boolean
  is_point_confirmed: boolean
  score_team_a_after: number
  score_team_b_after: number
  created_at: string
  updated_at: string
  deleted_at: string | null
}

/** 🟡 将来の AI ショット識別を見越した拡張点（PRD） */
export type ShotInputSource = 'manual' | 'ai'

export interface Shot {
  id: string
  rally_id: string
  shot_number: number
  video_timestamp: number | null
  input_source: ShotInputSource
  created_at: string
  updated_at: string
  deleted_at: string | null
}

/** 🔵 ヒアリング: ダブルスは左右ズレを記録、元に戻すイベントも保持 */
export type PositionOverrideType = 'swapped' | 'restored'

export interface PositionOverride {
  id: string
  rally_id: string
  team: Team
  override_type: PositionOverrideType
  created_at: string
  updated_at: string
  deleted_at: string | null
}

// ========================================
// Layer 3: Zod 入力スキーマ（app/schemas/*.ts）
// ========================================

/**
 * 🔵 REQ-007 *ヒアリング 2026-04-16 Q6*
 *
 * 境界（フォーム入力・API 入力）で外部から来るデータを検証する。
 * 内部コードでは型安全性を信頼し、再検証は行わない。
 *
 * 方針:
 * - DB Insert/Update 型と 1:1 対応させない（UI 入力はサブセットのことが多い）
 * - server_player_id などのルールエンジンで導出する列は Zod 対象外
 * - Zod スキーマ → TypeScript 型は `z.infer<typeof schema>` で取得
 *
 * （実装時の想定）:
 *   import { z } from 'zod'
 *   export const createGroupSchema = z.object({ ... })
 *   export type CreateGroupInput = z.infer<typeof createGroupSchema>
 */

// 設計書としては、以下の入力スキーマが必要になる想定を示す。
// 実装時に Zod の z.object(...) として書き下す。

/** 🔵 REQ-101 Group 作成入力 */
export interface CreateGroupInput {
  /** 1〜50 文字（妥当な範囲。確定時は acceptance-criteria と合わせる） 🟡 */
  name: string
}

/** 🔵 REQ-103 招待コードで Group 参加 */
export interface JoinGroupInput {
  /** 🔵 NFR-103: 8 文字の英数字。大文字 + 数字を想定 */
  code: string
}

/** 🔵 REQ-102 招待コード発行（入力は group_id のみ、残りは DB 関数側） */
export interface GenerateInvitationInput {
  group_id: string
}

/** 🔵 PRD §5.2 選手登録 */
export interface CreatePlayerInput {
  group_id: string
  name: string
  handedness?: Handedness
}

/** 🔵 PRD §5.2 試合登録 */
export interface CreateMatchInput {
  group_id: string
  team_a_player1_id: string
  team_a_player2_id: string
  team_b_player1_id: string
  team_b_player2_id: string
  video_source_type: VideoSourceType
  video_source_url: string
}

// ========================================
// Layer 4: RPC 関数の型（types/supabase.ts の Functions）
// ========================================

/**
 * 🔵 ヒアリング 2026-04-20 Q1
 *
 * `supabase gen types` は DB 関数の引数・戻り値も型生成する。
 * クライアント側は以下のように呼び出す:
 *
 *   const { data, error } = await supabase.rpc(
 *     'generate_invitation_code',
 *     { target_group_id: groupId }
 *   )
 *   // data: string | null, error: PostgrestError | null
 */

/** 🔵 generate_invitation_code の I/O */
export interface GenerateInvitationCodeArgs {
  target_group_id: string
}
export type GenerateInvitationCodeReturns = string // 8 文字英数字

/** 🔵 join_group_with_code の I/O */
export interface JoinGroupWithCodeArgs {
  invite_code: string
}
export type JoinGroupWithCodeReturns = string // 参加した group_id (uuid)

/** 🔵 is_member_of の I/O（RLS 内部用。クライアントから直接呼ぶことは通常ない） */
export interface IsMemberOfArgs {
  target_group_id: string
}
export type IsMemberOfReturns = boolean

// ========================================
// RPC エラー種別
// ========================================

/**
 * 🔵 database-schema.sql の RAISE EXCEPTION メッセージ
 *
 * Supabase クライアントの PostgrestError.message に以下の文字列が入る。
 * アプリ側は `error.message` で分岐、もしくは `error.code` で判別。
 *
 * UI 層（auth-onboarding 単位）でこのリテラル型を使って i18n マッピングを行う。
 */
export type InvitationErrorMessage
  = | 'not_a_member' // 招待コード発行時、group に未所属
    | 'invitation_not_found' // コードが存在しない
    | 'invitation_expired' // コードが期限切れ

// ========================================
// 型の使い方ルール
// ========================================

/**
 * 🔵 設計方針サマリー
 *
 * 1. DB 型（Layer 1）は常に `supabase gen types` から取得する。
 *    - 手書きの interface で二重定義しない。
 *    - スキーマ変更後は必ず `pnpm db:types` を実行する（NFR-301）。
 *
 * 2. アプリドメイン型（Layer 2）は Layer 1 の薄いエイリアス。
 *    - snake_case をそのまま保つ（変換コスト回避）。
 *    - UI 用の計算済み値（例: display_name）が必要になった時のみ別型を作る。
 *
 * 3. Zod スキーマ（Layer 3）は境界でのみ使う。
 *    - フォーム入力、API リクエストボディ、URL パラメータ
 *    - 内部関数の引数バリデーションには使わない（TypeScript 型で十分）
 *
 * 4. RPC 型（Layer 4）も Layer 1 と同じく自動生成で得る。
 *    - 引数名は DB 関数定義の引数名と一致する（例: `target_group_id`）。
 *
 * 5. rule-engine 型との整合
 *    - Team / CourtSide は rule-engine と同じリテラル型を使う。
 *    - rule-engine から直接 import するのではなく、同じ値を持つ型として独立定義する
 *      （Infrastructure → Domain の逆方向依存を避けるため）。
 */

// ========================================
// 信頼性レベルサマリー
// ========================================
/**
 * - 🔵 青信号: 26 件（型定義・方針）
 * - 🟡 黄信号: 2 件（Group.name の文字数制限、Shot.input_source の将来拡張）
 * - 🔴 赤信号: 0 件
 *
 * 品質評価: 高品質
 */

// 未使用変数の型エラー回避（設計書として型の形を示すためだけの定義）
export type { DatabaseShape }
