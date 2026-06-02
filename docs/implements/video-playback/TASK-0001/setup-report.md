# TASK-0001 setup-report

**タスクID**: TASK-0001
**タスクタイプ**: DIRECT
**実施日**: 2026-06-01
**フェーズ**: direct-setup（設定作業）

---

## 作業概要

`docs/design/video-playback/interfaces.ts` で確定済みの型定義を `app/types/video-playback.ts` へ転記し、
video-playback 実装用のディレクトリ scaffold を行った。実行コードは含まない（型・定数のみ）。

---

## 設計文書参照

| 文書 | パス |
|------|------|
| タスク仕様 | `docs/tasks/video-playback/TASK-0001.md` |
| 型定義ソース | `docs/design/video-playback/interfaces.ts` |
| コンテキストノート | `docs/spec/video-playback/note.md` |
| エラー実装規約 | `docs/design/cross-cutting/error-handling.md` |

---

## 実行した作業

### 1. ディレクトリ作成

| ディレクトリ | 状態 | 備考 |
|---|---|---|
| `app/types/` | 既存（確認済み） | `error-codes.ts` / `supabase.ts` が存在 |
| `app/utils/video-playback/` | 新規作成 | `.gitkeep` で保持 |
| `tests/unit/utils/video-playback/` | 新規作成 | `.gitkeep` で保持 |
| `docs/implements/video-playback/TASK-0001/` | 新規作成 | 本 setup-report を格納 |

### 2. `app/types/video-playback.ts` 作成

interfaces.ts の全 export を転記。以下の方針で実施:

- `declare function`（`extractYouTubeId` / `clampMs`）は型ファイルには書かず、コメントのみで記録
  - 理由: `export declare function` は実装ファイル（TASK-0002/0003）と衝突するため
- `VIDEO_PLAYER_ERROR_CODE` const オブジェクトを追加（error-handling 原則3 準拠）
  - `as const satisfies Record<string, VideoPlayerErrorCode>` で型整合を保証
- ESLint 規約（セミコロンなし / no comma dangle / 1tbs）を遵守
- `import type { Ref } from 'vue'` を使用（Vue リアクティビティ型参照）

---

## 作業結果チェックリスト

- [x] `app/types/video-playback.ts` が作成された
- [x] interfaces.ts の全 export 型が転記された（17 種）
  - 型: `VideoSourceType`, `PlayerStatus`, `PlaybackRate`, `VideoSourceType`, `YouTubeSource`, `LocalSource`, `VideoSource`, `VideoPlayerErrorCode`, `VideoPlayerError`, `VideoPlayerControls`, `VideoPlayerState`, `PlayerEvent`, `VideoPlayerAdapter`, `UseVideoPlayerReturn`, `VideoPlayerProps`, `VideoPlayerSlotProps`, `VideoPlayerSlots`
  - 定数: `PLAYBACK_RATES`, `VIDEO_PLAYER_ERROR_CODE`
- [x] `PLAYBACK_RATES` が `readonly PlaybackRate[]` としてエクスポートされる
- [x] `VIDEO_PLAYER_ERROR_CODE` が `VideoPlayerErrorCode` 全値を集約してエクスポートされる
- [x] `app/utils/video-playback/` ディレクトリが存在する（`.gitkeep`）
- [x] `tests/unit/utils/video-playback/` ディレクトリが存在する（`.gitkeep`）
- [x] `extractYouTubeId` / `clampMs` は declare を書かず、コメントで仕様を記録

---

## 遭遇した問題

特になし。`app/types/` ディレクトリは既存のため新規作成不要だった。
`tests/unit/utils/` は `rule-engine` サブディレクトリのみ存在し、`video-playback/` は新規作成。

---

## 次のステップ

`/tsumiki:direct-verify TASK-0001` を実行して以下を確認:
- `pnpm typecheck` で型エラーゼロ
- 各ディレクトリの存在確認
- `PLAYBACK_RATES` の readonly エクスポート確認
- `VIDEO_PLAYER_ERROR_CODE` のエクスポート確認
