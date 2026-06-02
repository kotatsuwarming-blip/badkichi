# TASK-0004 Red フェーズ ノート

## 実施日時
2026-06-01

## テストファイル
`tests/unit/utils/video-playback/youtube-api-loader.test.ts`

## テストケース一覧（計 2 件）

| # | 説明 | Given | Expected |
|---|------|-------|----------|
| 1 | 初回呼び出しで iframe_api の script を1回注入し、onYouTubeIframeAPIReady 発火で YT を返す | `window.YT` 未定義・script 未注入のモック環境 | `appendChild` が1回呼ばれ、Promise が `window.YT` で resolve する |
| 2 | 2回目の呼び出しで script は再注入されず、1回目と同一の Promise インスタンスを返す | 1回目の呼び出し後（loadPromise キャッシュ済み） | `appendChild` は計1回のまま、`promise2 === promise1` |

## 採用したモック方式

- **環境**: vitest デフォルト（node）。jsdom/happy-dom は未インストール。
- **`window` / `document` のモック**: `vi.stubGlobal()` でオブジェクトごと差し替え。
  - `document.createElement` → `vi.fn()` でモック script オブジェクトを返す
  - `document.querySelector` → `vi.fn()` で null（未注入状態）を返す
  - `document.head.appendChild` → `vi.fn()`（appendChildSpy）で注入回数を検証
  - `window.YT` → 初期値 `undefined`、テスト内で `{ Player: vi.fn() }` を注入
  - `window.onYouTubeIframeAPIReady` → `ensureApiLoaded()` 呼び出し後に手動発火
- **キャッシュリセット**: `beforeEach` 内で `vi.resetModules()` → `await import(...)` の動的 import を採用し、各テストで新しいモジュールスコープを得る。

## Red 確認結果

```
 RUN  v4.1.4 /Users/kazuyakotake/Documents/repositries/badkichi

 ❯ |node| tests/unit/utils/video-playback/youtube-api-loader.test.ts (2 tests | 2 failed) 7ms
     × 初回呼び出しで iframe_api の script を1回注入し、onYouTubeIframeAPIReady 発火で YT を返す 5ms
     × 2回目の呼び出しで script は再注入されず、1回目と同一の Promise インスタンスを返す 1ms

 FAIL  |node| tests/unit/utils/video-playback/youtube-api-loader.test.ts > ensureApiLoaded > 初回呼び出しで...
Error: Cannot find module '~/utils/video-playback/youtube-api-loader' imported from ...

 Test Files  1 failed (1)
      Tests  2 failed (2)
   Start at  21:05:53
   Duration  124ms
```

## 失敗理由
`app/utils/video-playback/youtube-api-loader.ts` が存在しないため、動的 import の解決エラーで失敗（正常な red 状態）。

## 次のステップ
`/tsumiki:tdd-green TASK-0004` で `app/utils/video-playback/youtube-api-loader.ts` を実装してテストを green にする。
