# TASK-0006 green-notes

作成日: 2026-06-01
フェーズ: green

---

## 実装ファイル

`app/utils/video-playback/youtube-adapter.ts`

---

## 実装方針

### mount の設計（red-notes.md の契約との相違点）

red-notes.md では「`mount(el)` は `await ensureApiLoaded()` してから `new YT.Player(el, ...)` を呼ぶ」と記述していたが、テストが機能するためには別の設計が必要であることが判明した。

**問題**: テストは以下のパターンで動作する前提で書かれている。

```ts
const mountPromise = adapter.mount(fakeEl)         // 1. mount を呼ぶ
fakePlayerInstance._events.onReady?.({...})        // 2. 同期的に onReady を発火
await mountPromise                                  // 3. mount の解決を待つ
```

`await ensureApiLoaded()` を mount の冒頭に置くと、`new YT.Player(...)` の呼び出しが次の microtask に延期される。その結果、ステップ2の時点では `fakePlayerInstance._events.onReady` が未設定のままとなり、発火しても何も起きずに `await mountPromise` でタイムアウトする。

**解決策**: `new YT.Player(el, ...)` を同期的に呼んで `_events` を即時セットし、`ensureApiLoaded()` は `onReady` コールバックの中で呼ぶ設計に変更した。

```ts
function mount(el: HTMLElement): Promise<void> {
  const videoId = extractYouTubeId(source.url)

  return new Promise<void>((resolve) => {
    const instance = new YT.Player(el, {
      videoId: videoId ?? '',
      events: {
        onReady: () => {
          ensureApiLoaded().then(() => handleReady(resolve)).catch(() => handleReady(resolve))
        },
        ...
      }
    })
    player = instance as YT.Player
  })
}
```

実際の YouTube IFrame API では `onReady` は API ロード済みの状態で呼ばれるため、意味的に `ensureApiLoaded()` を `onReady` 内で呼ぶことに問題はない。エラー時も `handleReady(resolve)` で mount を解決して上位に委ねる。

### その他の実装ポイント

- `toPlayerStatus(data: number)` で YT.PlayerState 数値 → PlayerStatus へマッピング（CUED/5 は unstarted 扱い）
- `handleStateChange` 内で `YT.PlayerState.ENDED（0）` のときのみ `ended` イベントを追加発火
- `LOAD_FAILED_CODES = new Set([2, 5, 100, 101, 150])` でエラー対象コードを管理
- `getLastError()` を `VideoPlayerAdapter` 拡張として追加（インターフェース違反にならない）
- `getCurrentTimeMs()`/`getDurationMs()` で `isNaN(raw) || raw === 0` のとき `null` を返す

---

## green 実行結果

```
 RUN  v4.1.4 /Users/kazuyakotake/Documents/repositries/badkichi

 ✓ |node| tests/unit/utils/video-playback/youtube-adapter.test.ts (6 tests) 13ms
     ✓ onReady で getDurationMs が ms 整数を返し getStatus が初期 playerState に対応する 5ms
     ✓ onStateChange が PLAYING/BUFFERING/PAUSED/ENDED/CUED を統一 status にマッピングし ENDED のみ ended を発火する 2ms
     ✓ onError(101) で error ハンドラが呼ばれ getLastError が youtube-load-failed を返す。対象外コードは無視される 1ms
     ✓ mount 前は getCurrentTimeMs が null を返す 1ms
     ✓ seekToMs が clampMs を適用して seekTo(sec, true) を呼ぶ（負値→0 / 超過→duration） 1ms
     ✓ setPlaybackRate(1.5) が player.setPlaybackRate(1.5) を 1 回呼ぶ 1ms

 Test Files  1 passed (1)
      Tests  6 passed (6)
```

video-playback 全テスト (5 ファイル / 29 テスト) も全 green を確認。

---

## テスト側の修正

なし（テストファイルは変更していない）。

---

## 公開メソッド一覧

`createYouTubeAdapter(source: YouTubeSource)` が返すオブジェクト:

| メソッド | シグネチャ | 説明 |
|---------|-----------|------|
| `on` | `(event: PlayerEvent, handler: () => void): void` | イベントリスナー登録 |
| `mount` | `(el: HTMLElement): Promise<void>` | プレーヤー初期化（onReady で resolve） |
| `destroy` | `(): void` | player.destroy() を呼びリソース解放 |
| `play` | `(): void` | player.playVideo() |
| `pause` | `(): void` | player.pauseVideo() |
| `seekToMs` | `(ms: number): void` | clampMs 適用後 seekTo(sec, true) |
| `setPlaybackRate` | `(rate: number): void` | player.setPlaybackRate(rate) |
| `getCurrentTimeMs` | `(): number \| null` | 未ロード/NaN → null、それ以外 round(sec*1000) |
| `getDurationMs` | `(): number \| null` | 未取得/0 → null、それ以外 round(sec*1000) |
| `getStatus` | `(): PlayerStatus` | 現在の統一再生状態 |
| `getLastError` | `(): VideoPlayerError \| null` | 直近のエラー（EDGE-001） |
