import { describe, expect, it } from 'vitest'
import { playerNameSchema } from '~/schemas/player-name'

// 【テストスイート目的】: playerNameSchema の境界値 + 分岐網羅 (trim 後 1〜50 字)。
// 境界値 + 分岐のみ (feedback_test_coverage)。冗長ケース (2文字/49文字等) は置かない。
// 型は pnpm typecheck で静的保証されるためランタイムテスト対象外。
describe('playerNameSchema', () => {
  // 【テスト目的】: 下限境界 (trim 後 1 字) が受理され、data が trim 後値であること。
  // 【期待される動作】: success === true / data === 'a'。
  // 🔵 TASK-0001 TC1 / EDGE-001 下限
  it('TC1: trim 後 1 字は成功する (EDGE-001 下限)', () => {
    // 【テストデータ準備】: min(1) を満たす最小の有効値。
    const result = playerNameSchema.safeParse('a')
    // 【結果検証】: 受理かつ data が trim 後の 'a'。
    expect(result.success).toBe(true) // 【検証項目】: 下限境界が受理される 🔵
    if (result.success) {
      expect(result.data).toBe('a') // 【検証項目】: trim 適用後の値が data になる 🔵
    }
  })

  // 【テスト目的】: 下限割れ (trim 後 0 字) が拒否され、message が locale キーであること。
  // 【期待される動作】: success === false / issues[0].message === 'invalid_player_name'。
  // 🔵 TASK-0001 TC2 / EDGE-001 / min(1)
  it('TC2: 空白のみは trim 後 0 字で拒否される (EDGE-001)', () => {
    // 【テストデータ準備】: trim 後 0 字となる空白のみ。trim 適用順の回帰も兼ねる。
    const result = playerNameSchema.safeParse('   ')
    // 【結果検証】: 拒否かつ message が invalid_player_name。
    expect(result.success).toBe(false) // 【検証項目】: 空白のみが弾かれる 🔵
    if (!result.success) {
      expect(result.error.issues[0]?.message).toBe('invalid_player_name') // 【検証項目】: min 側メッセージキー 🔵
    }
  })

  // 【テスト目的】: 上限境界 (trim 後 50 字) が受理されること。
  // 【期待される動作】: success === true。
  // 🔵 TASK-0001 TC3 / EDGE-002 上限
  it('TC3: trim 後ちょうど 50 字は成功する (EDGE-002 上限)', () => {
    // 【テストデータ準備】: max(50) を満たす最大の有効値。
    const result = playerNameSchema.safeParse('a'.repeat(50))
    // 【結果検証】: 上限ちょうどが受理される。
    expect(result.success).toBe(true) // 【検証項目】: 上限境界が受理される (off-by-one なし) 🔵
  })

  // 【テスト目的】: 上限超過 (trim 後 51 字) が拒否され、message が locale キーであること。
  // 【期待される動作】: success === false / issues[0].message === 'invalid_player_name'。
  // 🔵 TASK-0001 TC4 / EDGE-002 / max(50)
  it('TC4: trim 後 51 字は拒否される (EDGE-002)', () => {
    // 【テストデータ準備】: 上限を 1 字超過する境界のすぐ外側。
    const result = playerNameSchema.safeParse('a'.repeat(51))
    // 【結果検証】: 拒否かつ message が invalid_player_name。
    expect(result.success).toBe(false) // 【検証項目】: 上限超過が弾かれる 🔵
    if (!result.success) {
      expect(result.error.issues[0]?.message).toBe('invalid_player_name') // 【検証項目】: max 側メッセージキー 🔵
    }
  })
})
