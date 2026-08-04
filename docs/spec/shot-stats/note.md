# shot-stats コンテキストノート（セッション引き継ぎ用）

**作成日**: 2026-07-26
**位置づけ**: ADR-018 §3 先行実装スコープの後半 —「ショットレベル統計 2〜3枚
（捨てる前提の安い探針）」。テスター限定代行（仮説A = 統計需要の検証）の**試料**そのもの。
**状態**: 要件定義完了（2026-08-03、下記 §8 参照）。次は `/kairo-design shot-stats`。

## 1. 前提となる決定（すべて確定済み・再議論不要）

- **ADR-017**: taxonomy 16種 / end_reason 7値 / 絶対正規化座標 / 決定打導出式。
- **ADR-018**: 探針は2〜3枚・捨てる前提。反応を見て磨くか捨てる。本丸投資は第2ゲート後。
- **shot-annotation 実装済み**（PR #50、feat/shot-annotation。全12タスク完了・テスト412件 green）。
  注釈データの供給源はアノテーションスタジオ（`/annotate`）。
- **ADR-013 REQ-301**（stats-dashboard 側）: ダッシュボードは将来「基本 / 詳細」で
  課金ゲートを掛けられる構造にする。ショットレベル統計は**「詳細」側の第一候補**。

## 2. 消費するデータ（スキーマ変更不要・読み取りのみ）

| テーブル | 列 | 意味 |
|---|---|---|
| `shots` | `shot_type`(16種) / `hand` / `hit_player_id` / `hit_x` `hit_y` / `annotated_timestamp_ms` | 注釈本体。**全列 nullable = 部分注釈が正常** |
| `rallies` | `end_reason`(7値) / `land_x` `land_y` / `out_direction` + 既存 denorm 列 (`serving_team` / `point_winner` 等) | 決着注釈 + ライブ記録の実測値 |

- stats-dashboard の前例に従い、集計は**読み取り専用 RPC / View** の additive migration で
  行ってよい（テーブル変更は不可）。

## 3. 集計時に守る規則（要件に転記すべき確定事項）

1. **座標は絶対系で保存されている**（x: 0-1 コート幅 / y: 0-1 全長、y=0 = チームA側
   バックバウンダリー、ライン外は範囲外値）。**選手視点の分析には集計側でミラー**
   （打者がチームBなら x→1−x, y→1−y）。REQ-014。
2. **レットラリーは除外済みではない** — 注釈は付かないが行は存在する。集計でも
   `is_let=false` フィルタを必ず掛ける。
3. **hand の null は「未判定」**。フォアと解釈しない（トグル ON のパスのみ非 null）。
4. **out の細分**は `land_x/y` から導出（side = x 範囲外 / back = y 範囲外 / both = 両方）。
   座標が null のときのみ `out_direction` を使う。導出関数は
   `app/utils/annotation/court-coords.ts` の `deriveOutDirection` と同一規則にする。
5. **決定打** = 勝者チームの最後のショット（in/body: 最終、out/net/not_over: その1つ前、
   service_fault/unknown: なし）。`app/utils/annotation/derive.ts` の `decisiveShotIndex` と同一規則。
6. **母数併記**（stats-dashboard NFR-201 踏襲）: 部分注釈が正常状態なので、
   「注釈済み n / 全体 N」の明示が特に重要。

## 4. 探針の候補（ヒアリングで 2〜3 枚に絞る）

| 候補 | 使う列 | 分析価値 |
|---|---|---|
| ① 配球ヒートマップ | hit_x/y (+選手・球種フィルタ) | どこから打っているか。ゾーン 3×3 表示（保存は座標のまま） |
| ② 決着分析 | end_reason × 決定打 shot_type × land_x/y | どうやって点を取った/失ったか。クイックパスだけで埋まる = **最速で表示可能になる探針** |
| ③ 球種構成比・球種別得点率 | shot_type × point_winner | 選手の配球傾向とその成否 |
| ④ サーブ種別分析 | serve_short/long/drive × 直後の得点率 | サーブ選択の成否 |

- ②はクイックパス（10〜15分/試合）だけでデータが揃うため、代行運用と相性が最良。
- ①③は種別パス/打点パスの完了率に依存 → 母数併記が生命線。

## 5. ヒアリングで決めること（kairo-requirements の論点リスト）

