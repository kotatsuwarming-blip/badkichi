# shot-value コンテキストノート（セッション引き継ぎ用）

**作成日**: 2026-09-16
**状態**: 要件定義完了。次は `/kairo-design shot-value`。

## 1. 依存関係と実装順（重要）

- **feat/shot-stats は main 未マージ**。その上に feature/singles（**PR #60**, base=main）が進行中で、
  タブ画面・StatsWeaknessMaps・ミラー規則など本要件の前提実装はすべてそちらに載っている。
- 本 spec ブランチ（docs/spec-shot-value）は main 起点のため、**参照先の shot-stats spec は
  main にはまだ無い**（docs/spec-shot-stats ブランチ）。リンク切れは PR #60 系のマージで解消される。
- **実装ブランチ（feat/shot-value）は PR #60 マージ後に main から切ること**。
  それ以前に design/tasks を進めるのは可（読み取り調査は feature/singles checkout で行う）。
- PR #54（fix/rally-length-bins, U-06 ビン分割）も OPEN のまま。無関係だがマージ忘れ注意。

## 2. 既存コードの接点（design 時に読むもの）

| 対象 | 場所 | 関係 |
|---|---|---|
| タブ定義 | `i18n/locales/ja.json` `shotStats.tabs`（serve/strengths/weakness/rallyflow）+ stats ページ 2 枚 | strengths+weakness → 「強み・課題」1 タブへ改組（REQ-201） |
| 弱点チャート | `app/components/stats/StatsWeaknessMaps.vue` | そのまま新タブ下部へ移設。`shotStats.strengths.note`（再考中 placeholder）は削除 |
| 決定打・in/out 導出 | `app/utils/annotation/derive.ts` | 採点規則の正（REQ-001）。SQL 側は stats_shot_types migration 内 decisive CTE が前例 |
| 既存 RPC 前例 | `supabase/migrations/20260805150000_shot_stats_read_functions.sql` の `stats_shot_types` | grain・scoped CTE・打順 window の書き方の直接の下敷き |
| 座標ミラー | shot-stats REQ-105 / `stats_shot_placement` / `app/utils/shot-stats/mirror.ts` | ゾーン割当（REQ-004/101）と同一規則必須 |
| 母数・バッジ | shot-stats REQ-002/003 実装（StatsAnnotationBadge 等） | 踏襲（REQ-402） |

## 3. 設計の要点（要件から確定済み）

- **RPC は 1 本・役割別カウントの grain**: (hit_player_id, shot_type, zone 3×3 or null, 役割) → count。
  役割 = kime / yuhatsu / fuseki1 / fuseki2 / miss / yurushi1 / yurushi2 / none。
  重み合成・ゾーン合算・SV100・CI は**すべてクライアント**（NFR-001, REQ-401）。
  score が役割から決まるため、役割カウントだけで平均も分散も厳密に再構成できる（CI 用の別列は不要）。
- **定数 1 箇所**: 例 `app/utils/shot-value/weights.ts` に `SV_WEIGHTS = { induce: 1.0, setback: [0.7, 0.5] }`。
- 遡りのチーム帰属は打順の偶奇（全接触記録前提）。hit_player_id null でも位置は消費（REQ-104）。
- 画面の見た目の正は **spec 同梱の sv-drilldown-mock.html**（動くダミーデータ版。
  Artifact: https://claude.ai/code/artifact/3c45e0e6-9024-4ee9-82eb-26087dcedb93 と同一物）。
  等式表示（稼いだ − 失った = 収支）+ 平易文まで反映済み。
- チャート実装は既存に合わせ vue-echarts でも素の HTML/CSS でも可（モックは後者。design で決定）。

## 4. 未確定・実装後に締めるもの

- ~~タブ名「強み・課題」~~ → 承認済み（2026-09-16。検算例含め requirements 承認）
- 🟡 重み w/b1/b2 の較正（注釈済み実試合で球種ランキングを見て感覚と照合 — interview Q9）
- 保留: 5 色→「2 色 + 開いて内訳」への簡略化（Q8。初見ユーザの反応を見て）
- 検算例（requirements.md）は単体テストのフィクスチャにそのまま使うこと

## 5. スコープ外（将来）

- 相手ポジション軸（ミックスの「上げさせる」分析）— Q6 で明示除外
- 学習ベース shot influence（ShuttleScorer / ShuttleSet, ダブルス橋渡し研究 2025 あり）— データ蓄積後
- 押し込み率（球種攻守分類）は**不採用が確定**（Q5）。復活させないこと
