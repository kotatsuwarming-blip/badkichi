# stats-dashboard 設計ヒアリング記録

**作成日**: 2026-06-08
**ヒアリング実施**: kairo-design step4 既存情報ベースの差分ヒアリング

## ヒアリング目的

確定済み要件定義・既存設計（video-playback / match-recording / data-foundation スキーマ）・コード規約（ADR-007/010、useAsyncData / RPC / VideoPlayer.client.vue）を踏まえ、集計の所在・チャート指標・横断ダッシュボードの読み込み方・フィルタ軸の曖昧点を明確化する。

## 質問と回答

### Q1: ラリー長 × 得点率チャートの「得点率」の定義

**質問日時**: 2026-06-08
**カテゴリ**: データモデル / 可視化
**背景**: 要件 REQ-005 の「得点率」が、サーブ側勝率 / チーム別 / 分布のいずれを指すか未確定（要件で 🟡 残）。

**回答**: **本数の分布と勝率を出して欲しい**（両方）。

**信頼性への影響**:
- ラリー長チャートを「**本数分布（棒）+ サーブ側勝率（線）のコンボチャート**」と確定。`stats_rally_length` は `shot_count, rallies, serve_won` を返し、勝率 = `serve_won / rallies` をクライアント算出。REQ-005 設計を 🔵 に。

---

### Q2: Group 横断ダッシュボードのラリーテーブルの読み込み方

**質問日時**: 2026-06-08
**カテゴリ**: パフォーマンス / アーキテクチャ
**背景**: 横断は全試合分でラリー行が大量になり得る。初期から全件 or 絞り込み後取得かで設計が変わる。

**回答**: **絞り込み後に表示**。

**信頼性への影響**:
- 横断は初期チャートのみ、フィルタ確定で `stats_rallies` を**サーバー側フィルタ + LIMIT** 取得（NFR-001 と整合）。per-match は小規模のため一括取得 + クライアント絞り込みに分岐（dataflow 機能2）。

---

### Q3: 横断チャートのフィルタ軸（ペア / 1 人）

**質問日時**: 2026-06-08
**カテゴリ**: データモデル / 可視化（ユーザーからの追加要望）
**背景**: 「横断チャートのフィルタとして、ペアにしたり、1 人を選択できて欲しい」との要望。

**回答**: **ペア単位 / 1 選手単位の両方**を選べるようにする。

**信頼性への影響**:
- 要件に REQ-012 を追加（🔵）。集計 RPC に `stats_pair_rates` を新設し、`stats_rallies` にペア絞り込み引数を追加。`useStatsFilter` の次元に「選手 / ペア」を含める。ペアは試合のチーム構成から無向 2 選手集合として導出（複数試合で同じ 2 人が組めば累計）。

---

### Q4: ラリー長チャートの選択でテーブルを絞るか / 粒度

**質問日時**: 2026-06-09
**カテゴリ**: 可視化 / クロスフィルタ（黄信号レビュー）
**背景**: ラリー長チャート選択をクロスフィルタに連動させるか（interfaces の shotCount フィルタが 🟡）。

**回答**: **絞り込みに使う。ただし個別ショット数ではなく区間（ビン）で、複数選択して和集合で絞りたい**（例: 1〜3 と 4〜6 → 1〜6。既定ビン 1〜3 / 4〜7 / 8〜12 / 13+）。

**信頼性への影響**:
- ラリー長チャートを**ビン表示**に変更。`StatsFilter.shotCount`（単一）→ `shotBinKeys: string[]`（複数選択の和集合）へ。
- RPC はショット数粒度のまま返し**ビン化はクライアント**（境界変更に migration 不要）。`stats_rallies` のラリー長フィルタを `p_shot_ranges jsonb`（OR 範囲）に変更。
- `RALLY_LENGTH_BINS` 定数 + `rally-length-bins.ts`（集約 / binsToRanges）を追加。🔵 に確定。

---

### Q5: ペア絞り込みと役割（サーブ/レシーブ）の連動

**質問日時**: 2026-06-09
**カテゴリ**: データモデル / クロスフィルタ（黄信号レビュー）
**背景**: ペアでラリーテーブルを絞る際、役割と連動するか（SQL 設計で 🟡 残：当初は出場ラリー全件の簡略案）。

**回答**: **役割と連動**（「ペアX のサーブ時」= ペアX が serving 側だったラリーのみ）。

**信頼性への影響**:
- `stats_rallies` に `p_role`（'serve'|'receive'）を追加し、試合ごとのペア→チーム対応を見て serving/receiving を判定する role 連動述語に変更。選手フィルタも role 連動。🔵 に確定（簡略案を破棄）。

