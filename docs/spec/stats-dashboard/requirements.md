# stats-dashboard 要件定義書

**作成日**: 2026-06-06
**作業規模**: フル機能開発
**依存単位**: data-foundation（録画系テーブル + RLS）, match-recording（記録済みデータの供給元）, rule-engine（denormalize 済み導出値の意味定義）, video-playback（プレーヤー composable）, player-management（`players`）, match-management（`matches`）, auth-onboarding（Group 所属 middleware）

## 概要

ログイン中ユーザーが、所属 Group に蓄積された録画データ（`rallies` / `shots` / `sets` 等）を **集計・可視化して戦術分析を行う読み取り専用の分析画面 + 集計層**。録画時に rule-engine が算出し denormalize 保存した値（`server_player_id` / `receiver_player_id` / `point_winner` 等, [[project_state_storage]]）を読み出し、選手別のサービス/レシーブ得点率やラリー長と得点率の関係をチャート表示する。さらにラリー一覧から埋め込み動画プレーヤーで該当再生位置へワンクリックジャンプできる。MVP 全8ユニットの最終ユニットであり、上流をすべて消費する「振り返り・分析」面を担う。

本単位は **読み取り専用**であり、スキーマ変更・録画系テーブルへの書き込みを一切行わない。録画・データ入力は match-recording、純ルール計算は rule-engine、再生制御は video-playback、試合・選手 CRUD は match-management / player-management の責務であり、本単位は侵さない。

## 関連文書

- **ヒアリング記録**: [💬 interview-record.md](interview-record.md)
- **ユーザストーリー**: [📖 user-stories.md](user-stories.md)
- **受け入れ基準**: [✅ acceptance-criteria.md](acceptance-criteria.md)
- **コンテキストノート**: [📝 note.md](note.md)
- **PRD §F-04 / §5.4 / US-02・US-04・US-06**: [badminton_analytics PRD](../../../.dcs/20260328153038_badminton_analytics/prd.md)
- **DBスキーマ（確定済・読み取り対象）**: [🗄️ data-foundation/database-schema.sql](../../design/data-foundation/database-schema.sql)
- **rule-engine 型定義（導出値の意味）**: [rule-engine/interfaces.ts](../../design/rule-engine/interfaces.ts)
- **video-playback 仕様**: [video-playback/requirements.md](../video-playback/requirements.md)
- **match-recording 仕様**: [match-recording/requirements.md](../match-recording/requirements.md)
- **ADR**: [002 分割](../../decisions/002-requirements-splitting.md) / [007 composable](../../decisions/007-composable-naming-conventions.md) / [010 SSR/CSR](../../decisions/010-supabase-ssr-csr-boundary.md) / [011 レイアウト](../../decisions/011-layout-strategy.md) / [012 テスト戦略](../../decisions/012-test-strategy.md) / [013 収益化](../../decisions/013-monetization-and-platform-strategy.md)

## スコープ

### 含む（MVP）

- **試合単位ダッシュボード** `/groups/[id]/matches/[matchId]/stats`：1 試合の分析
- **Group 横断ダッシュボード** `/groups/[id]/stats`：複数試合を跨いだ選手別の累計分析（ヒアリング2026-06-06）
- 選手別 **サービス時得点率 / レシーブ時得点率** のチャート表示（PRD §F-04 最重要）
- **チーム視点 ⇄ 選手視点のドリルダウン**（ヒアリング2026-06-06）
- **ラリーのショット数（ラリー長）と得点率の関係**チャート（PRD §F-04 次に重要 / US-06）
- ラリー一覧テーブル（ラリー番号・サーバー・レシーバー・スコア・ショット数・結果）
- stats 画面への **video-playback プレーヤー埋め込み** と、ラリー一覧クリックでの該当 ms へのシーク再生（ヒアリング2026-06-06 / PRD US-04）
- セット別スコア・勝敗サマリの表示
- record 画面 ↔ stats 画面の相互導線

### 含まない（MVP 範囲外）

- **ショット種別・打者の分析** → `shots` に種別/打者列がないため不可（PRD §3.2 除外。AI 自動分類で将来対応）
- **ショット間隔・テンポ分析** → 将来フェーズ（PRD §3.2）
- 録画・データ入力・修正 → **match-recording の責務**
- サーバー/レシーバー・スコアの再計算ロジック → **rule-engine の責務**（stats は denormalize 済み結果を読むのみ）
- 試合・選手・動画ソースの CRUD → **match-management / player-management の責務**
- スキーマ変更（列追加・新規テーブル・migration・RPC 新設は原則行わない。RPC を使う場合も読み取り専用関数に限定し kairo-design で判断）
- 課金・プラン判定による機能ゲート（ADR-013、実装は MVP 後。MVP は全機能を基本扱い）
- 対戦相手（他 Group）データの分析（PRD：自 Group の分析に集中）
- シングルス / トリプルス（ダブルス固定）

