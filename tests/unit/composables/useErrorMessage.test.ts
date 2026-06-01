/**
 * useErrorMessage 単体テスト (TC1 / TC2 / TC3)
 *
 * mock 戦略 (ADR-012 D4):
 *   - vi.mock('vue-i18n') で useI18n を差し替え: t はキー透過、te は vi.fn() で切替
 *   - vi.mock('@sentry/nuxt') で captureException を vi.fn() スパイ
 *   - beforeEach で vi.clearAllMocks() により各テスト間の汚染を防止
 *
 * 【テスト修正 (Green フェーズ)】:
 *   - vi.mock('#imports') では useI18n が差し替えられなかった (auto-import は #imports を通じるが、
 *     Nuxt test-utils 環境では vue-i18n から直接解決されるため)
 *   - vi.mock('vue-i18n') で直接差し替える方式に変更
 *   - vi.hoisted() で tFn / teFn をファクトリ参照可能な形で先に初期化
 *
 * 🔵 error-handling.md §5.1 + TASK-0007.md TC1〜TC3 + ADR-012 D4
 */

import { beforeEach, describe, expect, it, vi } from 'vitest'
import * as Sentry from '@sentry/nuxt'

// 【vi.hoisted】: vi.mock ファクトリより先に評価される変数ブロック
// vi.mock はファイル先頭にホイストされるため、vi.hoisted() 内の変数のみが参照可能
const { tFn, teFn } = vi.hoisted(() => ({
  tFn: vi.fn((key: string) => key),
  teFn: vi.fn((_key: string) => false)
}))

// 【vue-i18n mock】: useI18n の t / te を制御可能にする
// vi.mock('#imports') では auto-import の実際の解決先 (vue-i18n) に効かないため直接 mock
vi.mock('vue-i18n', () => ({
  useI18n: () => ({ t: tFn, te: teFn })
}))

// 【Sentry mock】: captureException を vi.fn() スパイで差し替え
vi.mock('@sentry/nuxt', () => ({
  captureException: vi.fn()
}))

// composable の import は mock 設定後に行う (vi.mock は実行時にホイストされるため順序は問題なし)
// eslint-disable-next-line import/first
import { useErrorMessage } from '~/composables/useErrorMessage'

describe('useErrorMessage', () => {
  beforeEach(() => {
    // 【テスト前準備】: 各テスト実行前に全 mock 呼び出し履歴をリセット
    vi.clearAllMocks()
    // t のデフォルト: キー透過
    tFn.mockImplementation((key: string) => key)
    // te のデフォルト: false（context キー不在）
    teFn.mockReturnValue(false)
  })

  // ===================================================================
  // TC1: App 識別子 → 対応文言（1:1 分岐の代表）
  // ===================================================================
  it('TC1: App 識別子 INVALID_GROUP_NAME が 1:1 で i18n flat キーに変換される', () => {
    // 【テスト目的】: App 識別子 INVALID_GROUP_NAME が 1:1 で i18n キーに変換されることを確認
    // 🔵 error-handling.md §5.1 + TASK-0007.md TC1
    const error = { message: 'invalid_group_name' }
    const { errorToMessage } = useErrorMessage()
    const result = errorToMessage(error)

    expect(result).toBe('errors.invalid_group_name') // 【確認内容】: App 識別子が flat キーに 1:1 変換される
    expect(vi.mocked(Sentry.captureException)).not.toHaveBeenCalled() // 【確認内容】: マッピング済のため Sentry に送らない
  })

  // ===================================================================
  // TC2: 未マッピングエラー → generic + Sentry 報告（fallthrough 分岐）
  // ===================================================================
  it('TC2: 未マッピングエラーは errors.generic を返し Sentry.captureException を 1 回呼ぶ', () => {
    // 【テスト目的】: 未マッピングエラーが errors.generic を返し Sentry に報告されることを確認
    // 🔵 error-handling.md §5.1 fallthrough + NFR-304
    const error = new Error('something unexpected')
    const { errorToMessage } = useErrorMessage()
    const result = errorToMessage(error)

    expect(result).toBe('errors.generic') // 【確認内容】: fallthrough で汎用文言を返す
    expect(vi.mocked(Sentry.captureException)).toHaveBeenCalledTimes(1) // 【確認内容】: Sentry 報告は 1 回のみ
    expect(vi.mocked(Sentry.captureException)).toHaveBeenCalledWith(
      error,
      { tags: { reason: 'unmapped_error_code' } }
    ) // 【確認内容】: タグ形式が NFR-304 に厳密一致
  })

  // ===================================================================
  // TC3: PG SQLSTATE の context 出し分け（te 真/偽の分岐境界）
  // ===================================================================
  it('TC3: UNIQUE_VIOLATION で te 真のとき context キー、偽のとき .generic フォールバックになる', () => {
    // 【テスト目的】: PG SQLSTATE の context 出し分け（te 真→ctx キー / 偽→.generic フォールバック）を確認
    // 🔵 error-handling.md §5.1 tWithContext / §5.3 + TASK-0007.md TC3

    // ケースA: te が真 → context キーを引く
    teFn.mockReturnValue(true)
    const { errorToMessage: errorToMessageA } = useErrorMessage()
    const resultA = errorToMessageA({ code: '23505' }, 'join_group')
    expect(resultA).toBe('errors.unique_violation.join_group') // 【確認内容】: te 真で context キーが引かれる

    // ケースB: te が偽 → .generic フォールバック
    teFn.mockReturnValue(false)
    const { errorToMessage: errorToMessageB } = useErrorMessage()
    const resultB = errorToMessageB({ code: '23505' }, 'generic')
    expect(resultB).toBe('errors.unique_violation.generic') // 【確認内容】: te 偽で .generic フォールバックが引かれる
  })
})
