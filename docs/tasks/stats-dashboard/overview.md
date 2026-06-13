# stats-dashboard タスク概要

**作成日**: 2026-06-09
**推定工数**: 約 119 時間
**総タスク数**: 19 件
**作業規模**: 詳細タスク分割

## 関連文書

- **要件定義書**: [📋 requirements.md](../../spec/stats-dashboard/requirements.md)
- **設計文書**: [📐 architecture.md](../../design/stats-dashboard/architecture.md)
- **API/RPC 仕様**: [🔌 api-endpoints.md](../../design/stats-dashboard/api-endpoints.md)
- **データベース設計（集計RPC）**: [🗄️ database-schema.sql](../../design/stats-dashboard/database-schema.sql)
- **インターフェース定義**: [📝 interfaces.ts](../../design/stats-dashboard/interfaces.ts)
- **データフロー図**: [🔄 dataflow.md](../../design/stats-dashboard/dataflow.md)
- **コンテキストノート**: [📝 note.md](../../spec/stats-dashboard/note.md)

## フェーズ構成

| フェーズ | 成果物 | タスク数 | 工数 |
|---------|--------|----------|------|
| Phase 1 基盤・集計層 | echarts 基盤・型・読み取り専用集計 RPC 4本 | 4 | 21h |
| Phase 2 ドメイン・composable | 純関数 utils・Read composable | 6 | 36h |
| Phase 3 フロントエンド | チャート/テーブル/プレーヤー・2ダッシュボードページ | 7 | 49h |
| Phase 4 統合 | 相互導線・結合スモーク・受け入れ | 2 | 13h |

## タスク番号管理

**使用済み**: TASK-0001 ~ TASK-0019
**次回開始番号**: TASK-0020

## 全体進捗

- [ ] Phase 1: 基盤・集計層
- [ ] Phase 2: ドメインロジック・composable
- [ ] Phase 3: フロントエンド実装
- [ ] Phase 4: 統合

## マイルストーン

- **M1: 集計層完成**: 集計 RPC 4本 + integration テスト green（TASK-0004 完了）
- **M2: ロジック層完成**: utils + composable 完成（TASK-0010 完了）
- **M3: UI 完成**: 2ダッシュボードページ動作（TASK-0017 完了）
- **M4: MVP 完成**: 相互導線 + 結合スモーク green（TASK-0019 完了）

---

## Phase 1: 基盤・集計層

**目標**: チャート基盤・型・Postgres 側集計（読み取り専用 RPC）を用意する。

### タスク一覧

- [ ] [TASK-0001: echarts/vue-echarts 依存追加 + client plugin](TASK-0001.md) - 3h (DIRECT) 🔵
- [ ] [TASK-0002: 型定義 app/types/stats-dashboard.ts 配置](TASK-0002.md) - 2h (DIRECT) 🔵
- [ ] [TASK-0003: 集計RPC migration（stats_player_rates + stats_pair_rates）+ integration](TASK-0003.md) - 8h (TDD) 🔵
- [ ] [TASK-0004: 集計RPC追記（stats_rally_length + stats_rallies）+ integration](TASK-0004.md) - 8h (TDD) 🔵

### 依存関係

```
TASK-0001 → TASK-0011, TASK-0012
TASK-0002 → (ほぼ全タスク)
TASK-0003 → TASK-0004 → TASK-0009, TASK-0010
```

---

## Phase 2: ドメインロジック・composable

**目標**: 純関数（集計整形・絞り込み）と Read composable を実装する。

### タスク一覧

