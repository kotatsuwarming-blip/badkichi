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
- [x] migrate-dev 完了確認（CI run 34799566906 success, 25s）
- [x] 型再生成差分の確認（REQ-408）: gen-types CI (ab94d8c) を正として採用。RPC 戻り値の nullability は生成器の制約で string になるが、ドメイン型 (shot-stats.ts) が null 許容を担うため問題なし
- [x] ブラウザでの受け入れ基準確認（2026-09-14、dev = localhost:3000）
- [ ] main への PR

## ブラウザ受け入れ確認の結果（2026-09-14）

テストデータ: 試合「シングルス受入テスト」（あすか vs やまかな、2026-09-14）を dev に作成し確認。**確認用データは削除せず残置**（不要なら一覧から削除可）。

| TC | 結果 | 備考 |
|---|---|---|
| TC-002-01 / TC-101-01 | ✅ | 形式ラジオ既定ダブルス。シングルス切替で「選手 A/B」1 枠ずつ |
| TC-003-01 | ✅ | singles + player2 NULL で保存成功、一覧に反映 |
| TC-007-01 | ✅ | 一覧全行に形式バッジ（シングルス/ダブルス） |
| TC-104-01 | ✅ | セット設定にファースト欄なし、チームラベル 1 人名 |
| TC-106-01 | ✅ | A入替/B入替なし、次のセットへ/コートチェンジあり |
| TC-107-01/02 | ✅ | 0-0 右コート → 1-0 左コート（サーバー移動）、空セル表示、矢印対角 |
| TC-005-02 | ✅ | 1-1 でサーブ権 B へ、B=1（奇数）で左コート |
| TC-109-01 | ✅ | リロードで 1-1・サーバー・履歴 2 件を復元（2 行再開） |
| TC-110-01 | ✅ | シングルス試合統計に「ペア別」なし、選手別に 2 選手表示 |
| TC-301-02 | ✅ | 統計コート図にシングルスサイドライン常時描画 |
| TC-301-03 | ✅ | 記録コート図（シングルス）にサイドライン描画 |
| TC-302-01 | ✅ | 失点マップ注記「選手単位の集計です（シングルス）」 |
| TC-404-01 / EDGE-103 | ✅ | グループ統計ペア別はダブルス 3 組のみ（偽ペア混入なし） |
| TC-108-01（注釈） | 単体テストで担保 | 動画なし試合のためショット打刻不可。実動画での確認は初回実利用時に |
| TC-002 系ダブルス回帰 | ✅ | 既存 5 試合の一覧・バッジ・ペア別集計が従来どおり