---

### Q6: フィルタ・集計の軸（チーム A/B か、選手 identity か）

**質問日時**: 2026-06-09
**カテゴリ**: データモデル（ユーザーからの重要な指摘）
**背景**: 「大事なのはチーム A とか B ではなく、選手が誰かということ」との指摘。設計に残っていたチーム A/B 軸（`StatsFilter.team` / `TeamRate` / `stats_rallies.p_serving_team`）が意図と不整合だった。

**回答**: **選手 / ペア（player_id）に統一**。チーム A/B 軸は撤去。

**信頼性への影響**:
- `StatsFilter.team` / `TeamRate` / `pivot-team-rates.ts` / `stats_rallies.p_serving_team` を**撤去**。
- per-match の「チーム視点」は、その試合の**実際の 2 ペア（選手名）**として `stats_pair_rates`（p_match_id）で表現し、ペア → 個人へドリルダウン（REQ-004 を再定義）。
- チーム A/B は serve/receive 判定の**内部利用のみ**（`serving_team` 比較）。集計・出力・フィルタのキーは player_id に統一。🔵 に確定。

---

## Claude 主導で確定した事項（pros/cons 提示・明確なため非ヒアリング）

- **集計の所在**: 読み取り専用 RPC（`SECURITY INVOKER` + `STABLE` + `SET search_path=public`）。RLS 継承で他 Group 混入なし。要件 NFR-002 の確定に従う。
- **集計 RPC を additive migration 1 本**で追加（既存テーブル不変, REQ-402/408）。適用は CI（`db:push`）。
- **チャート**: echarts + vue-echarts を `app/plugins/echarts.client.ts` でツリーシェイク登録、`<ClientOnly>` で描画（CSR, REQ-404/406）。
- **再生**: 既存 `useVideoPlayer` + `VideoPlayer.client.vue` を `StatsVideoPane.vue` でラップ（VideoPane.vue と同型）。ソース切替は `:key` 再生成（REQ-104）。
- **composable 分割**（ADR-007）: useMatchStats / useMatchRallies / useGroupStats / useGroupRallies / useStatsFilter。
- **純関数**: compute-player-rate / filter-rallies / rally-length-bins / to-rally-length-series を `app/utils/stats-dashboard/` に分離し単体テスト（REQ-407）。集計本体（RPC）は integration テスト（[[feedback_test_layer_separation]]）。

## ヒアリング結果サマリー

### 確認できた事項
- ラリー長チャート = 本数分布 + サーブ側勝率のコンボ
- 横断テーブルは絞り込み後にサーバー側取得
- 横断フィルタ軸 = 選手 / ペアの両方

### 設計方針の決定事項
- 集計 = 読み取り専用 RPC 4 本（player_rates / pair_rates / rally_length / rallies）
- per-match = 一括取得 + クライアント絞り込み、group = 絞り込み後サーバー取得
- 再生は既存 video-playback 再利用、ソース切替で横断対応

### 残課題（kairo-tasks / 実装で詰める）— いずれも実装/将来配慮レベル
- ラリー長ビン境界（既定 1〜3/4〜7/8〜12/13+）の最終調整（定数 `RALLY_LENGTH_BINS` で一元管理、変更容易）
- echarts のツリーシェイク対象モジュールの最終確定（Bar/Line + grid/tooltip/legend/dataset 等）
- グラフ + テーブル + プレーヤー共存レイアウトが収まらない場合の代替（タブ/折りたたみ, NFR-203）
- 集計性能の実測に基づく追加インデックスの要否（MVP は既存インデックスで賄う方針 = 確定）

### 信頼性レベル分布

**ヒアリング前**（要件 + 既存設計からの素案）:
- 🔵 青信号: 約 20
- 🟡 黄信号: 約 8
- 🔴 赤信号: 0

**ヒアリング後**（Q1〜Q3 + 主導確定反映）:
- 🔵 青信号: 約 27 (+7)
- 🟡 黄信号: 約 4 (-4)
- 🔴 赤信号: 0

## 関連文書

- **アーキテクチャ設計**: [architecture.md](architecture.md)
- **データフロー**: [dataflow.md](dataflow.md)
- **型定義**: [interfaces.ts](interfaces.ts)
- **DBスキーマ**: [database-schema.sql](database-schema.sql)
- **API/RPC 仕様**: [api-endpoints.md](api-endpoints.md)
- **要件定義**: [requirements.md](../../spec/stats-dashboard/requirements.md)
