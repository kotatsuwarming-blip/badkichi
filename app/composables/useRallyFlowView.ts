/**
 * useRallyFlowView — ラリー展開タブ（J/K/L）の統合 composable（TASK-0005）
 *
 * stats_rallies（既存）+ stats_rally_tempo を並列取得し rally_id でマージ。
 * タブ初回アクティブ時に execute() を呼ぶ遅延ロード方式（NFR-001）。
 * 対象（選手/ペア）・対象試合は useStatsView のグローバルフィルタと共有する。
 *
 * 関連設計: docs/design/shot-stats/{architecture.md,dataflow.md}
 */
import { computed, ref, watch, type Ref } from 'vue'
import type { RallyRow, StatsEntity } from '~/types/stats-dashboard'
import type { FlowRally, RallyTempoRow, StatsSubject, TempoMeasure } from '~/types/shot-stats'
import type { StatsViewScope } from '~/composables/useStatsView'
import { callStatsRpc } from '~/utils/stats-dashboard/stats-rpc'
import { mergeFlowRallies } from '~/utils/shot-stats/flow'
import { buildPhaseEntries } from '~/utils/shot-stats/phase'
import { toTempoSamples } from '~/utils/shot-stats/tempo'

export function useRallyFlowView(
  scope: StatsViewScope,
  opts: {
    includedMatchIds: Ref<string[] | null>
    /** セット絞り込み（グローバルフィルタ共有, 2026-08-08 再編）。クライアント側で適用 */
    setNumber: Ref<number | null>
    entity: () => StatsEntity
    nameOf: (id: string) => string
  }
) {
  const client = useSupabaseClient()
  const rows = ref<FlowRally[]>([])
  const pending = ref(false)
  const loaded = ref(false)
  const error = ref<string | null>(null)

  function scopeArgs(): Record<string, unknown> {
    if (scope.kind === 'match') return { p_match_id: scope.matchId }
    return { p_group_id: scope.groupId, p_match_ids: opts.includedMatchIds.value }
  }

  // latest-wins: 実行中でも常に最新引数で発行し、最新でない応答は捨てる
  // （pending 中の要求破棄が古い試合選択の表示を残すバグの原因だった）
  let seq = 0

  async function execute(): Promise<void> {
    const req = ++seq
    pending.value = true
    error.value = null
    try {
      const [rallies, tempo] = await Promise.all([
        callStatsRpc<RallyRow>(client, 'stats_rallies', { ...scopeArgs(), p_limit: 1000 }),
        callStatsRpc<RallyTempoRow>(client, 'stats_rally_tempo', scopeArgs())
      ])
      if (req !== seq) return
      rows.value = mergeFlowRallies(rallies, tempo)
      loaded.value = true
    } catch (e) {
      if (req !== seq) return
      error.value = e instanceof Error ? e.message : String(e)
    } finally {
      if (req === seq) pending.value = false
    }
  }

  // 対象試合（期間フィルタ）変更時は取得開始済み（初回ロード中含む）なら追従再取得
  watch(opts.includedMatchIds, () => {
    if (loaded.value || pending.value) execute()
  })

  // StatsEntity と StatsSubject は同形（kind: all/player/pair）
  const subject = computed<StatsSubject>(() => opts.entity() as StatsSubject)

  /** グローバルセットフィルタ適用後の対象行（クライアント側, 2026-08-08 再編） */
  const targetRows = computed(() =>
    opts.setNumber.value === null ? rows.value : rows.value.filter(r => r.setNumber === opts.setNumber.value)
  )

  /** J: 局面別得点率（entity=all は選手ごと） */
  const phaseEntries = computed(() => buildPhaseEntries(targetRows.value, subject.value, opts.nameOf))

  /** K: テンポサンプル + 除外数（REQ-106） */
  const measure = ref<TempoMeasure>('avg')
  const tempo = computed(() => toTempoSamples(targetRows.value, subject.value))

  /** L: セット選択（試合単位のみ使用） */
  const setNumbers = computed(() => [...new Set(targetRows.value.map(r => r.setNumber))].sort((a, b) => a - b))
  function ralliesOfSet(setNumber: number): FlowRally[] {
    return targetRows.value.filter(r => r.setNumber === setNumber)
  }

  const isEmpty = computed(() => loaded.value && targetRows.value.length === 0)

  return {
    rows, pending, loaded, error, execute,
    subject, phaseEntries, measure, tempo, setNumbers, ralliesOfSet, isEmpty
  }
}
