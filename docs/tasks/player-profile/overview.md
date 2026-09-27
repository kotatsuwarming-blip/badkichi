# player-profile 実装タスク

**作成日**: 2026-09-27
全タスク数: 5 / 推定: 14h / 2 PR 直列（PR ① → ②）

## PR ①: feat/player-roster-type（main 起点）

### TASK-0001: roster_type migration + 型

- [ ] **タスク完了** / TDD / REQ-001 / 依存: なし
- migration（DEFAULT 'member'）+ supabase.ts 手動追記 + RosterType 型。既存 players integration テストに列検証追加

### TASK-0002: フォーム・一覧・統計フィルタの区分対応

- [ ] **タスク完了** / TDD / REQ-002〜005 / 依存: 0001
- PlayerFormModal セグメント（新規時から選択可・既定 member）/ 一覧 2 グループ表示 /
  StatsGlobalFilterBar member 先頭グルーピング / MatchFormModal は現状維持確認
- i18n ja/en。dev 検証 → PR ①

## PR ②: feat/player-profile（PR ① マージ後 main 起点）

### TASK-0003: プロフィール列 migration + profile.ts 定数・導出

- [ ] **タスク完了** / TDD / REQ-101/102/401, EDGE-001/002 / 依存: PR ① マージ
- design/database-schema.sql の PR ② 部分 + PLAY_STYLES/PRACTICE_FREQUENCIES 定数 +
  deriveAge/deriveCareerYears/sinceFromYears（境界日・閏日テスト）

### TASK-0004: フォーム詳細プロフィールセクション

- [ ] **タスク完了** / TDD / REQ-103, EDGE-001/002 / 依存: 0003
- 折りたたみセクション（全項目任意）。歴は開始年月入力⇄「歴 n 年」逆算入力の併記。
  バリデーション（未来日・since<birthdate・範囲）

### TASK-0005: 一覧/詳細表示 + 仕上げ

- [ ] **タスク完了** / TDD / REQ-104/105 / 依存: 0004
- 一覧バッジ（年齢・歴・スタイル）・i18n ja/en・全チェック → dev 検証 → PR ②
