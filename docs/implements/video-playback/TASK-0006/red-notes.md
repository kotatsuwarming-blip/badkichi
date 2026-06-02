# TASK-0006 red-notes

作成日: 2026-06-01
フェーズ: red

---

## テスト契約（green が従うべきモック方式）

### 1. `globalThis.YT` モック契約

`vi.stubGlobal('YT', { Player: FakePlayer, PlayerState: { ... } })` で差し替える。

`FakePlayer` は `vi.fn()` コンストラクタで、呼ばれた時点で渡された `opts.events` を
`fakePlayerInstance._events` に保存し、`fakePlayerInstance` を返す（new の戻り値として）。

```ts
const FakePlayer = vi.fn(function(_el, opts) {
  fakePlayerInstance._events = opts.events ?? {}
  return fakePlayerInstance
})
```

**green 実装への要求:**

- `mount(el)` は `await ensureApiLoaded()` の後に `new YT.Player(el, { videoId, events: { onReady, onStateChange, onError } })` を呼ぶ
- コンストラクタ引数の `events` に `onReady` / `onStateChange` / `onError` を渡すこと
- `mount` は `onReady` が呼ばれるまで `Promise` を保留する（`onReady` で resolve する設計）

### 2. fakePlayerInstance の持つメソッド

```ts
{
  _events: {},                    // コンストラクタ呼び出し時に events が差し込まれる
  playVideo: vi.fn(),
  pauseVideo: vi.fn(),
  seekTo: vi.fn(),
  setPlaybackRate: vi.fn(),
  getCurrentTime: vi.fn(() => 0), // デフォルト 0、テストで mockReturnValue で上書き
  getDuration: vi.fn(() => 0),    // デフォルト 0、テストで mockReturnValue で上書き
  getPlayerState: vi.fn(() => -1),// デフォルト UNSTARTED
  destroy: vi.fn()
}
```

### 3. ensureApiLoaded / extractYouTubeId モック契約

```ts
vi.mock('~/utils/video-playback/youtube-api-loader', () => ({
  ensureApiLoaded: vi.fn(() => Promise.resolve())
}))

vi.mock('~/utils/video-playback/extract-youtube-id', () => ({
  extractYouTubeId: vi.fn(() => 'dQw4w9WgXcQ')
}))
```

**green 実装への要求:**

- `mount` 内で `ensureApiLoaded()` を import して呼ぶこと（モックが解決する）
- `extractYouTubeId` を import して videoId を解決すること（モックが固定 ID を返す）

### 4. `getLastError()` 公開契約（ケース3用）

`VideoPlayerAdapter` インターフェースに `getLastError` は定義されていないが、
テストでは型キャスト経由でアクセスする：

```ts
adapter = createYouTubeAdapter(...) as VideoPlayerAdapter & { getLastError(): VideoPlayerError | null }
```

**green 実装への要求:**

- `createYouTubeAdapter` が返すオブジェクトに `getLastError(): VideoPlayerError | null` を追加する
  （インターフェース違反にはならない——余分なプロパティは許容）
- `onError` が呼ばれたとき `lastError` に `VideoPlayerError` をセットし `emit('error')` する
- `onError` 対象コード: `2 / 5 / 100 / 101 / 150`（EDGE-001）

### 5. イベント手動発火方式

テストは `fakePlayerInstance._events.onReady?.({ target: fakePlayerInstance })` のように
コンストラクタに渡された events を直接呼び出す。

**green 実装への要求:**

- `new YT.Player(el, { videoId, events: { onReady, onStateChange, onError } })` の形式で渡すこと
- `onReady`: durationMs を読み取り、getPlayerState() で初期 status をセット、mount の Promise を resolve する
- `onStateChange({ data })`: YT.PlayerState 数値 → PlayerStatus マッピング + `statuschange` / `ended` 発火
- `onError({ data })`: LOAD_FAILED_CODES(2/5/100/101/150) のみ `youtube-load-failed` エラーをセット + `error` 発火

---

## テストケース一覧

| # | ケース名 | 対象仕様 |
|---|---------|---------|
| 1 | onReady で getDurationMs が ms 整数を返し getStatus が初期 playerState に対応する | REQ-007 / ms 統一 |
| 2 | onStateChange が PLAYING/BUFFERING/PAUSED/ENDED/CUED を統一 status にマッピングし ENDED のみ ended を発火する | REQ-007 / interfaces.ts PlayerStatus |
| 3 | onError(101) で error ハンドラが呼ばれ getLastError が youtube-load-failed を返す。対象外コードは無視される | EDGE-001 / error-handling カテゴリ D |
| 4 | mount 前は getCurrentTimeMs が null を返す | REQ-201 |
| 5 | seekToMs が clampMs を適用して seekTo(sec, true) を呼ぶ（負値→0 / 超過→duration） | REQ-104 / EDGE-101 |
| 6 | setPlaybackRate(1.5) が player.setPlaybackRate(1.5) を 1 回呼ぶ | REQ-006 |

合計: 6 ケース（境界+分岐最小、冗長なし）

---

## red 実行結果

```
 RUN  v4.1.4 /Users/kazuyakotake/Documents/repositries/badkichi

 ❯ |node| tests/unit/utils/video-playback/youtube-adapter.test.ts (6 tests | 6 failed) 10ms
     × onReady で getDurationMs が ms 整数を返し getStatus が初期 playerState に対応する 6ms
     × onStateChange が PLAYING/BUFFERING/PAUSED/ENDED/CUED を統一 status にマッピングし ENDED のみ ended を発火する 1ms
     × onError(101) で error ハンドラが呼ばれ getLastError が youtube-load-failed を返す。対象外コードは無視される 1ms
     × mount 前は getCurrentTimeMs が null を返す 1ms
     × seekToMs が clampMs を適用して seekTo(sec, true) を呼ぶ（負値→0 / 超過→duration） 1ms
     × setPlaybackRate(1.5) が player.setPlaybackRate(1.5) を 1 回呼ぶ 0ms

 Test Files  1 failed (1)
      Tests  6 failed (6)
   Duration  145ms
```

**失敗理由**: `Cannot find module '~/utils/video-playback/youtube-adapter'`

未実装ファイルへの import なので、6 件すべて同一エラーで失敗。
red フェーズとして正常。
