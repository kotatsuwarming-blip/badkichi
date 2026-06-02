# TASK-0005 red-notes

作成日: 2026-06-01
フェーズ: red

---

## テスト契約（green が従うべきモック方式・video 生成契約）

### 1. `document.createElement` モック契約

テスト内では `vi.stubGlobal('document', { createElement: vi.fn((_tag) => fakeVideo) })` で差し替えている。

**green 実装への要求:**

- `mount(el)` 内部で `document.createElement('video')` を呼んで `<video>` 要素を生成し、
  渡された `el` に `el.appendChild(video)` する
- または `el` 自体が `HTMLVideoElement` であればそのまま利用する（`el instanceof HTMLVideoElement` で分岐）

いずれの場合も `document.createElement('video')` 経路を持つことで、
テストのフェイクオブジェクトが注入される。

### 2. fakeVideo の持つプロパティ・メソッド

```ts
{
  src: string,                  // video.src = objectUrl で設定
  currentTime: number,          // seekToMs が currentTime = sec で書き込む
  duration: number,             // loadedmetadata ハンドラが読む
  playbackRate: number,         // setPlaybackRate が書き込む
  addEventListener(event, handler),    // mount で登録
  removeEventListener(event, handler), // destroy で解除
  play(): Promise<void>,
  pause(): void,
  removeAttribute(name: string)  // destroy で 'src' を渡してクリア
}
```

### 3. URL モック契約

```ts
vi.stubGlobal('URL', {
  createObjectURL: vi.fn(() => 'blob:fake-url'),
  revokeObjectURL: vi.fn()
})
```

**green 実装への要求:**

- `mount(el)` で `objectUrl = URL.createObjectURL(source.file)` を呼ぶ
- `destroy()` で `URL.revokeObjectURL(objectUrl)` を呼ぶ
- `destroy()` で `video.removeAttribute('src')` を呼ぶ（または `video.src = ''`）

### 4. イベント手動発火方式

テストは `fakeVideo._listeners: Map<string, EventListener>` に登録されたハンドラを
`fireEvent(eventName)` ヘルパーで手動呼び出す。

**green 実装への要求:**

- イベント名は HTML 標準の文字列を使う:
  `'loadedmetadata'`, `'canplay'`, `'playing'`, `'pause'`, `'waiting'`, `'ended'`, `'error'`
- `video.addEventListener(event, handler)` で登録すること
  （`fakeVideo.addEventListener` が `Map` に保存する設計）

### 5. `getLastError()` 公開契約（ケース4用）

`VideoPlayerAdapter` インターフェースに `getLastError` は定義されていないが、
テストでは型キャスト `(adapter as unknown as { getLastError(): VideoPlayerError | null }).getLastError()`
でアクセスする。

**green 実装への要求:**

- `createHtml5Adapter` が返すオブジェクトに `getLastError(): VideoPlayerError | null` を追加する
  （インターフェース違反にはならない——余分なプロパティは許容）
- または `on('error', handler)` の型拡張でエラーを引数渡しに変更し、テストを合わせる

---

## テストケース一覧

| # | ケース名 | 対象仕様 |
|---|---------|---------|
| 1 | playing/pause イベントで getStatus が遷移し statuschange が発火する | REQ-007 / 状態マッピング |
| 2 | loadedmetadata で getDurationMs が ms 整数を返し durationchange が発火する | architecture.md ms 統一 |
| 3 | mount 前（未ロード）は getCurrentTimeMs が null を返す | REQ-201 |
| 4 | error イベントで error ハンドラが呼ばれ code が local-decode-failed になる | EDGE-003 |
| 5 | destroy で URL.revokeObjectURL が呼ばれ src がクリアされる | NFR-101 |
| 6 | seekToMs が clampMs 適用後に currentTime に秒をセットする（負値→0 / 超過→duration） | REQ-104 / EDGE-101 |

合計: 6 ケース（境界+分岐最小、冗長なし）

---

## red 実行結果

```
 RUN  v4.1.4 /Users/kazuyakotake/Documents/repositries/badkichi

 ❯ |node| tests/unit/utils/video-playback/html5-adapter.test.ts (6 tests | 6 failed) 9ms
     × playing イベントで getStatus が playing になり、pause イベントで paused になる 5ms
     × loadedmetadata イベントで getDurationMs が ms 整数を返し durationchange が発火する 1ms
     × mount 前は getCurrentTimeMs が null を返す 1ms
     × error イベントで error ハンドラが呼ばれ code が local-decode-failed になる 1ms
     × destroy で URL.revokeObjectURL が呼ばれ src がクリアされる 0ms
     × seekToMs が clamp を適用して currentTime に秒をセットする 0ms

 Test Files  1 failed (1)
      Tests  6 failed (6)
   Duration  131ms
```

**失敗理由**: `Cannot find module '~/utils/video-playback/html5-adapter'`

未実装ファイルへの import なので、6 件すべて同一エラーで失敗。
red フェーズとして正常。
