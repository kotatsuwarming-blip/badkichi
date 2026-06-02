# TASK-0007 refactor フェーズノート

作成日: 2026-06-01

## 対象ファイル

`app/composables/useVideoPlayer.ts`

## 実施内容

### 1. インライン import の整理

- green 実装で `setPlaybackRate` の引数型に `import('~/types/video-playback').PlaybackRate` とインライン import を使用していた。
- `PlaybackRate` を `VideoPlayerError` とともに先頭の import 文にまとめ、インライン import を削除。

### 2. エラーハンドラの型キャスト整理

- `error` イベントハンドラ内で `(adapter as VideoPlayerAdapter & { getLastError(): import(...).VideoPlayerError | null })` という長い型キャストを使用していた。
- `AdapterWithError = VideoPlayerAdapter & { getLastError(): VideoPlayerError | null }` という型エイリアスをモジュールトップに定義し、`(adapter as AdapterWithError).getLastError()` に簡素化。
- 実際の YouTube/Html5 アダプタはどちらも `getLastError()` を実装しているため、型は実態に忠実。

### 3. brace-style 修正（lint 指摘）

- `if/else` ブロックの `}` と `else` が別行になっていた（1tbs 違反）。
- `} else {` に修正して ESLint `@stylistic/brace-style` をクリア。

## 変更サマリ

| 変更 | 内容 |
|---|---|
| 型整理 | `PlaybackRate`, `VideoPlayerError` を import 文に追加・インライン削除 |
| 型エイリアス追加 | `AdapterWithError` で error ハンドラの型キャストを明瞭化 |
| brace-style 修正 | `} else {` に統一 |

## green 維持確認

refactor 後に `pnpm vitest run tests/unit/composables/useVideoPlayer.test.ts` → 7/7 passed。