## 機能要件（EARS記法）

**【信頼性レベル凡例】**:
- 🔵 **青信号**: PRD・確定スキーマ・ADR・上流実装・ユーザヒアリングを参考にした確実な要件
- 🟡 **黄信号**: 上記から妥当な推測による要件
- 🔴 **赤信号**: 出典のない推測による要件

### 通常要件

- REQ-001: システムは、試合単位ダッシュボードを `/groups/[id]/matches/[matchId]/stats` で提供し、`matchId` の試合（所属 Group・未削除）を所与に読み込まなければならない 🔵 *PRD §5.4（`/matches/:id/stats`）+ 実アプリのルート規約 `/groups/[id]/matches/[matchId]/...`（match-recording REQ-001）*
- REQ-002: システムは、Group 横断ダッシュボードを `/groups/[id]/stats` で提供し、当該 Group の全試合を跨いだ選手別の累計分析を表示しなければならない 🔵 *ヒアリング2026-06-06（選手横断累計を含む）+ PRD US-02（ペア編成最適化）*
- REQ-003: システムは、選手別の **サービス時得点率** と **レシーブ時得点率** をチャートで可視化しなければならない 🔵 *PRD §F-04 最重要 + US-02*
- REQ-004: システムは、得点率をチーム視点と選手視点の両方で提供し、チーム → 選手へドリルダウンできなければならない 🔵 *ヒアリング2026-06-06（どちらもドリルダウンできるイメージ）*
- REQ-005: システムは、ラリーの **ショット数（ラリー長）と得点率の関係**をチャートで可視化しなければならない 🔵 *PRD §F-04 次に重要 + US-06*
- REQ-006: システムは、ラリー一覧テーブル（ラリー番号・サーバー・レシーバー・スコア・ショット数・結果）を表示しなければならない 🔵 *PRD §F-04 + §5.4*
- REQ-007: システムは、試合単位ダッシュボードに video-playback プレーヤーを埋め込み、ラリー一覧の行をクリックした際に当該ラリーの `video_start_timestamp_ms` へシークして再生しなければならない 🔵 *ヒアリング2026-06-06（stats 画面にプレーヤー埋め込み）+ PRD US-04 + rallies `video_start_timestamp_ms`*
- REQ-008: システムは、record 画面 ↔ stats 画面の相互導線（`[統計を見る →]` / `[← 記録に戻る]` 相当）を提供しなければならない 🔵 *PRD §5.4 レイアウト*
- REQ-009: システムは、試合単位ダッシュボードでセット別のスコアと勝敗サマリを表示しなければならない 🟡 *sets `winner` + rallies 集計から妥当な推測（基本情報）*

### 条件付き要件

- REQ-101: 得点率を算出する場合、システムはレット（`is_let=true`）および未確定ラリー（`point_winner IS NULL` または `is_point_confirmed=false`）を母数・分子の双方から除外しなければならない 🔵 *ヒアリング2026-06-06（レット・未確定は除外）+ rallies 定義 + REQ-102/REQ-103（match-recording）*
- REQ-102: 動画ソースが `local` でオブジェクト URL が失われている（再読込後等）場合、システムはラリージャンプ前に同一ファイルの再選択を促さなければならない 🔵 *video-playback REQ-103（方式A）+ match-recording REQ-108*
- REQ-103: 集計対象ラリーが 0 件（未記録、または全件が除外対象）の場合、システムは空状態（「データなし」等）を表示し、チャートをエラーにしてはならない 🟡 *EDGE 妥当な推測 + NFR-001（堅牢な初期表示）*
- REQ-104: Group 横断ダッシュボードでラリー個別のジャンプを行う場合、動画ソースが試合ごとに異なるため、システムはジャンプ操作を該当試合の試合単位ダッシュボード（REQ-001）へ遷移させて再生しなければならない 🟡 *選手横断（複数動画）と埋め込みプレーヤー（単一動画）の整合からの妥当な設計判断。最終形は kairo-design*

### 状態要件

- REQ-201: 試合に記録済みラリーが 1 件も無い状態の場合、システムは試合単位ダッシュボードで「データ未記録」状態を表示しなければならない 🟡 *EDGE 妥当な推測 + match 作成直後の状態*
- REQ-202: 選手が当該スコープでサーバー（またはレシーバー）として 1 ラリーも記録されていない状態の場合、システムはその選手の該当得点率を「-」等の未算出表示としなければならない 🔵 *EDGE-001（母数 0 の 0 除算回避）*

