# shot-stats タスク概要

**作成日**: 2026-08-04
**推定工数**: 88時間
**総タスク数**: 13件

## 関連文書

- **要件定義書**: [📋 requirements.md](../../spec/shot-stats/requirements.md)
- **アーキテクチャ**: [📐 architecture.md](../../design/shot-stats/architecture.md)
- **データフロー図**: [🔄 dataflow.md](../../design/shot-stats/dataflow.md)
- **インターフェース定義**: [📝 interfaces.ts](../../design/shot-stats/interfaces.ts)
- **RPC 定義（migration 原本）**: [🗄️ database-schema.sql](../../design/shot-stats/database-schema.sql)
- **RPC 仕様**: [🔌 api-endpoints.md](../../design/shot-stats/api-endpoints.md)
- **設計ヒアリング**: [💬 design-interview.md](../../design/shot-stats/design-interview.md)
- **コンテキストノート**: [📝 note.md](../../spec/shot-stats/note.md)

> 注: TASK-NNNN の詳細ファイルは各フェーズ着手時に作成する（overview 先行方式、
> shot-annotation と同じ）。番号は本ユニット内で TASK-0001 から採番。
>
> **実装順の方針（ヒアリング2026-08-04）**: ライブ系（J/K/L）先行。注釈ゼロで全既存試合に
> 即効くため、基盤 → ラリー展開タブ → 探針（注釈パス依存の軽い順 A→C→D→F/G）の順。
>
> **前提**: 実装ブランチ `feat/shot-stats` は **PR #50（shot-annotation）マージ後**に main から
> 切る（生成型 `app/types/supabase.ts` の注釈列に依存）。**→ 2026-08-05 マージ済み・実装開始可**。
> CLAUDE.md ワークフロー（ブランチ → dev マージ → localhost 検証 → main へ PR）に従う。
> shot_type は 19 値（18種 + unknown。2026-08-05 の lob/clear 分割後）が正。
> ドッグフーディング済みの注釈フル入力試合が 1 件あり、Phase 3 の動作確認データに使える。

## フェーズ構成

| フェーズ | 成果物 | タスク数 | 工数 |
|---------|--------|----------|------|
| Phase 1 | 基盤: 3タブ化 + RPC migration + 型 + coverage バッジ | 4 | 24h |
| Phase 2 | ラリー展開タブ: J / K / L（ライブ系・注釈不要） | 4 | 26h |
| Phase 3 | ショット分析タブ: 探針 A / C / D / F / G | 4 | 32h |
| Phase 4 | 統合: レスポンシブ調整 / i18n 整備 / 結合スモーク / 性能実測 | 1 | 6h |

## マイルストーン

- **M1: 基盤完成**: 3 タブ化した stats 画面が既存機能を壊さず動き（概要タブ = 既存そのまま）、
  RPC 5 本が CI db:push で適用済み・integration テスト green
- **M2: ラリー展開タブ完成**: J/K/L が全既存試合のライブデータで動く → **この時点で dev 検証 +
  先行リリース可**（注釈がなくても価値が出る）
- **M3: ショット分析タブ完成**: 探針 5 枚が注釈済み試合で動く（作者の注釈済みデータで確認）
- **M4: 結合完了**: スマホ実機確認・性能実測（NFR-001 3 秒・唯一の残 🟡）→ main へ PR →
  テスター限定代行（ADR-018 仮説A 検証）へ

## Phase 1: 基盤構築（24h）

- [x] TASK-0001: RPC migration（stats_annotation_coverage / stats_shot_types / stats_shot_zones /
  stats_rally_endings / stats_rally_tempo + GRANT） - 4h (DIRECT) 🔵
  *database-schema.sql をそのまま `supabase/migrations/<ts>_shot_stats_read_functions.sql` へ。
  CI 経由 db:push（REQ-402）。適用後 `pnpm db:types` で生成型更新*
- [x] TASK-0002: RPC integration テスト - 6h (TDD) 🔵
  *`tests/integration/stats-dashboard/shot-stats-rpc.integration.test.ts`。RLS 隔離（TC-C-E02）・
  invalid_scope・**decisiveShotIndex / deriveOutDirection との規則突き合わせ（REQ-406 / TC-406-01）**・
  レット除外（TC-C-01）を検証*
- [x] TASK-0003: 型定義 `app/types/shot-stats.ts` + `callStatsRpc` fn union 拡張 - 4h (TDD) 🔵
  *interfaces.ts を実装。ECharts プラグインへ Scatter/MarkLine/MarkArea 追加登録も含む*
- [x] TASK-0004: stats 画面 3 タブ化 + coverage バッジ - 10h (TDD) 🔵
  *両 stats ページを「概要 / ショット分析 / ラリー展開」に再編（既存機能デグレなし = 既存
  unit テスト green 維持）。グローバルフィルタ・動画ペインはタブ横断（v-show 保持）。
  タブ遅延ロード骨格。`coverage.ts` 純関数 + `StatsAnnotationBadge.vue`（REQ-002/003）*

## Phase 2: ラリー展開タブ = ライブ系先行（26h）

- [ ] TASK-0005: `useRallyFlowView` composable - 6h (TDD) 🔵
  *stats_rallies（既存）+ stats_rally_tempo + coverage を並列取得。スコープ・フィルタは
  既存 StatsGlobalFilter を共有（dataflow.md）*
