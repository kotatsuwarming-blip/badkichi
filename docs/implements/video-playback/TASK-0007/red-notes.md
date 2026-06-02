# TASK-0007 red フェーズノート

作成日: 2026-06-01

## テストファイル

`tests/unit/composables/useVideoPlayer.test.ts`

## red 確認結果

```
FAIL  |node| tests/unit/composables/useVideoPlayer.test.ts
Error: Cannot find module '~/composables/useVideoPlayer' imported from .../useVideoPlayer.test.ts
  ❯ tests/unit/composables/useVideoPlayer.test.ts:120:1
```

期待通り `app/composables/useVideoPlayer.ts` 未作成で失敗（0 tests collected）。
実装ファイルを作成すれば次の green フェーズで各ケースが green になる。

---

## フェイクアダプタ契約（green が従うべき仕様）

### FakeAdapter の構造

```typescript
interface FakeAdapter extends VideoPlayerAdapter {
  getLastError(): VideoPlayerError | null
  _handlers: Map<PlayerEvent, () => void>  // on() が登録したハンドラを保持
  _status: string                           // getStatus() の戻り値制御用
  _durationMs: number | null               // getDurationMs() の戻り値制御用
  _currentTimeMs: number | null            // getCurrentTimeMs() の戻り値制御用
  _lastError: VideoPlayerError | null      // getLastError() の戻り値制御用
}
```

### vi.mock 登録先

| モジュール | モック内容 |
|---|---|
| `~/utils/video-playback/youtube-adapter` | `createYouTubeAdapter` → fakeYouTubeAdapter.youtube を返す |
| `~/utils/video-playback/html5-adapter` | `createHtml5Adapter` → fakeHtml5Adapter.html5 を返す |
| `~/utils/video-playback/extract-youtube-id` | `extractYouTubeId` → `extractYouTubeIdMock.fn(url)` に委譲 |

### rAF モック方式

```typescript
// beforeEach で vi.stubGlobal
vi.stubGlobal('requestAnimationFrame', vi.fn((cb: FrameRequestCallback) => {
  const id = ++rafIdCounter
  rafCallbacks.set(id, cb)
  return id
}))

vi.stubGlobal('cancelAnimationFrame', vi.fn((id: number) => {
  rafCallbacks.delete(id)
}))
```

- `rafCallbacks: Map<number, FrameRequestCallback>` にコールバックを蓄積
- テストはコールバックを手動で呼び出してフレーム進行をシミュレート可能
- `cancelAnimationFrame` の呼び出し確認は `expect(cancelAnimationFrame).toHaveBeenCalled()` で行う

---

## テストケース一覧（全7ケース）

| # | 内容 | 根拠 |
|---|---|---|
| 1 | youtube 無効 URL（extractYouTubeId→null）で attach → error.code = youtube-invalid-url, mount 非呼び出し | EDGE-002 |
| 2 | local で file 無し source で attach → needsReselect = true, mount 非呼び出し | REQ-103 / NFR-101 |
| 3 | 正常 attach で adapter.mount が呼ばれ statuschange/durationchange 購読で state.status/durationMs 反映 | REQ-007 |
| 4 | attach 前の getCurrentTimeMs は null、attach 後はアダプタ戻り値を返す（同期委譲） | NFR-001 / REQ-201 |
| 5 | error イベントで adapter.getLastError() が state.error に反映される | EDGE-001/003 |
| 6 | play で requestAnimationFrame が呼ばれ、pause で cancelAnimationFrame が呼ばれる | NFR-001 |
| 7 | detach で adapter.destroy が 1 回呼ばれ rAF が解除される | architecture.md §ライフサイクル |

---

## green 実装が満たすべき契約まとめ

### ファイルパス
`app/composables/useVideoPlayer.ts`

### エクスポート
```typescript
export function useVideoPlayer(source: VideoSource): UseVideoPlayerReturn
```

### import は明示的に記述（auto-import 禁止）
```typescript
import { readonly, ref } from 'vue'
import type { UseVideoPlayerReturn, VideoPlayerAdapter, VideoPlayerState, VideoSource } from '~/types/video-playback'
import { VIDEO_PLAYER_ERROR_CODE } from '~/types/video-playback'
import { extractYouTubeId } from '~/utils/video-playback/extract-youtube-id'
import { createYouTubeAdapter } from '~/utils/video-playback/youtube-adapter'
import { createHtml5Adapter } from '~/utils/video-playback/html5-adapter'
```

### attach 内の分岐条件
1. `source.type === 'youtube'` かつ `extractYouTubeId(source.url) === null`
   → `state.value.error = { code: VIDEO_PLAYER_ERROR_CODE.youtubeInvalidUrl, messageKey: ... }` で return
2. `source.type === 'local'` かつ `!source.file`
   → `state.value.needsReselect = true` で return
3. 正常時: アダプタ生成 → `on()` 購読登録 → `adapter.mount(el)` を await

### on() 購読での state 更新
- `'statuschange'` → `state.value.status = adapter.getStatus()`
- `'durationchange'` → `state.value.durationMs = adapter.getDurationMs()`
- `'ended'` → `state.value.status = 'ended'`; stopRaf()
- `'error'` → `state.value.error = adapter.getLastError()`

### rAF の起動・停止タイミング
- `controls.play()` → `startRaf()` を呼ぶ
- `controls.pause()` → `stopRaf()` を呼ぶ
- `detach()` → `stopRaf()` → `adapter.destroy()` → `adapter = null`
