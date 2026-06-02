# TASK-0004 Green フェーズ ノート

## 実施日時
2026-06-01

## 実装ファイル

- `app/utils/video-playback/youtube-api-loader.ts`（新規作成）
- `app/types/youtube.d.ts`（新規作成 — YT グローバル型宣言）

## 実装内容

### `app/utils/video-playback/youtube-api-loader.ts`

TASK-0004.md 設計コードをそのまま採用。

- モジュールスコープに `loadPromise: Promise<typeof YT> | null` を保持
- `ensureApiLoaded()`: キャッシュがあれば即返却、なければ新規 Promise を生成してキャッシュ
- Promise 内部: `window.YT` 既ロード済みなら即 resolve
- `window.onYouTubeIframeAPIReady` を上書き（既存ハンドラは chain して取りこぼし防止）
- `document.querySelector` で既存 script を確認してから `document.head.appendChild` で注入（二重注入防止）

### `app/types/youtube.d.ts`

`@types/youtube` 未インストールのため自前宣言。最小集合:

- `YTPlayer` インターフェース（Phase 2 アダプタ向け基本 API）
- `YT` namespace（`YT.Player` クラス・`YT.PlayerState` 定数）
- `Window` インターフェース拡張（`YT`・`onYouTubeIframeAPIReady`）

## テスト結果

```
 Test Files  1 passed (1)
      Tests  2 passed (2)
   Duration  113ms
```

2ケース全て green。

## リファクタリング

実装は設計文書の参考コードと完全一致しており、追加変更なし。
型宣言（`youtube.d.ts`）は最小集合で、Phase 2 アダプタ実装時に拡張予定。

## テスト側の修正

なし（テストは変更していない）。