- [ ] TASK-0006: J 局面別得点率（`phase.ts` + `StatsPhaseRateChart.vue`） - 6h (TDD) 🔵
  *序盤 0-7/中盤 8-14/終盤 15-（リード側基準）+ 接戦 = 終盤 2 点差以内・延長含む
  （REQ-013/014, TC-013 系）。選手/ペア別・母数併記*
- [ ] TASK-0007: K 展開スピード（`tempo.ts` + `StatsTempoChart.vue`） - 6h (TDD) 🔵
  *全ショット時刻ありのみ適格（REQ-106, TC-106 系）。連続値分布・得点/失点重ね・
  avg⇄last3 トグル（REQ-015/016）・近似注記（REQ-107）・除外数併記*
- [ ] TASK-0008: L セット推移（`momentum.ts` + `StatsSetFlowChart.vue`） - 8h (TDD) 🔵
  *階段折れ線 + 3 連続以上のラン帯 + 最大連取/連失注記 + 11 点目印（REQ-017/018,
  TC-017/018 系）。タップ → スコア表示 + 動画ジャンプ + ラリー一覧連動（REQ-019, 既定 2 秒前）。
  試合単位のみ・記録途中セット対応（REQ-203）*

## Phase 3: ショット分析タブ = 探針 5 枚（32h）

- [ ] TASK-0009: `useShotStatsView` composable + フィルタ 4 軸 - 8h (TDD) 🔵
  *4 RPC 並列取得。選手・球種 = クライアント絞り込み / セット・hand = パラメータ再取得
  （ヒアリング2026-08-04 了承の grain 設計）。全チャート連動（REQ-004）*
- [ ] TASK-0010: A 決着分析（`endings.ts` + `mirror.ts` + `StatsCourtZones.vue` +
  `StatsEndingsChart.vue` + `StatsEndingsCourtMap.vue`） - 10h (TDD) 🔵
  *決着 4 分類 + unknown 別掲（REQ-005, EDGE-105）・決定打ランキング「未注釈」区別
  （REQ-006/108）・SVG コート図 3×3 落下点（REQ-007）・ミラー/クランプ（REQ-105, EDGE-101）・
  out_direction フォールバック（REQ-103）。TC-005/006/007 系*
- [ ] TASK-0011: C サーブ種別 + G フォア/バック（`StatsServeTypeChart.vue` +
  `StatsHandChart.vue`） - 6h (TDD) 🔵
  *C: serve 3 種 × 得点率・右/左絞り込み（REQ-008, StatsPositionToggle 再利用）。
  G: 球種別 F/B 比率 + F/B 別成果・hand null 除外の母数反映（REQ-012/102）。TC-008/012 系*
- [ ] TASK-0012: D 球種構成比・成果 + F 配球ヒートマップ（`StatsShotMixChart.vue` +
  `StatsShotOutcomeChart.vue` + `StatsShotMixScatter.vue` + `StatsShotHeatmap.vue`） - 8h (TDD) 🔵
  *D: 構成比・ミス率/決定率（分母 = 総打数）・使用割合×得点率散布図・相手選手も選択可
  （REQ-009/010, TC-009/010 系）。F: StatsCourtZones 再利用のヒートマップ + 選手・球種フィルタ
  （REQ-011, TC-011 系）*

## Phase 4: 統合（6h）

- [ ] TASK-0013: 結合スモーク + レスポンシブ / i18n / 性能実測 - 6h (TDD) 🔵
  *タブ横断の結合確認（フィルタ→チャート→テーブル→動画）。スマホ幅 375px（TC-NFR-202-01）。
  ja/en キー整備（check-i18n-keys）。NFR-001 実測（残 🟡 の解消。遅ければ index 検討 →
  設計の見送り判断を見直し）。dev で localhost 検証 → main へ PR*

## 依存関係

```
TASK-0001 → TASK-0002（RPC がないと integration 不可）
TASK-0001 → TASK-0003（生成型の更新に依存）
TASK-0003 → TASK-0004 → TASK-0005 → TASK-0006/0007/0008（並行可）
TASK-0004 → TASK-0009 → TASK-0010 → TASK-0011/0012（並行可。0010 が StatsCourtZones を先行実装）
TASK-0006〜0012 → TASK-0013
```

**クリティカルパス**: TASK-0001 → 0003 → 0004 → 0009 → 0010 → 0012 → 0013（約 50h）
※ Phase 2（0005〜0008）は Phase 3 と独立しており、M2 時点で先行 dev 検証・リリース可能

## タスク番号管理

**使用済みタスク番号**: TASK-0001 〜 TASK-0013
**次回開始番号**: TASK-0014

## 信頼性レベルサマリー

- **総タスク数**: 13 件
- 🔵 青信号: 13 件（100%）— 全タスクが requirements（🔵100%）・design（🔵99%）・
  受け入れ基準 TC に直接紐づく
- 🟡 黄信号: 0 件（性能実測は TASK-0013 に内包。design 唯一の 🟡 をここで解消する）
- 🔴 赤信号: 0 件

**品質評価**: 高品質

## 次のステップ

- 実装開始条件: **PR #50 マージ**（未マージなら先にそちらを進める）
- タスク実装: `/kairo-implement shot-stats TASK-0001`（または各フェーズ着手時に
  TASK 詳細ファイルを作成してから実装）
