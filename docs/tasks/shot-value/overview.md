# shot-value 実装タスク

**作成日**: 2026-09-16
全タスク数: 7 / 推定: 24h / クリティカルパス: TASK-0001 → 0005 → 0006 → 0007
**実装ブランチ**: `feat/shot-value`（**feature/singles 起点で先行着手**。PR は #60 マージ後に main へ。
PR 作成時に base 差分が feature/singles 分を含まないことを確認）

## フェーズ1: 基盤（0001 と 0002 は並行可）

### TASK-0001: stats_shot_value RPC（migration + 検算テスト）

- [ ] **タスク完了**
- **タスクタイプ**: TDD / **要件**: REQ-001, 101〜104, 401 / **依存**: なし
- 実装: `supabase/migrations/{ts}_shot_value_read_function.sql`（design/database-schema.sql の草案を実装。
  placement 20260808140000 と向き正規化の一致を目視確認）
- テスト: integration — requirements 検算例（ミス決着5打 / エース決着5打）+ service_fault +
  2打決着 + end_reason unknown 除外 + camera null のゾーン null + pid null 除外
- 完了条件: supabase types 再生成（[gen-types] 手順）まで

### TASK-0002: 型 + 重み定数 + score.ts 純関数

- [ ] **タスク完了**
- **タスクタイプ**: TDD / **要件**: REQ-002, 003, 005〜007 / **依存**: なし
- 実装: `app/types/shot-value.ts` / `app/utils/shot-value/{weights,score}.ts`
  （design/interfaces.ts のシグネチャ。aggregateRoles / toAggregate / typeBreakdown / zoneCells）
- テスト: 検算例の SV100・earned/lost 成分・CI・重み差し替え・n<5 lowSample・
  ゾーン選択の REQ-101 境界（null ゾーン行の含む/含まない）

## フェーズ2: UI（0003・0004 並行可 → 0005 で結線）

### TASK-0003: StatsShotValueCourt（3×3 セレクタ）

- [ ] **タスク完了**
- **タスクタイプ**: TDD / **要件**: REQ-004 / **依存**: 0002
- 実装: button セル 3×3・複数選択・行一括・セル内 SV/n・ネット位置表示（モック準拠。
  zone_row 2 = ネット際を上段に描画）
- UI/UX: aria-pressed / focus-visible / モバイルはタップ領域 44px 確保
- テスト: 選択トグル emit・行一括・全解除

### TASK-0004: StatsShotValueSummary + Breakdown

- [ ] **タスク完了**
- **タスクタイプ**: TDD / **要件**: REQ-003, 005〜007 / **依存**: 0002
- 実装: 等式チップ（稼いだ−失った=収支±CI）+ 平易文 / 5 役割積み上げ行 + ヒゲ + 凡例 +
  ホバー数値（title）+ n 降順 + n<5 薄表示 + 空状態（EDGE-003）
- テスト: 表示値・薄表示・空状態・i18n キー

### TASK-0005: StatsShotValuePanel + rpc.ts 結線

- [ ] **タスク完了**
- **タスクタイプ**: TDD / **要件**: REQ-004, 101, 202, NFR-001 / **依存**: 0001, 0003, 0004
- 実装: 選択状態保持・打者/hand フィルタ適用・rpc.ts（呼び出しは初回+セット切替のみ）
- テスト: 選択変更で再フェッチしないこと・フィルタ連動・母数併記

## フェーズ3: 統合

### TASK-0006: タブ改組（強み・課題）

- [ ] **タスク完了**
- **タスクタイプ**: TDD / **要件**: REQ-201〜203, 402 / **依存**: 0005
- 実装: 両 stats ページのタブ 4→3・SV パネル + StatsWeaknessMaps 移設・
  i18n（tabs.strengths 改名 / tabs.weakness, strengths.note 削除 / shotStats.value.* 追加, ja+en）
- テスト: ページテスト更新・check-i18n-keys・シングルス注記（REQ-203）

### TASK-0007: dev 検証 + 仕上げ

- [ ] **タスク完了**
- **タスクタイプ**: DIRECT / **依存**: 0006
- dev マージ → localhost で注釈済み試合を目視（acceptance-criteria.md のブラウザ項目）→
  lint / typecheck / vitest 全 green → note.md 状態更新
