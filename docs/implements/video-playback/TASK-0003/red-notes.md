# TASK-0003 Red フェーズ ノート

## 実施日時
2026-06-01

## テストファイル
`tests/unit/utils/video-playback/clamp.test.ts`

## テストケース一覧（計 7 件）

| # | 説明 | Given | Expected |
|---|------|-------|----------|
| 1 | 下限境界（0ms ちょうど） | `clampMs(0, 60000)` | `0` |
| 2 | 上限境界（duration ちょうど） | `clampMs(60000, 60000)` | `60000` |
| 3 | duration 超過 → duration に丸め | `clampMs(70000, 60000)` | `60000` |
| 4 | 負値 → 0 に丸め | `clampMs(-500, 60000)` | `0` |
| 5 | 中間値はそのまま | `clampMs(5000, 10000)` | `5000` |
| 6 | null 時: 負値 → 0 | `clampMs(-500, null)` | `0` |
| 7 | null 時: 正値は上限なしでそのまま | `clampMs(70000, null)` | `70000` |

## Red 確認結果

```
 FAIL  |node| tests/unit/utils/video-playback/clamp.test.ts [ tests/unit/utils/video-playback/clamp.test.ts ]
Error: Cannot find module '~/utils/video-playback/clamp' imported from /Users/kazuyakotake/Documents/repositries/badkichi/tests/unit/utils/video-playback/clamp.test.ts
 ❯ tests/unit/utils/video-playback/clamp.test.ts:2:1
      1| import { describe, expect, it } from 'vitest'
      2| import { clampMs } from '~/utils/video-playback/clamp'
       | ^

 Test Files  1 failed (1)
      Tests  no tests
   Start at  21:02:31
   Duration  121ms
```

## 失敗理由
`app/utils/video-playback/clamp.ts` が存在しないため、import 解決エラーで失敗（正常な red 状態）。

## 次のステップ
`/tsumiki:tdd-green TASK-0003` で `app/utils/video-playback/clamp.ts` を実装してテストを green にする。
