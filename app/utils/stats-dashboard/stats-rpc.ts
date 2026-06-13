/**
 * stats 集計 RPC 呼び出しヘルパー
 *
 * stats_* RPC は本ユニットで追加する additive migration（CI 適用）で定義される。
 * 型再生成（gen-types CI）が走るまで app/types/supabase.ts に RPC シグネチャが無いため、
 * ここで 1 箇所だけ型ブリッジ（cast）を行い、呼び出し側は型付き戻り値を受け取れるようにする。
 * 型再生成後もこのラッパは動作する（cast が冗長になるのみ）。
 *
 * 関連設計: docs/design/stats-dashboard/api-endpoints.md
 * スタイル: セミコロンなし / no comma dangle
 */

import type { SupabaseClient } from '@supabase/supabase-js'

type RpcResult<T> = { data: T[] | null, error: { message: string } | null }
type LooseRpc = (fn: string, args: Record<string, unknown>) => Promise<RpcResult<unknown>>

/** 読み取り専用 stats RPC を呼び、行配列（エラー時は throw）を返す */
export async function callStatsRpc<T>(
  client: SupabaseClient,
  fn: 'stats_player_rates' | 'stats_pair_rates' | 'stats_rally_length' | 'stats_rallies',
  args: Record<string, unknown>
): Promise<T[]> {
  const rpc = client.rpc.bind(client) as unknown as LooseRpc
  const { data, error } = await rpc(fn, args)
  if (error) throw new Error(error.message)
  return (data ?? []) as T[]
}
