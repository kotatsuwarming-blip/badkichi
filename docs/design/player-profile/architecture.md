# player-profile アーキテクチャ設計

**作成日**: 2026-09-27
**要件**: [../../spec/player-profile/requirements.md](../../spec/player-profile/requirements.md)（確定済み 2026-09-27）

## 方針

既存 player-management の素直な拡張。新しいアーキテクチャ要素なし。
2 PR に分割し、それぞれ additive migration + フォーム/表示の変更のみ。
統計 RPC への組み込みはスコープ外（REQ-402）。

## PR ①: feat/player-roster-type

| 層 | 変更 |
|---|---|
| DB | `players.roster_type` 追加（migration 1 本, DEFAULT 'member'） |
| 型 | `app/types/player-management.ts`（相当）に `RosterType` 追加 + supabase.ts 手動追記 |
| フォーム | `PlayerFormModal.vue` に区分セグメント（新規時も編集時も表示。既定 member, REQ-002） |
| 一覧 | 選手一覧を member → opponent の 2 グループ表示（REQ-003） |
| 統計 | `StatsGlobalFilterBar` の選手/ペア選択を member 先頭グルーピング（REQ-004。選択肢からは除外しない） |
| 試合作成 | `MatchFormModal` は混在選択のまま（REQ-005 = 変更なしを確認するだけ） |

## PR ②: feat/player-profile

| 層 | 変更 |
|---|---|
| DB | プロフィール 7 列追加（migration 1 本。全て NULL 可 or DEFAULT 付き, REQ-401） |
| 定数 | `app/utils/players/profile.ts` — PLAY_STYLES（9 種）/ PRACTICE_FREQUENCIES（5 段階）/ 導出関数 `deriveAge` `deriveCareerYears`（date-fns 不使用・素朴な計算で境界日テスト） |
| フォーム | `PlayerFormModal.vue` に「詳細プロフィール」折りたたみセクション（REQ-103。全項目任意）。歴は「開始年月」入力 + 「歴 n 年」逆算入力の併記（REQ-101） |
| 表示 | 選手一覧に主要プロフィールバッジ（年齢・歴・スタイル）。詳細は一覧行の展開 or 既存詳細導線に合わせる（実装時に既存 UI へ追従） |
| i18n | ja/en 両方（play style 9 種・頻度 5 段階のラベル含む） |

## バリデーション（EDGE-001/002）

- フォーム側: birthdate ≦ 今日 / badminton_since ≧ birthdate / height 100–250 / weight 30–150
- DB 側: CHECK 制約（database-schema.sql）— フォームをすり抜けた不正値の最終防衛

## テスト戦略

- `profile.ts` 導出関数の単体（誕生日当日・前日・閏日 / since 未来日拒否はフォーム層）
- PlayerFormModal のコンポーネントテスト既存に追従（区分セグメント・プロフィール任意保存）
- RLS/CRUD の integration は既存 players テストの列追加で対応
