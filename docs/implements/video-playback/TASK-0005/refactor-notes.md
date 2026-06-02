# Refactor Notes — TASK-0005 Html5Adapter

作成日: 2026-06-01  
フェーズ: refactor

## 変更内容

### 実装ファイル (`app/utils/video-playback/html5-adapter.ts`)

- `import type` 文の重複を解消。  
  green 実装では `~/types/video-playback` を2行に分けてインポートしていたため、
  ESLint `import/no-duplicates` 違反が発生していた。  
  `PlaybackRate` を既存の `import type { LocalSource, PlayerEvent, ... }` 行に統合し1行化。

### テストファイル (`tests/unit/utils/video-playback/html5-adapter.test.ts`)

- 型リテラル内のプロパティ区切りをセミコロンからカンマに修正。  
  `{ code: string; messageKey: string }` → `{ code: string, messageKey: string }`  
  ESLint `@stylistic/member-delimiter-style` 違反（2箇所）を解消。

## ロジック変更

なし。状態マッピング・イベント登録/解除のロジックに重複や可読性上の問題はなく、
green 実装のまま変更不要と判断した。

## green 維持確認

修正後 `pnpm vitest run` で全6ケース green を確認済み。
