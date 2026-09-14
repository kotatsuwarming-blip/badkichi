# singles-support 実装記録

**実装日**: 2026-09-14
**ブランチ**: `feature/singles`（実装コミット: bfd81bf）
**参照プロトタイプ**: `wip/singles-prototype`（2026-08-28 作成。各タスクの Green で参照し、Red → Green の順で本ブランチに再構成）

## TDD 実行ログ（Red → Green）

| タスク | Red（失敗テスト） | Green | 備考 |
|---|---|---|---|
| TASK-0002 | match-form.test.ts TC9〜12 が 4 件失敗 | 型 + schema + i18n 適用で 12/12 | |
| TASK-0003 | singles.test.ts 4/5 失敗 | createInitialState 補完で 5/5 + useRecordingSession 37 件回帰 green | applyRally 等は無変更 |
| TASK-0004 | build-set-input.test.ts 1 件失敗 | 7/7 | |
| TASK-0005 | endings/flow に singles ケース追加 → 2 件失敗 | 78/78（shot-stats 全体） | |
| TASK-0006 | CRUD 4 テストに match_type/singles 断言追加 → 4 件失敗 | 18/18 | |
| TASK-0007 | annotationSession + typePass → 2 件失敗 | 51/51（annotation 4 composable） | |
| TASK-0008 | フォーム/一覧テスト → 8 件失敗 | 23/23 | |
| TASK-0009 | recording コンポーネント → 4 件失敗 | 49/49（useRecordingSession 込み） | |
| TASK-0010 | StatsGlobalFilterBar → 1 件失敗 | 8/8 | |
| TASK-0012 | サイドライン 3 図 → 3 件失敗 | 15/15 | 2026-09-14 ヒアリングで昇格 |
| TASK-0013 | WeaknessMaps 注記 → 1 件失敗 | 同上 | 同上 |

TASK-0001（DIRECT）: migration + supabase.ts 手修正。pre-commit の migration 整合チェック OK。

## 最終検証

- `pnpm test`: **590 件 green**（114 ファイル）※ dev マージ後は 593 件
- `pnpm typecheck`: エラー 0
- `pnpm lint`: エラー 0（vue/attributes-order 警告 1 件を --fix で解消）
- `pnpm i18n:check`: ja/en キー構造一致 OK

## 実装中の判断・逸脱

- **Vue Boolean prop の既定値**: `showOverride` / `showPairMode` は未指定時に false へキャストされるため `withDefaults` で明示（設計 architecture.md に記載済みの注意点をそのまま適用）。
- **REQ-301a の適用範囲**: シングルスサイドラインは実コートに常在するため、注釈タップ図・統計ゾーン図では形式を問わず常時描画とした（形式 prop の配線が不要になり、ダブルスでもタップの目印になる）。
- **useMatches の埋め込み null**: PostgREST の to-one 埋め込みは FK NULL で `null` を返すことを利用し、`flatMap` で 1〜2 人に射影。
- コミット整理: 当初 docs コミットに実装ファイルが混入したため、push 前に docs（04f8996）/ feat（bfd81bf）へ組み直した。

## 残作業（TASK-0011）

- [x] dev マージ + push（af9f5c7、migrate-dev / ci / gen-types 発火）
- [ ] migrate-dev 完了確認（`supabase migration list`）
- [ ] `pnpm db:types` 再生成と手修正差分の確認（REQ-408）
- [ ] ブラウザでの受け入れ基準確認（acceptance-criteria.md §1〜§5b）
- [ ] main への PR
