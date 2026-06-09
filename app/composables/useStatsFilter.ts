/**
 * useStatsFilter — クロスフィルタ状態 composable
 *
 * チャート選択（選手 / ペア / 役割 / ラリー長ビン）に連動するフィルタ状態を保持し、
 * per-match のクライアント絞り込み（apply）と group のサーバー側引数（toQueryArgs）を提供する。
 * チーム A/B はフィルタ軸にしない（player_id ベース, ヒアリング2026-06-09）。
 *
 * 関連設計: docs/design/stats-dashboard/{interfaces.ts,dataflow.md}
 * 関連要件: REQ-010 / REQ-012 / REQ-003 / REQ-004
 * スタイル: セミコロンなし / no comma dangle
 */

import { ref } from 'vue'
import { binsToRanges } from '~/utils/stats-dashboard/rally-length-bins'
import { filterRallies, type MatchRoster } from '~/utils/stats-dashboard/filter-rallies'
import type {
  RallyQueryArgs,
  RallyRow,
  StatsFilter,
  UseStatsFilterReturn
} from '~/types/stats-dashboard'

function emptyFilter(): StatsFilter {
  return { playerId: null, pair: null, role: null, shotBinKeys: [] }
}

export function useStatsFilter(options?: { roster?: () => MatchRoster | undefined }): UseStatsFilterReturn {
  const filter = ref<StatsFilter>(emptyFilter())

  function setFilter(patch: Partial<StatsFilter>): void {
    const f = filter.value

    // ラリー長ビンは複数選択をそのまま置換（チャートが全選択集合を emit）
    if ('shotBinKeys' in patch && patch.shotBinKeys !== undefined) {
      f.shotBinKeys = patch.shotBinKeys
    }

    // エンティティ選択（選手 or ペア）+ 役割は 1 つの選択として扱い、同一再選択でトグル解除
    const touchesEntity = 'playerId' in patch || 'pair' in patch || 'role' in patch
    if (touchesEntity) {
      const nextPlayer = patch.playerId ?? null
      const nextPair = patch.pair ?? null
      const nextRole = patch.role ?? null
      const samePlayer = nextPlayer !== null && nextPlayer === f.playerId && nextRole === f.role
      const samePair = nextPair !== null && f.pair !== null
        && nextPair.player1Id === f.pair.player1Id
        && nextPair.player2Id === f.pair.player2Id
        && nextRole === f.role
      if (samePlayer || samePair) {
        f.playerId = null
        f.pair = null
        f.role = null
      } else {
        f.playerId = nextPlayer
        f.pair = nextPair
        f.role = nextRole
      }
    }
  }

  function clear(): void {
    filter.value = emptyFilter()
  }

  function apply(rows: RallyRow[]): RallyRow[] {
    return filterRallies(rows, filter.value, options?.roster?.())
  }

  function toQueryArgs(): RallyQueryArgs {
    const f = filter.value
    const args: RallyQueryArgs = { limit: 200 }
    if (f.playerId) {
      if (f.role === 'receive') args.receiverPlayerId = f.playerId
      else args.serverPlayerId = f.playerId // serve または未指定はサーバー側で代表
      if (f.role) args.role = f.role
    }
    if (f.pair) {
      args.pairPlayer1Id = f.pair.player1Id
      args.pairPlayer2Id = f.pair.player2Id
      if (f.role) args.role = f.role
    }
    const ranges = binsToRanges(f.shotBinKeys)
    if (ranges.length > 0) args.shotRanges = ranges
    return args
  }

  return { filter, setFilter, clear, apply, toQueryArgs }
}
