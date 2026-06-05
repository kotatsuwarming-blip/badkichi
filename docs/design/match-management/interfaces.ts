/**
 * match-management 型定義 (設計成果物)
 *
 * 作成日: 2026-06-05
 * 位置づけ: architecture.md「composable 構成」で要約した composable 戻り値の **詳細契約**。
 *   実装 (app/composables/*.ts, app/schemas/match-form.ts, app/types/match.ts) はこの契約に従う。
 *
 * 信頼性: 🔵 requirements.md (🔵94%) + ADR-007 + error-handling.md §6.4 + app/types/supabase.ts。
 *   player-management/interfaces.ts と同方針。
 *
 * 注意1: 本ファイルは設計上の「契約」を表す参照用 .ts であり、実装ファイルそのものではない。
 *   Nuxt の auto-import 型 (Ref / AsyncData 等) は実装時に解決される前提で形だけ示す。
 * 注意2: `matches` への name / match_date 列追加 (database-schema.sql の migration) 適用後に
 *   app/types/supabase.ts を再生成する前提。下記 Row 参照はその再生成後の型を想定する。
 */

import type { Ref } from 'vue'
import type { Database } from '~/types/supabase'

/* ============================================================
 * 1. ドメイン型 (app/types/match.ts)
 * ============================================================ */

/** 動画ソース種別。matches.video_source_type CHECK と 1:1。
 *  🔵 initial_schema.sql video_source_type CHECK IN ('youtube','local')。
 *  REQ-302: 将来の独自クラウド等への拡張余地あり (拡張時は data-foundation で CHECK 追加)。 */
export type VideoSourceType = 'youtube' | 'local'

/** 一覧の 1 行で名前解決済みの選手参照。
 *  🔵 EDGE-007: 削除済 player も name を維持するため PostgREST 埋め込みで解決 (architecture.md §選手名の解決)。 */
export interface MatchPlayerRef {
  id: Database['public']['Tables']['players']['Row']['id']
  name: Database['public']['Tables']['players']['Row']['name']
}

/** 一覧・表示が使う matches の射影 (選手名解決済み)。
 *  🔵 REQ-001 / NFR-203。match_date 降順→created_at 降順で取得。
 *  name は任意 (未入力時 null → UI は対戦カードを表示)。 */
export interface MatchListItem {
  id: Database['public']['Tables']['matches']['Row']['id']
  name: string | null // 🔵 REQ-007 任意 (matches.name nullable)
  matchDate: string // 🔵 REQ-008 'YYYY-MM-DD' (matches.match_date date)
  teamA: [MatchPlayerRef, MatchPlayerRef] // 🔵 team_a_player1/2
  teamB: [MatchPlayerRef, MatchPlayerRef] // 🔵 team_b_player1/2
  videoSourceType: VideoSourceType // 🔵 REQ-106/107
  videoSourceUrl: string // 🔵 NOT NULL: local=ファイル名ラベル / youtube=動画ID抽出後URL
}

/** 作成入力。group_id は composable が useCurrentGroup から付与するため含めない。
 *  🔵 REQ-002 / REQ-006 / REQ-007 / REQ-008 / REQ-106 / REQ-107。 */
export interface CreateMatchInput {
  name?: string | null // 🔵 REQ-007 任意 (空は null 化)
  matchDate: string // 🔵 REQ-008/109 必須 'YYYY-MM-DD'
  teamAPlayer1Id: MatchPlayerRef['id'] // 🔵 REQ-006
  teamAPlayer2Id: MatchPlayerRef['id'] // 🔵
  teamBPlayer1Id: MatchPlayerRef['id'] // 🔵
  teamBPlayer2Id: MatchPlayerRef['id'] // 🔵
  videoSourceType: VideoSourceType // 🔵 REQ-106/107
  videoSourceUrl: string // 🔵 NOT NULL: local=file.name / youtube=抽出後URL
}

/** 編集入力。🔵 REQ-003 全項目編集可。形状は Create と同一。 */
export type UpdateMatchInput = CreateMatchInput

/* ============================================================
 * 2. 共通の戻り値ヘルパ型 (player-management/interfaces.ts より継承)
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

/** useMatches: 所属 Group の未削除試合を match_date 降順で返す Read composable。
 *  🔵 REQ-001 / REQ-201 / NFR-001 / NFR-203。useAsyncData<MatchListItem[]>('matches', …) 固定キー。
 *  選手名は PostgREST 埋め込みで解決 (EDGE-007)。 */
