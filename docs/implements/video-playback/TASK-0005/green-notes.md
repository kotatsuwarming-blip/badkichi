# TASK-0005 green-notes

作成日: 2026-06-01
フェーズ: green

---

## 実装ファイル

`app/utils/video-playback/html5-adapter.ts`

---

## 実装方針

### ファクトリ関数

`createHtml5Adapter(source: LocalSource): Html5Adapter` を export。
`Html5Adapter` は `VideoPlayerAdapter` を extends し `getLastError(): VideoPlayerError | null` を追加した内部型。

### video 生成

`mount(el)` 内で `document.createElement('video')` を呼び、`el.appendChild(video)` する。
テストの `vi.stubGlobal('document', { createElement: ... })` でフェイクが注入される設計。

### URL 操作

- `mount`: `objectUrl = URL.createObjectURL(source.file)` → `video.src = objectUrl`
- `destroy`: `URL.revokeObjectURL(objectUrl)` + `video.removeAttribute('src')`

### イベント登録

`mount` で7イベントを `video.addEventListener` で登録:
`loadedmetadata / canplay / playing / pause / waiting / ended / error`

- `loadedmetadata`: `durationMs = Math.round(video.duration * 1000)` → `emit('durationchange')`
- `playing` → `setStatus('playing')`
- `pause` → `setStatus('paused')`
- `waiting` → `setStatus('buffering')`
- `ended` → `setStatus('ended')` + `emit('ended')`
- `error` → `lastError = { code: localDecodeFailed, messageKey: ... }` → `emit('error')`

### 状態管理

`setStatus(next)` で差分のみ `emit('statuschange')` して無駄な通知を抑制。

### seekToMs

`clampMs(ms, durationMs)` 適用後 `video.currentTime = clamped / 1000`。

### getCurrentTimeMs

`video === null || durationMs === null` の場合 `null`（未ロード判定）。それ以外は `Math.round(video.currentTime * 1000)`。

---

## テストバグ修正（最小修正・報告）

### 問題

red フェーズのテストに2つのバグがあった。

**バグ1: `vi.stubGlobal('URL', {...})` をモジュール import の前に実行していた**

`vi.stubGlobal('URL', { createObjectURL, revokeObjectURL })` は URL をプレーンオブジェクトに置き換えるため、
その後に `await import('~/utils/video-playback/html5-adapter')` を実行すると
Vite module-runner 内部の `posixPathToFileHref` が `new URL(path, base)` を呼んで
`TypeError: URL is not a constructor` で失敗する。

**修正**: `vi.stubGlobal('URL', ...)` を `await import(...)` の後に移動。

**バグ2: テスト間で `vi.stubGlobal` がリセットされない**

vitest の `vi.stubGlobal` は `afterEach` で自動リストアされない（`unstubGlobals: true` 設定が必要）。
`vi.resetModules()` はモジュールキャッシュのみリセットし、グローバル stub は残る。
そのため2テスト目以降の `beforeEach` で URL がプレーンオブジェクトのまま import が実行され失敗する。

**修正**: `afterEach(() => { vi.unstubAllGlobals() })` を追加。

### 修正量

- テストファイル内2箇所の最小修正（import 文への `afterEach` 追加、stub/import の順序入れ替え）
- 実装ファイルの変更なし

---

## green 実行結果

```
RUN  v4.1.4 /Users/kazuyakotake/Documents/repositries/badkichi

 Test Files  1 passed (1)
      Tests  6 passed (6)
   Start at  21:17:04
   Duration  187ms
```

全6ケース green。

---

## 公開メソッド一覧

`createHtml5Adapter(source: LocalSource)` が返すオブジェクトの公開メソッド:

| メソッド | シグネチャ | 備考 |
|--------|-----------|------|
| `mount` | `(el: HTMLElement) => Promise<void>` | VideoPlayerAdapter 実装 |
| `destroy` | `() => void` | VideoPlayerAdapter 実装 |
| `play` | `() => void` | VideoPlayerControls 実装 |
| `pause` | `() => void` | VideoPlayerControls 実装 |
| `seekToMs` | `(ms: number) => void` | clampMs 適用済み |
| `getCurrentTimeMs` | `() => number \| null` | 未ロード時 null |
| `getDurationMs` | `() => number \| null` | 未取得時 null |
| `getStatus` | `() => PlayerStatus` | 統一状態値 |
| `setPlaybackRate` | `(rate: PlaybackRate) => void` | video.playbackRate に書き込み |
| `on` | `(event: PlayerEvent, handler: () => void) => void` | 購読登録 |
| `getLastError` | `() => VideoPlayerError \| null` | Html5Adapter 拡張（ケース4対応） |