- [ ] [TASK-0005: 得点率算出ユーティリティ compute-player-rate](TASK-0005.md) - 5h (TDD) 🔵
- [ ] [TASK-0006: ラリー長ビン集約 rally-length-bins / to-rally-length-series](TASK-0006.md) - 6h (TDD) 🔵
- [ ] [TASK-0007: ラリー絞り込み filter-rallies（選手/ペア×役割/ビン）](TASK-0007.md) - 6h (TDD) 🔵
- [ ] [TASK-0008: useStatsFilter（クロスフィルタ状態）](TASK-0008.md) - 6h (TDD) 🔵
- [ ] [TASK-0009: useMatchStats + useMatchRallies](TASK-0009.md) - 7h (TDD) 🔵
- [ ] [TASK-0010: useGroupStats + useGroupRallies](TASK-0010.md) - 6h (TDD) 🔵

### 依存関係

```
TASK-0002 → TASK-0005, TASK-0006
TASK-0006 → TASK-0007 → TASK-0008
TASK-0003,0004,0005,0006 → TASK-0009
TASK-0003,0004,0005,0006,0008 → TASK-0010
```

---

## Phase 3: フロントエンド実装

**目標**: チャート・テーブル・埋め込みプレーヤーと、試合単位／Group 横断の2ダッシュボードを実装する。

### タスク一覧

- [ ] [TASK-0011: StatsRateChart.vue（得点率チャート）](TASK-0011.md) - 7h (TDD) 🔵
- [ ] [TASK-0012: StatsRallyLengthChart.vue（本数+勝率コンボ・ビン複数選択）](TASK-0012.md) - 8h (TDD) 🔵
- [ ] [TASK-0013: StatsRallyTable.vue（ラリー一覧）](TASK-0013.md) - 7h (TDD) 🔵
- [ ] [TASK-0014: StatsVideoPane.vue（埋め込みプレーヤー・ソース切替）](TASK-0014.md) - 7h (TDD) 🔵
- [ ] [TASK-0015: StatsEmptyState.vue + i18n stats.* 基本](TASK-0015.md) - 4h (TDD) 🔵
- [ ] [TASK-0016: 試合単位ダッシュボードページ](TASK-0016.md) - 8h (TDD) 🔵
- [ ] [TASK-0017: Group 横断ダッシュボードページ](TASK-0017.md) - 8h (TDD) 🔵

### 依存関係

```
TASK-0001,0002 → TASK-0011, TASK-0012
TASK-0006 → TASK-0012
TASK-0002 → TASK-0013, TASK-0014, TASK-0015
TASK-0008,0009,0011,0012,0013,0014,0015 → TASK-0016
TASK-0008,0010,0011,0012,0013,0014,0015 → TASK-0017
```

---

## Phase 4: 統合

**目標**: 画面間導線と結合スモーク、受け入れ基準の突き合わせ。

### タスク一覧

- [ ] [TASK-0018: record ↔ stats 相互導線 + i18n 仕上げ](TASK-0018.md) - 5h (TDD) 🔵
- [ ] [TASK-0019: 結合スモーク + 受け入れ確認](TASK-0019.md) - 8h (TDD) 🔵

### 依存関係

```
TASK-0016, TASK-0017 → TASK-0018 → TASK-0019
```

---

## クリティカルパス

```
TASK-0002 → TASK-0003 → TASK-0004 → TASK-0009 → TASK-0016 → TASK-0018 → TASK-0019
```

並行可能: Phase 2 の utils（0005/0006/0007）、Phase 3 のコンポーネント（0011〜0015）は相互に並行実装しやすい。

## 信頼性レベルサマリー

- **総タスク数**: 19 件
- 🔵 青信号: 19 件 (100%) ※各タスク本体の信頼性。要件・設計・ヒアリングに全て裏付け
- 🟡 黄信号: 0 件（タスク内の一部 UI/UX 項目に 🟡 あり：レイアウト代替 NFR-203・echarts モジュール確定・ビン境界）
- 🔴 赤信号: 0 件

**品質評価**: 高品質

## 次のステップ

- 全タスク順番に実装: `/tsumiki:kairo-implement`
- 特定タスクを実装: `/tsumiki:kairo-implement TASK-0001`
- 自動ループ実装: `/tsumiki:kairo-loop`（[[feedback_kairo_loop_workflow]]）
