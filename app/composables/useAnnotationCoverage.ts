/**
 * useAnnotationCoverage — 注釈率（stats_annotation_coverage）の遅延取得（TASK-0004）
 *
 * タブ初回アクティブ時に execute() を呼ぶ遅延ロード方式（NFR-001, 設計ヒアリング2026-08-04）。
 * args はスコープ引数を返す関数（match: { p_match_id } / group: { p_group_id, p_match_ids }）。
 *
 * 関連設計: docs/design/shot-stats/architecture.md / api-endpoints.md
 */
import { computed, ref } from 'vue'
import type { AnnotationCoverageRow } from '~/types/shot-stats'
import { callStatsRpc } from '~/utils/stats-dashboard/stats-rpc'
import { sumCoverage } from '~/utils/shot-stats/coverage'

export function useAnnotationCoverage(args: () => Record<string, unknown>) {
  const client = useSupabaseClient()
  const rows = ref<AnnotationCoverageRow[]>([])
  const pending = ref(false)
  const loaded = ref(false)
  const error = ref<string | null>(null)

  async function execute(): Promise<void> {
    if (pending.value) return
    pending.value = true
    error.value = null
    try {
      rows.value = await callStatsRpc<AnnotationCoverageRow>(client, 'stats_annotation_coverage', args())
      loaded.value = true
    } catch (e) {
      error.value = e instanceof Error ? e.message : String(e)
    } finally {
      pending.value = false
    }
  }

  /** スコープ合計（バッジ表示用） */
  const summary = computed(() => sumCoverage(rows.value))

  return { rows, summary, pending, loaded, error, execute }
}
