# TASK-0002 Refactor フェーズ記録

## 対象

- **タスク**: TASK-0002 — `extractYouTubeId` 純関数
- **実装ファイル**: `app/utils/video-playback/extract-youtube-id.ts`
- **テストファイル**: `tests/unit/utils/video-playback/extract-youtube-id.test.ts`

## 変更内容

### 型修正（必須修正）

`String.prototype.match` の戻り値 `RegExpMatchArray | null` において、インデックスアクセス `match[1]` の型は TypeScript strict mode では `string | undefined` になる。
関数の戻り値型 `string | null` と一致しないため型エラーが発生していた。

**変更前**:
```typescript
const match = url.match(YOUTUBE_ID_PATTERN)
return match ? match[1] : null
```

**変更後**:
```typescript
const match = url.match(YOUTUBE_ID_PATTERN)
return match?.[1] ?? null
```

`match?.[1]` はオプショナルチェーンでアクセスし `string | undefined` を返す。
`?? null` で `undefined` を `null` に変換することで戻り値型 `string | null` に適合させた。
動作の変化はなく、型の正確性が向上している。

## テスト確認

変更後も全 8 テストが green を維持していることを確認済み。

## 所見

テストファイル（`extract-youtube-id.test.ts`）に関しては変更不要。
可読性・重複・命名はいずれも十分に簡潔であり、実装コードも型修正以外はリファクタリング不要と判断した。
