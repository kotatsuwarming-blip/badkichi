# TASK-0002 Green フェーズ記録

## 対象

- **タスク**: TASK-0002 — `extractYouTubeId` 純関数
- **実装ファイル**: `app/utils/video-playback/extract-youtube-id.ts`
- **テストファイル**: `tests/unit/utils/video-playback/extract-youtube-id.test.ts`

## 実装方針

### 正規表現による一括マッチ

4形式（`watch?v=`・`youtu.be/`・`embed/`・`shorts/`）を1本の正規表現でカバーする。
TASK-0002 設計文書の実装詳細に示されたパターンをそのまま採用。

```
/(?:youtube\.com\/(?:watch\?(?:.*&)?v=|embed\/|shorts\/)|youtu\.be\/)([A-Za-z0-9_-]{11})(?:[?&#/].*)?$/
```

- グループ1 が 11 文字の ID を捕捉
- `watch?v=` はクエリ複数パラメータ（`&v=`）にも対応
- ID の後続にクエリ・フラグメント・スラッシュがあっても ID 部分のみ返す
- ホスト部分を `youtube\.com` / `youtu\.be` に限定することで非 YouTube URL を自然に除外（EDGE-002）

### 空文字ガード

`if (!url) return null` で先頭チェック。正規表現マッチ前に処理を打ち切る。

### 例外なし設計

`String.prototype.match` は null を返すのみで例外を投げない。
抽出失敗は全て `null` で返し、呼び出し側（YouTubeAdapter）が `youtube-invalid-url` エラーを組み立てる。

## Green 実行結果

実行日時: 2026-06-01
コマンド: `pnpm vitest run tests/unit/utils/video-playback/extract-youtube-id.test.ts`

```
 RUN  v4.1.4 /...

 Test Files  1 passed (1)
      Tests  8 passed (8)
   Start at  20:58:39
   Duration  112ms (transform 24ms, setup 14ms, import 17ms, tests 2ms, environment 0ms)
```

**全8テスト green 確認済み。**

## 次のフェーズ

- **refactor**: コード品質レビュー（正規表現のコメント追加等）
