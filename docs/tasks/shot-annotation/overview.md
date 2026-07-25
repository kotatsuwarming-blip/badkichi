# shot-annotation タスク概要

**作成日**: 2026-07-25
**推定工数**: 85時間
**総タスク数**: 12件

## 関連文書

- **要件定義書**: [📋 requirements.md](../../spec/shot-annotation/requirements.md)
- **アーキテクチャ**: [📐 architecture.md](../../design/shot-annotation/architecture.md)
- **データフロー図**: [🔄 dataflow.md](../../design/shot-annotation/dataflow.md)
- **UI 設計**: [🎨 ui-design.md](../../design/shot-annotation/ui-design.md)
- **インターフェース定義**: [📝 interfaces.ts](../../design/shot-annotation/interfaces.ts)
- **migration**: [🗄️ database-schema.sql](../../design/shot-annotation/database-schema.sql)
- **設計ヒアリング**: [💬 design-interview.md](../../design/shot-annotation/design-interview.md)

> 注: TASK-NNNN の詳細ファイルは各フェーズ着手時に作成する（overview 先行方式）。
> 番号は本ユニット内で TASK-0001 から採番。

## フェーズ構成

| フェーズ | 成果物 | タスク数 | 工数 |
|---------|--------|----------|------|
| Phase 1 | migration / 型 / 純ロジック5モジュール + 単体テスト | 3 | 16h |
| Phase 2 | session / save / progress composable | 3 | 18h |
| Phase 3 | 3モードの composable + パネル UI | 4 | 37h |
| Phase 4 | ページ統合 / i18n / 結合スモーク / 初期値の試用調整 | 2 | 14h |

## マイルストーン

- **M1: 基盤完成**: migration 適用（CI db:push）+ 型 + 純ロジック（テスト green）
- **M2: データ層完成**: 読込・楽観保存・進捗導出が実データで動く
- **M3: 3モード完成**: クイック/種別/打点が一通り操作できる（ローカル + YouTube 両モード）
- **M4: 結合完了**: annotate.vue 統合 + i18n → **作者ドッグフーディング**（QA + ラベル蓄積 +
  D6 初期値の調整）→ テスター限定代行（ADR-018）へ

## Phase 1: 基盤構築（16h）

- [x] TASK-0001: 注釈列 additive migration（shots 9列 + rallies 4列） - 2h (DIRECT) 🔵
  *database-schema.sql をそのまま適用。CI 経由 db:push（REQ-406）。新規 RLS 不要（D2）*
- [x] TASK-0002: 型定義 `app/types/shot-annotation.ts` - 4h (TDD) 🔵
  *interfaces.ts を実装。Database 生成型の再生成込み*
- [x] TASK-0003: 純ロジック `app/utils/annotation/`（taxonomy / courtCoords / derive /
  orderMatching / offset）+ 単体テスト - 10h (TDD) 🔵
  *acceptance-criteria.md の TC-005/006/007/010/014 系がテスト仕様。NFR-401 の主戦場*

## Phase 2: データ層（18h）

- [x] TASK-0004: `useAnnotationSession`（一括読込・レット除外一元化 D5・cursor・undo 1段） - 8h (TDD) 🔵
- [x] TASK-0005: `useAnnotationSave`（列単位の楽観 UPDATE + 直列キュー + エラー処理 EDGE-007） - 6h (TDD) 🔵
- [x] TASK-0006: `useAnnotationProgress`（null 有無からモード別進捗・次の未注釈位置） - 4h (TDD) 🔵
  *TC-013 系がテスト仕様*

## Phase 3: 3モード実装（37h）

- [ ] TASK-0007: クイックパス（`useQuickPass` + QuickPassPanel + `CourtDiagramInput`
  ライン外込み + 整合チェック警告） - 8h (TDD) 🔵
- [ ] TASK-0008: 種別パス（`useTypePass` + TypePassPanel + キー捕捉・順番マッチング・
  hand トグル・レシーブハイライト・ラリーやり直し） - 10h (TDD) 🔵
- [ ] TASK-0009: 打点パス・ローカル（`usePositionPass` + OffsetCalibrator + ThumbStrip
  〔非表示 video + canvas + 先読み、D1〕+ 打者二択） - 14h (TDD) 🔵
- [ ] TASK-0010: 打点パス・YouTube（スローループ窓 前1.2s/後0.3s・annotated_timestamp_ms
  非保存・モード自動切替 TC-101） - 5h (TDD) 🔵

## Phase 4: 統合（14h）

- [ ] TASK-0011: `annotate.vue` ページ統合（AnnotationModeBar / AnnotationRallyList /
  video-playback 接続 / 試合詳細からの導線） - 8h (TDD) 🔵
- [ ] TASK-0012: i18n（ja/en）+ 結合スモーク + D6 初期値の試用調整
  （キー割当・サムネ帯枚数、作者ドッグフーディングの初回フィードバック反映） - 6h (DIRECT) 🔵

## タスク番号管理

**使用済みタスク番号**: TASK-0001 ~ TASK-0012
**次回開始番号**: TASK-0013
