import { z } from 'zod'

// 選手名: trim 後 1〜50 文字 (REQ-101)。空白のみは trim 後 0 文字となり min(1) で弾かれる (EDGE-001)。
// message は locale キーと整合させる (REQ-404、表示は呼び出し側で t())。UI inline (Phase 2) と
// Write composable (TASK-0002/0003) で共有。DB players_name_length_check はすり抜け時の最終防衛で二重に機能する。
export const playerNameSchema = z
  .string()
  .trim()
  .min(1, { message: 'invalid_player_name' })
  .max(50, { message: 'invalid_player_name' })

export type PlayerName = z.infer<typeof playerNameSchema>
