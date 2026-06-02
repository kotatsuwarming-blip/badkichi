# TASK-0002 Red フェーズ記録

## 対象

- **タスク**: TASK-0002 — `extractYouTubeId` 純関数
- **テストファイル**: `tests/unit/utils/video-playback/extract-youtube-id.test.ts`
- **実装ファイル（未実装）**: `app/utils/video-playback/extract-youtube-id.ts`

## テストケース一覧（計 8 ケース）

### 正常系（5 ケース）

| # | 入力 | 期待値 |
|---|------|--------|
| 1 | `https://www.youtube.com/watch?v=dQw4w9WgXcQ` | `'dQw4w9WgXcQ'` |
| 2 | `https://youtu.be/dQw4w9WgXcQ` | `'dQw4w9WgXcQ'` |
| 3 | `https://www.youtube.com/embed/dQw4w9WgXcQ` | `'dQw4w9WgXcQ'` |
| 4 | `https://www.youtube.com/shorts/dQw4w9WgXcQ` | `'dQw4w9WgXcQ'` |
| 5 | `https://youtu.be/dQw4w9WgXcQ?t=10`（クエリ付き） | `'dQw4w9WgXcQ'` |

### 異常系（3 ケース）

| # | 入力 | 期待値 |
|---|------|--------|
| 6 | `https://example.com/watch?v=dQw4w9WgXcQ`（非 YouTube） | `null` |
| 7 | `''`（空文字） | `null` |
| 8 | `https://www.youtube.com/channel/UC123`（ID 抽出不可） | `null` |

## Red 実行結果

実行日時: 2026-06-01
コマンド: `pnpm vitest run tests/unit/utils/video-playback/extract-youtube-id.test.ts`

```
 FAIL  |node| tests/unit/utils/video-playback/extract-youtube-id.test.ts
Error: Cannot find module '~/utils/video-playback/extract-youtube-id' imported from .../extract-youtube-id.test.ts

 Test Files  1 failed (1)
      Tests  no tests
```

**red 確認**: 実装ファイル未存在によりモジュール解決エラーで失敗 → red 状態を確認済み。

## 次のフェーズ

- **green**: `app/utils/video-playback/extract-youtube-id.ts` を実装して全テストを通す
