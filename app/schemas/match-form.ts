import { z } from 'zod'

// youtube URL/ID → 動画ID抽出 (youtube.com/watch・embed・shorts / youtu.be / 11桁ID)。EDGE-004。
// message は locale キーと整合させる (表示は呼び出し側で t()、player-name.ts 同方針)。
const YT = /(?:youtube\.com\/(?:watch\?v=|embed\/|shorts\/)|youtu\.be\/)([A-Za-z0-9_-]{11})|^([A-Za-z0-9_-]{11})$/

// 試合名: 任意。trim 後最大50字、空文字/未入力は null へ。DB matches_name_length_check と一致 (REQ-108/EDGE-011)。
const matchName = z
  .string()
  .trim()
  .max(50, { message: 'invalid_match_name' })
  .nullish()
  .transform(v => (v == null || v === '' ? null : v))

// 試合日付: 必須。YYYY-MM-DD (REQ-008/109/EDGE-012)。
const matchDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, { message: 'invalid_match_date' })

export const matchFormSchema = z
  .object({
    name: matchName,
    matchDate,
    teamAPlayer1Id: z.guid({ message: 'player_required' }),
    teamAPlayer2Id: z.guid({ message: 'player_required' }),
    teamBPlayer1Id: z.guid({ message: 'player_required' }),
    teamBPlayer2Id: z.guid({ message: 'player_required' }),
    videoSourceType: z.enum(['youtube', 'local'], { message: 'invalid_video_source_type' }),
    videoSourceUrl: z.string().min(1, { message: 'video_source_required' })
  })
  .superRefine((v, ctx) => {
    // 4選手相異 (REQ-101 / EDGE-001)。matches_players_distinct_check と一致。
    const ids = [v.teamAPlayer1Id, v.teamAPlayer2Id, v.teamBPlayer1Id, v.teamBPlayer2Id]
    if (new Set(ids).size !== 4) {
      ctx.addIssue({ code: 'custom', message: 'players_must_be_distinct' })
    }
    // youtube は形式検証 + ID 抽出 (REQ-107 / EDGE-004)、local は非空のみ (REQ-106)。
    if (v.videoSourceType === 'youtube' && !YT.test(v.videoSourceUrl)) {
      ctx.addIssue({ code: 'custom', path: ['videoSourceUrl'], message: 'invalid_youtube_url' })
    }
  })

/** youtube URL/ID から 11桁動画 ID を抽出。非該当は null。EDGE-004。
 *  youtube の videoSourceUrl 保存値は本関数で抽出した「11桁動画ID」に正規化する (REQ-107)。 */
export function extractYoutubeId(input: string): string | null {
  const m = YT.exec(input)
  return m ? (m[1] ?? m[2] ?? null) : null
}

export type MatchFormValues = z.infer<typeof matchFormSchema>
