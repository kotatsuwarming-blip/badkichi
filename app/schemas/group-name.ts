import { z } from 'zod'

// Group 名: trim 後 1〜50 文字 (NFR-201)。空白のみは trim 後 0 文字となり min(1) で弾かれる (EDGE-105)。
// message は locale キーと整合させる (NFR-204、表示は呼び出し側で t())。UI inline (TASK-0017) と
// useCreateGroup (TASK-0010) で共有。DB 側 invalid_group_name (RPC) はすり抜け時の最終防衛で二重に機能する。
export const groupNameSchema = z
  .string()
  .trim()
  .min(1, { message: 'invalid_group_name' })
  .max(50, { message: 'invalid_group_name' })

export type GroupName = z.infer<typeof groupNameSchema>
