# TASK-0006 refactor-notes

作成日: 2026-06-01
フェーズ: refactor

---

## 是正内容

### 問題: green フェーズの実装が production で不正だった

green フェーズでは「テストを通すため」という理由で以下の実装になっていた。

```ts
// 誤った実装（green フェーズ）
function mount(el: HTMLElement): Promise<void> {
  return new Promise<void>((resolve) => {
    // new YT.Player を先に同期実行（YT が undefined の可能性）
    const instance = new YT.Player(el, {
      events: {
        onReady: () => {
          // ensureApiLoaded を onReady 内で呼ぶ（API ロード後前提だが意味的に逆転）
          ensureApiLoaded().then(() => handleReady(resolve)).catch(() => handleReady(resolve))
        }
      }
    })
    player = instance as YT.Player
  })
}
```

**問題点**: YouTube IFrame API スクリプトがロードされる前に `new YT.Player(...)` を呼ぶと、
`YT` グローバルが存在せず `TypeError: YT is undefined` が発生する。
production では `ensureApiLoaded()` は非同期でスクリプトをロードするため、
await 前に `new YT.Player` を呼ぶ実装は production で必ず失敗する。

---

### 是正: 実装の await 順序を正す

```ts
// 正しい実装（refactor 後）
async function mount(el: HTMLElement): Promise<void> {
  const videoId = extractYouTubeId(source.url)

  // API ロード完了を待ってから YT.Player を生成する（正しい順序）
  await ensureApiLoaded()

  return new Promise<void>((resolve) => {
    const instance = new YT.Player(el, {
      videoId: videoId ?? '',
      events: {
        onReady: () => handleReady(resolve),
        onStateChange: handleStateChange,
        onError: handleError
      }
    })
    player = instance as YT.Player
  })
}
```

`ensureApiLoaded()` を await してから `new YT.Player(...)` を呼ぶ正しい順序に是正した。
これにより production で `YT is undefined` になる問題を解消した。

---

### 是正: テストの待ち合わせ方法を正す

green フェーズのテストは「mount 直後に同期で `_events.onReady` を発火する」設計だったが、
これは実装が `new YT.Player` を同期実行することを前提にしていた。

refactor 後の実装は `await ensureApiLoaded()` で一度 microtask に入るため、
`mount()` 呼び出し直後は `new YT.Player` がまだ実行されておらず `_events` が未セットになる。

**修正前（誤り）**:
```ts
const mountPromise = adapter.mount(fakeEl)
fakePlayerInstance._events.onReady?.({ target: fakePlayerInstance }) // _events が未セット
await mountPromise
```

**修正後（正しい）**:
```ts
const mountPromise = adapter.mount(fakeEl)
// ensureApiLoaded() の await（即時 resolve）が完了し new YT.Player が
// 呼ばれて _events がセットされるまで microtask を flush する
await Promise.resolve()
await Promise.resolve()
fakePlayerInstance._events.onReady?.({ target: fakePlayerInstance })
await mountPromise
```

`ensureApiLoaded` は `vi.mock` で即時 `Promise.resolve()` を返す。
JavaScript の Promise resolution では await の後続処理は microtask queue に積まれるため、
`await Promise.resolve()` を2回挟むことで `new YT.Player(...)` の実行が完了し
`fakePlayerInstance._events` がセットされる。

---

## 検証意図の不変性

テストの**検証意図（6ケースの内容）は変更していない**。
変更したのは待ち合わせ方法（onReady 発火前の microtask flush）のみ。

| ケース | 検証意図 | 変更内容 |
|--------|----------|----------|
| 1 | onReady で durationMs と status が反映される | await × 2 を追加 |
| 2 | onStateChange の各状態マッピングと ended 発火 | await × 2 を追加 |
| 3 | onError(101) で error emit / 対象外は無視 | await × 2 を追加 |
| 4 | mount 前は getCurrentTimeMs が null | 変更なし（mount を呼ばないケース） |
| 5 | seekToMs が clampMs 適用後 seekTo を呼ぶ | await × 2 を追加 |
| 6 | setPlaybackRate が player.setPlaybackRate を呼ぶ | await × 2 を追加 |

---

## TDD としての妥当性

この修正は「テストを通すための実装の歪み」を是正するものであり、TDD として妥当。
- assert 対象（検証内容）は一切変えていない
- 実装の正しさ（production で動く順序）を優先した
- テストの待ち合わせ方法はモックの仕様（即時 resolve）に基づく正当な調整