1. 探針の最終選定（上の候補から 2〜3 枚。捨てる前提なので欲張らない）
2. 表示場所: 既存 stats 画面（試合単位 / Group 横断）への追加タブか、別セクションか
3. ゾーン粒度（3×3 か 2×3 か）とミラー基準（選手視点固定でよいか）
4. フィルタ軸（選手 / 球種 / セット / hand）をどこまで v1 に入れるか
5. 部分注釈の扱い: 注釈率が低い試合を一覧でどう見せるか（注釈率バッジ等）
6. 基本 / 詳細グルーピング: 今回の探針を最初から「詳細」枠として実装するか
   （MVP は全機能基本扱いだった — stats-dashboard REQ-301）

## 6. 進め方（このブランチで）

1. このブランチ `docs/spec-shot-stats` 上で `/kairo-requirements shot-stats`
   （requirements / user-stories / acceptance-criteria / interview-record / note の5点セット。
   shot-annotation の spec が体裁の前例）
2. → `/kairo-design` → `/kairo-tasks` → 実装（実装ブランチは `feat/shot-stats` を main から。
   **PR #50 マージ後に**切ること — 注釈列の生成型に依存するため）
3. CLAUDE.md ワークフロー: ブランチ → dev マージ → localhost 検証 → main へ PR
4. 未マージ PR の状態を最初に確認: #49 (tsumiki commands) / #50 (shot-annotation 本体)

## 7. 要件定義の結果（2026-08-03 確定）

- **探針は 5 枚に拡大**: A 決着分析(+落下点) / C サーブ種別 / D 球種構成比・成果 / F 配球ヒートマップ / G フォア・バック。
  **ADR-018 の「2〜3枚」を意図的に上書き（5枚同列・ヒアリング確定）**。捨てる前提の位置づけは維持。
- **ライブ記録のみで作れる統計 3 枚を追加**（注釈不要・探針枠外）: J 局面別得点率（クラッチ+序中終盤の統合）/
  K 展開スピード（連続値、平均テンポ⇄終盤テンポ=ラスト3打のトグル。押下時刻ベース近似、PRD テンポ将来フェーズからの先行）/
  L セット推移チャート（スコアワーム+連取連失ハイライト+動画ジャンプ）
- 表示: 既存 stats 画面への追加タブ/セクション。全部基本扱い（課金グルーピングは ADR-019 時に）
- 3×3 ゾーン / 選手視点固定ミラー / フィルタ4軸（打者・球種・セット・hand）/ 注釈率バッジ+全チャート母数併記
- **見送り（将来候補）**: H 3打目パターン、ラリー間時間分析、ミラー切替トグル、注釈率フィルタ、精密テンポ（annotated_timestamp_ms 版）
- 追加ヒアリング（2026-08-03）で 🟡 を全解消（requirements 🔵 100%）: J は 3 分割（序盤 0-7/中盤 8-14/終盤 15-、接戦=終盤2点差以内）/
  D はミス率・決定率（分母=総打数）+ 使用割合×得点率の対比 + 相手選手も選択可 / K は**全ショットに打点時刻があるラリーのみ**対象（部分欠損はノイズのため除外）/
  範囲外座標はクランプ算入 / タブは「ショット分析」「ラリー展開」の 2 分割
- prep.md は不要（外部サービス・キー・ユーザー準備タスクなし）
- **技術設計完了（2026-08-03）**: `docs/design/shot-stats/` に 6 ファイル。設計時の実装調査で
  スキーマ差分が判明し要件書へ反映済み — **end_reason は 6 値（in/out → floor 統合、deriveInOut で導出）/
  shot_type は 17 値（unknown 追加）/ shots はソフトデリート**。本ノート §1 の「taxonomy 16種 / end_reason 7値」は
  ADR-017 時点の記述であり、実装は上記が正。
- **タスク分割完了（2026-08-04）**: `docs/tasks/shot-stats/overview.md`（overview 先行方式・
  13 タスク / 4 フェーズ / 88h）。**実装順はライブ系先行**（基盤 → J/K/L → 探針 A→C→D→F/G）。
  M2（ラリー展開タブ完成）で先行 dev 検証可。実装は PR #50 マージ後に `feat/shot-stats` を
  main から切って `/kairo-implement` で着手。

## 8. 関連ファイル

- ADR: `docs/decisions/017-*.md` / `018-*.md`
- shot-annotation: `docs/spec/shot-annotation/` / `docs/design/shot-annotation/` /
  `docs/tasks/shot-annotation/overview.md`（全タスク完了状態）
- 集計と同一規則にすべき純関数: `app/utils/annotation/{court-coords,derive}.ts`
- stats-dashboard 前例: `docs/spec/stats-dashboard/` / `docs/design/stats-dashboard/`
  （読み取り専用 RPC・View の migration 前例、vue-echarts、母数併記 NFR-201）
