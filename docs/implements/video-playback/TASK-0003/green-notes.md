# TASK-0003 Green Notes

## 実装ファイル

`app/utils/video-playback/clamp.ts`

## 実装方針

タスク設計書（TASK-0003.md）の実装詳細に従い、条件分岐で境界丸めを行う純関数として実装した。
`Math.max`/`Math.min` の合成ではなく if 分岐を採用し、`durationMs === null` の厳密等価チェックを明示した。

- 負値（`ms < 0`）→ `0` を返す
- `durationMs !== null` かつ `ms > durationMs` → `durationMs` を返す
- それ以外 → `ms` をそのまま返す

副作用なし・DOM 非依存の純関数。ms 単位 integer 前提で float 等値比較なし。

## テスト実行結果

```
pnpm vitest run tests/unit/utils/video-playback/clamp.test.ts

 Test Files  1 passed (1)
      Tests  7 passed (7)
   Duration  123ms
```

全 7 ケース green。

## Refactor

実装はロジックが最小限で可読性も十分なため、リファクタリング対象なし。
