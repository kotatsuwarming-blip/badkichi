# TASK-0001 Red フェーズ記録: playerNameSchema 境界値テスト

**機能名**: player-types-schema  
**タスクID**: TASK-0001  
**要件名**: player-management  
**実施日**: 2026-06-02  
**フェーズ**: Red（失敗テスト作成）

---

## 1. 作成したテストケースの一覧

| TC | 入力 | trim 後文字数 | 期待結果 | 信頼性 |
|----|------|--------------|---------|--------|
| TC1 | `'a'` | 1 | `success === true` / `data === 'a'` | 🔵 |
| TC2 | `'   '` | 0 | `success === false` / `message === 'invalid_player_name'` | 🔵 |
| TC3 | `'a'.repeat(50)` | 50 | `success === true` | 🔵 |
| TC4 | `'a'.repeat(51)` | 51 | `success === false` / `message === 'invalid_player_name'` | 🔵 |

---

## 2. テストコードの全文

**ファイル**: `tests/unit/schemas/player-name.test.ts`

```typescript
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
```

---

## 3. 期待された失敗内容（確認済み）

```
FAIL  |node| tests/unit/schemas/player-name.test.ts
Error: Cannot find module '~/schemas/player-name' imported from .../tests/unit/schemas/player-name.test.ts

Test Files  1 failed (1)
      Tests  no tests
```

**失敗理由**: `app/schemas/player-name.ts` が未実装のため import エラーが発生。これは Red フェーズとして正常な状態。

---

## 4. Green フェーズで実装すべき内容

`app/schemas/player-name.ts` を以下の仕様で実装する：

```typescript
import { z } from 'zod'

export const playerNameSchema = z
  .string()
  .trim()
  .min(1, { message: 'invalid_player_name' })
  .max(50, { message: 'invalid_player_name' })

export type PlayerName = z.infer<typeof playerNameSchema>
```

**実装ポイント**:
- `.trim()` を `.min()` / `.max()` より前に位置させる（trim 後の文字数で判定）
- `message` は locale キー `invalid_player_name`（文言そのものではない）
- `group-name.ts` と同型（`invalid_group_name` → `invalid_player_name` 置換パターン）