export type UseMatchesReturn = AsyncState<MatchListItem[]>

/** useCreateMatch: matches へ insert。🔵 REQ-002 / REQ-104。
 *  pending は二重送信防止。エラーは page 側 toast。 */
export interface UseCreateMatchReturn {
  createMatch: (input: CreateMatchInput) => Promise<ActionResult<MatchListItem>>
  pending: Ref<boolean>
}

/** useUpdateMatch: matches の全項目を update。🔵 REQ-003。 */
export interface UseUpdateMatchReturn {
  updateMatch: (id: MatchListItem['id'], input: UpdateMatchInput) => Promise<ActionResult<MatchListItem>>
  pending: Ref<boolean>
}

/** useDeleteMatch: matches.deleted_at を now() に update (ソフト削除)。
 *  🔵 REQ-004 / REQ-105 / REQ-402。確認ダイアログは page 側で出す (REQ-105)。 */
export interface UseDeleteMatchReturn {
  deleteMatch: (id: MatchListItem['id']) => Promise<ActionResult<null>>
  pending: Ref<boolean>
}

/* ============================================================
 * 4. バリデーション (app/schemas/match-form.ts — Zod)
 * ============================================================
 * 🔵 REQ-101 / REQ-106 / REQ-107 / REQ-108 / REQ-109 / EDGE-001/003/004/011/012
 *
 * 概念例 (実装時に Zod v4 で具体化):
 *
 *   import { z } from 'zod'
 *
 *   // 試合名: 任意。空文字は null へ。1〜50字 (trim 後)。DB matches_name_length_check と一致。
 *   const matchName = z.string().trim().min(1).max(50).nullish()
 *     .transform(v => (v == null || v === '' ? null : v))
 *
 *   // 試合日付: 必須。YYYY-MM-DD。
 *   const matchDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/)
 *
 *   // youtube URL/ID → 動画ID抽出 (youtube.com / youtu.be / 11桁ID)。EDGE-004。
 *   const YT = /(?:youtube\.com\/(?:watch\?v=|embed\/|shorts\/)|youtu\.be\/)([A-Za-z0-9_-]{11})|^([A-Za-z0-9_-]{11})$/
 *
 *   // フォーム全体: video_source_type による分岐 + 4選手相異 refine。
 *   export const matchFormSchema = z.object({
 *     name: matchName,
 *     matchDate,
 *     teamAPlayer1Id: z.string().uuid(),
 *     teamAPlayer2Id: z.string().uuid(),
 *     teamBPlayer1Id: z.string().uuid(),
 *     teamBPlayer2Id: z.string().uuid(),
 *     videoSourceType: z.enum(['youtube', 'local']),
 *     videoSourceUrl: z.string().min(1), // 詳細は superRefine で type 別に検証
 *   })
 *   .superRefine((v, ctx) => {
 *     // 4選手相異 (REQ-101 / EDGE-001)
 *     const ids = [v.teamAPlayer1Id, v.teamAPlayer2Id, v.teamBPlayer1Id, v.teamBPlayer2Id]
 *     if (new Set(ids).size !== 4) ctx.addIssue({ code: 'custom', message: 'players_must_be_distinct' })
 *     // youtube は形式検証 + ID抽出 (REQ-107 / EDGE-004)、local は非空のみ (REQ-106)
 *     if (v.videoSourceType === 'youtube' && !YT.test(v.videoSourceUrl)) {
 *       ctx.addIssue({ code: 'custom', path: ['videoSourceUrl'], message: 'invalid_youtube_url' })
 *     }
 *   })
 */

/* ============================================================
 * 5. エラーコード方針
 * ============================================================
 * 本単位は **新規 APP_ERROR_CODE を追加しない** (player-management と同方針)。
 * - 入力検証 (名前/日付/動画ソース/4選手相異) → クライアント Zod → UFormField inline (§6①)
 * - RLS 拒否 / 複合FK 違反 / distinct CHECK 違反 / PostgREST / 通信 → useToast() (§6④)
 * - 想定外 → error.vue + Sentry (§6⑦)
 */

// ========================================
// 信頼性レベルサマリー
// ========================================
/**
 * - 🔵 青信号: 大半 (確定スキーマ + 🔵94% 要件 + ADR-007 + ヒアリングが出典)
 * - 🟡 黄信号: 選手名の複合FK埋め込み (MatchPlayerRef 取得経路) は実装時検証
 * - 🔴 赤信号: 0
 *
 * 品質評価: 高品質
 */