### オプション要件

- REQ-301: システムは、ダッシュボードを将来「基本 / 詳細」にグルーピングし課金ゲート（ADR-013）を掛けられる構造としてよい（MVP は全機能を基本扱いとし、ゲートは設けない） 🔵 *ADR-013 §影響（基本/詳細グルーピングの仕込み）+ ヒアリング2026-06-06（全て基本扱い）*
- REQ-302: システムは、将来のショット種別・打者分析（AI 拡張）に拡張可能な集計層構造としてよい 🟡 *PRD §3.2 + ADR-013 §6（AI ロードマップ）から妥当な推測*

### 制約要件

- REQ-401: システムは読み取り専用であり、録画系テーブル（`sets` / `set_player_positions` / `rallies` / `shots` / `position_overrides`）への INSERT / UPDATE / DELETE を行ってはならない 🔵 *責務境界（match-recording requirements §責務）*
- REQ-402: システムはスキーマ変更（列追加・新規テーブル・破壊的 migration）を行ってはならず、既存の denormalize 列のみを消費しなければならない 🔵 *note.md §3 + match-recording がスキーマを確定済*
- REQ-403: システムは RLS（`is_member_of(matches.group_id)` 経由）に従い、他 Group のデータを集計してはならない 🔵 *database-schema.sql RLS（rallies/shots/sets/spp/po は FK 経由 group チェック）*
- REQ-404: システムは CSR 限定で動作し、Supabase クライアント経由でデータを取得しなければならない 🔵 *ADR-010 SSR/CSR 境界 + video-playback CSR 限定*
- REQ-405: システムは video-playback を依存方向 stats-dashboard → video-playback の一方向で利用し、video-playback にドメイン概念を持ち込んではならない 🔵 *ADR-002（循環依存防止）+ video-playback REQ-405*
- REQ-406: システムはチャート描画に **vue-echarts** を用いなければならない 🔵 *PRD §6 技術スタック（vue-echarts 指定）*
- REQ-407: システムは集計ロジックを composable / util として分離し、単体テスト可能にしなければならない 🔵 *ADR-007（composable 命名）+ ADR-012（テスト戦略）+ PRD §テスト（統計算出ロジックは高優先ユニットテスト）*

## 非機能要件

### パフォーマンス

- NFR-001: 統計チャートの初期表示は 3 秒以内でなければならない 🔵 *PRD §性能要件（ダッシュボード表示 3 秒以内）*
- NFR-002: 集計はクライアントサイド TypeScript で算出する。ただしデータ量・性能の観点で必要な場合は読み取り専用 Supabase RPC / View の採用を kairo-design で判断してよい 🟡 *PRD §5.3 注（クライアントサイド算出、または Supabase RPC）から妥当な推測*

### セキュリティ

- NFR-101: RLS により、他 Group の試合に紐づく録画データは集計・取得のいずれも不可でなければならない 🔵 *database-schema.sql FK 経由 RLS + REQ-403*

### ユーザビリティ

- NFR-201: 得点率はパーセント表記とし、母数（対象ラリー数）を併記して誤読（少数サンプルでの過大評価等）を防がなければならない 🟡 *データ分析 UX からの妥当な推測 + 母数 0 の REQ-202 と整合*
- NFR-202: ダッシュボードはレスポンシブ対応（PC / スマホ）でなければならない 🔵 *ADR-013 §1（レスポンシブ Web）+ ADR-011 レイアウト方針*

## Edgeケース

### エラー処理

- EDGE-001: 母数 0（対象ラリーが無い選手・スコープ）での得点率算出 → 0 除算を回避し「-」または「データなし」を表示 🔵 *境界値（REQ-202）*
- EDGE-002: `local` 動画 URL 喪失でラリージャンプ不可 → 再選択を促す（REQ-102） 🔵 *video-playback REQ-103*

### 境界値

- EDGE-101: 全ラリーがレット / 未確定で、確定ラリーが 0 件 → 集計対象 0 として REQ-103 の空状態にフォールバック 🟡 *REQ-101 + REQ-103 から妥当な推測*
- EDGE-102: ショット数 0 のラリー（得点のみ記録・「打った」未記録）→ ラリー長 0 として扱い、ラリー長分析に含める（または明示区分） 🟡 *shots 0 件のラリーが存在し得る（match-recording REQ-110a）ことからの妥当な推測*
- EDGE-103: `video_start_timestamp_ms IS NULL` のラリー（動画アラインメントなしで記録）→ ジャンプ不可とし、一覧では非リンク表示 🔵 *rallies `video_start_timestamp_ms` NULL 許容（⑥ B-14）*
