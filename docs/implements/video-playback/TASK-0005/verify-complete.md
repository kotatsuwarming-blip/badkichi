# Verify-Complete — TASK-0005 Html5Adapter

作成日: 2026-06-01  
フェーズ: verify-complete

---

## 1. vitest

```
pnpm vitest run tests/unit/utils/video-playback/html5-adapter.test.ts
```

結果:

```
 Test Files  1 passed (1)
      Tests  6 passed (6)
   Duration  178ms
```

全6ケース green。

---

## 2. typecheck

```
pnpm typecheck
```

結果: エラーなし（exit 0）

---

## 3. lint

```
pnpm lint
```

初回実行で4件エラー検出:

| ファイル | 行 | ルール | 内容 |
|---|---|---|---|
| html5-adapter.ts | 11, 13 | `import/no-duplicates` | `~/types/video-playback` を2行に分けてインポート |
| html5-adapter.test.ts | 161, 178 | `@stylistic/member-delimiter-style` | 型リテラル内プロパティ区切りがセミコロン |

`pnpm eslint --fix` で全件自動修正後、再実行でエラーゼロ（exit 0）。

---

## 4. 要件カバレッジ所見

| テストケース | カバーする要件 |
|---|---|
| ケース1: playing/pause イベント → getStatus 遷移 | 状態遷移（playing / paused）・statuschange イベント発火 |
| ケース2: loadedmetadata → getDurationMs (ms) | duration の ms 変換・durationchange イベント発火 |
| ケース3: mount 前 getCurrentTimeMs → null | 未ロード時の null ガード |
| ケース4: error イベント → localDecodeFailed | エラーコード設定・error イベント発火・getLastError() |
| ケース5: destroy → revokeObjectURL / src クリア | リソース解放（URL.revokeObjectURL / removeAttribute('src')） |
| ケース6: seekToMs → clampMs 適用 | 境界値クランプ（負値/超過）・currentTime 秒変換 |

VideoPlayerAdapter インターフェースの全パブリックメソッド（mount / destroy / play / pause / seekToMs / getCurrentTimeMs / getDurationMs / getStatus / setPlaybackRate / on）のうち、境界動作が存在するものはすべてカバー済み。  
`play()` / `pause()` / `setPlaybackRate()` はパススルー委譲のみで分岐なし、カバー不要と判断。

---

## 5. 最終判定

**OK**

vitest 全6ケース green・typecheck エラーゼロ・lint エラーゼロ（fix 後）を確認。  
テストケース不足なし・実装不足なし。TASK-0005 完了。
