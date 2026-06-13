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
- **ペア視点 ⇄ 選手視点のドリルダウン**（集計キーは選手／ペア＝player_id、チーム A/B は軸にしない）（ヒアリング2026-06-06/09）
- **ラリーのショット数（ラリー長）と得点率の関係**チャート（PRD §F-04 次に重要 / US-06）
- ラリー一覧テーブル（ラリー番号・サーバー・レシーバー・スコア・ショット数・結果）
- **統計グラフとラリーテーブルの連動絞り込み（クロスフィルタ）**：グラフ上の条件選択に連動してラリーテーブルが絞り込まれる（ヒアリング2026-06-08）
- stats 画面への **video-playback プレーヤー埋め込み** と、（絞り込み後の）ラリー選択での該当 ms へのシーク再生（ヒアリング2026-06-06/08 / PRD US-04）
- **読み取り専用の集計 RPC / View**（得点率・ラリー長集計を Postgres 側で算出。additive migration で追加、既存テーブルのスキーマは変更しない）（ヒアリング2026-06-08）
- record 画面 ↔ stats 画面の相互導線

### 含まない（MVP 範囲外）

- **ショット種別・打者の分析** → `shots` に種別/打者列がないため不可（PRD §3.2 除外。AI 自動分類で将来対応）
- **ショット間隔・テンポ分析** → 将来フェーズ（PRD §3.2）
- 録画・データ入力・修正 → **match-recording の責務**
- サーバー/レシーバー・スコアの再計算ロジック → **rule-engine の責務**（stats は denormalize 済み結果を読むのみ）
- 試合・選手・動画ソースの CRUD → **match-management / player-management の責務**
- 既存テーブルのスキーマ変更（列追加・新規テーブル・破壊的 migration）→ 行わない（集計は読み取り専用 RPC / View で実現。下記「含む」参照）
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
- REQ-004: システムは、得点率をペア視点（同じ 2 選手の組）と選手視点の両方で提供し、ペア → 選手へドリルダウンできなければならない。集計・絞り込みのキーは選手（player_id）／ペアであり、チーム A/B は軸にしない 🔵 *ヒアリング2026-06-06（どちらもドリルダウンできるイメージ）+ ヒアリング2026-06-09（大事なのは A/B ではなく選手が誰か）*
- REQ-005: システムは、ラリーの **ショット数（ラリー長）と得点率の関係**をチャートで可視化しなければならない 🔵 *PRD §F-04 次に重要 + US-06*
- REQ-006: システムは、ラリー一覧テーブル（ラリー番号・サーバー・レシーバー・スコア・ショット数・結果）を表示しなければならない 🔵 *PRD §F-04 + §5.4*
- REQ-007: システムは、stats 画面に video-playback プレーヤーを埋め込み、（絞り込み後の）ラリー一覧の行を選択した際に当該ラリーの `video_start_timestamp_ms` へシークして再生しなければならない 🔵 *ヒアリング2026-06-06（stats 画面にプレーヤー埋め込み）+ PRD US-04 + rallies `video_start_timestamp_ms`*
- REQ-008: システムは、record 画面 ↔ stats 画面の相互導線（`[統計を見る →]` / `[← 記録に戻る]` 相当）を提供しなければならない 🔵 *PRD §5.4 レイアウト*
- REQ-010: システムは、統計グラフ上での絞り込み操作（選手・チーム・サービス/レシーブ・ラリー長等の条件選択）に連動して、同一画面のラリー一覧テーブルを絞り込み表示しなければならない（クロスフィルタ） 🔵 *ヒアリング2026-06-08（グラフで条件を絞ると連動してラリーが絞り込まれる）*
- REQ-011: システムは、絞り込み後のラリー一覧から任意のラリーを選択して、埋め込みプレーヤーで該当ラリーを再生できなければならない 🔵 *ヒアリング2026-06-08（絞り込んだラリーを再生して確認できる）+ REQ-007 と連続*
- REQ-012: システムは、Group 横断ダッシュボードで分析・絞り込みの単位として **1 選手**と**ペア（同一チームの 2 選手）**の両方を選択できなければならない 🔵 *ヒアリング2026-06-08（横断チャートのフィルタとしてペア / 1 人を選択したい）+ PRD US-02（ペア編成最適化）*
- REQ-013: システムは、対象（全体 / 1 選手 / 1 ペア）と試合期間（日付範囲＋試合の個別調整、対象試合が分かる表示）を**グローバルフィルタ**として提供しなければならない（チャート内ドリルダウンとは分離） 🔵 *受け入れ2026-06-09（選手/ペア・期間はグローバルで設定）*
- REQ-014: システムは、選択した選手/ペアの**サービス/レシーブ得点率を棒グラフ**（全体表示と同形式）で示し、**サービスポジション（偶数点=右 / 奇数点=左）**で絞り込めなければならない。**ペア選択時は各個人の得点率（ペアで組んだ時）を表示し、個人へドリルダウン**できること。ラリーテーブル・ラリー長グラフは連動する 🔵 *受け入れ2026-06-09/10（表ではなくグラフ・ペア→個人・残す軸は右/左のみ）*
- REQ-015: システムは、ラリー再生時に記録時刻より一定時間（既定 2 秒）前から再生を開始しなければならない（サーブの瞬間ではなく直前から確認できるように） 🔵 *受け入れ2026-06-09*

### 条件付き要件

- REQ-101: 得点率を算出する場合、システムはレット（`is_let=true`）および未確定ラリー（`point_winner IS NULL` または `is_point_confirmed=false`）を母数・分子の双方から除外しなければならない 🔵 *ヒアリング2026-06-06（レット・未確定は除外）+ rallies 定義 + REQ-102/REQ-103（match-recording）*
- REQ-102: 動画ソースが `local` でオブジェクト URL が失われている（再読込後等）場合、システムはラリージャンプ前に同一ファイルの再選択を促さなければならない 🔵 *video-playback REQ-103（方式A）+ match-recording REQ-108*
- REQ-103: 集計対象ラリーが 0 件（未記録、または全件が除外対象）の場合、システムは空状態（「データなし」等）を表示し、チャートをエラーにしてはならない 🔵 *ヒアリング2026-06-08（空状態は出す。文言は UI 設計に委ねる）+ NFR-001（堅牢な初期表示）*
- REQ-104: Group 横断ダッシュボードで異なる試合のラリーを再生する場合、システムは埋め込みプレーヤーに当該ラリーの試合の動画ソースを読み込んで再生しなければならない（`youtube` はソース切替、`local` は方式A の再選択）。画面遷移はせず同一画面で「グラフ → テーブル → 再生」を完結させる 🔵 *ヒアリング2026-06-08（同一画面で絞り込んだラリーを再生）+ video-playback REQ-103（local 方式A）*

### 状態要件

- REQ-201: 試合に記録済みラリーが 1 件も無い状態の場合、システムは試合単位ダッシュボードで「データ未記録」状態を表示しなければならない 🔵 *ヒアリング2026-06-08（空状態は出す。文言は UI 設計に委ねる）+ match 作成直後の状態*
- REQ-202: 選手が当該スコープでサーバー（またはレシーバー）として 1 ラリーも記録されていない状態の場合、システムはその選手の該当得点率を「-」等の未算出表示としなければならない 🔵 *EDGE-001（母数 0 の 0 除算回避）*

### オプション要件

- REQ-301: システムは、ダッシュボードを将来「基本 / 詳細」にグルーピングし課金ゲート（ADR-013）を掛けられる構造としてよい（MVP は全機能を基本扱いとし、ゲートは設けない） 🔵 *ADR-013 §影響（基本/詳細グルーピングの仕込み）+ ヒアリング2026-06-06（全て基本扱い）*
- REQ-302: システムは、将来のショット種別・打者分析（AI 拡張）に拡張可能な集計層構造としてよい 🟡 *PRD §3.2 + ADR-013 §6（AI ロードマップ）から妥当な推測*

### 制約要件

- REQ-401: システムは読み取り専用であり、録画系テーブル（`sets` / `set_player_positions` / `rallies` / `shots` / `position_overrides`）への INSERT / UPDATE / DELETE を行ってはならない 🔵 *責務境界（match-recording requirements §責務）*
- REQ-402: システムは既存テーブルのスキーマ変更（列追加・新規テーブル・破壊的 migration）を行ってはならず、既存の denormalize 列のみを消費しなければならない。集計のための **読み取り専用 RPC / View の追加（additive migration）は許容**する 🔵 *note.md §3 + match-recording がスキーマを確定済 + ヒアリング2026-06-08（集計は RPC/View）*
- REQ-408: システムが追加する集計 RPC / View は読み取り専用（`SELECT` のみ・`STABLE`）でなければならず、RLS を保ち他 Group のデータを返してはならない（View は `security_invoker`、RPC は `is_member_of()` チェック等）。適用は CI 経由（`db:push`、ローカル不可）としなければならない 🔵 *ヒアリング2026-06-08（読み取り専用 RPC/View）+ database-schema.sql の RLS/SECURITY DEFINER 規約 + [[feedback_db_password_ci_only]]*
- REQ-403: システムは RLS（`is_member_of(matches.group_id)` 経由）に従い、他 Group のデータを集計してはならない 🔵 *database-schema.sql RLS（rallies/shots/sets/spp/po は FK 経由 group チェック）*
- REQ-404: システムは CSR 限定で動作し、Supabase クライアント経由でデータを取得しなければならない 🔵 *ADR-010 SSR/CSR 境界 + video-playback CSR 限定*
- REQ-405: システムは video-playback を依存方向 stats-dashboard → video-playback の一方向で利用し、video-playback にドメイン概念を持ち込んではならない 🔵 *ADR-002（循環依存防止）+ video-playback REQ-405*
- REQ-406: システムはチャート描画に **vue-echarts** を用いなければならない 🔵 *PRD §6 技術スタック（vue-echarts 指定）*
- REQ-407: システムは、クライアント側の派生計算・整形ロジックを composable / util として分離し単体テスト可能にしなければならない。集計本体を担う RPC / View（REQ-408）は integration テスト（CI 専用）で検証しなければならない 🔵 *ADR-007（composable 命名）+ ADR-012 / [[feedback_test_layer_separation]]（mock unit + integration の2層）+ PRD §テスト（統計算出ロジックは高優先）*

## 非機能要件

### パフォーマンス

- NFR-001: 統計チャートの初期表示は 3 秒以内でなければならない 🔵 *PRD §性能要件（ダッシュボード表示 3 秒以内）*
- NFR-002: 得点率・ラリー長等の集計は **読み取り専用 Supabase RPC / View（Postgres 側）で算出**する。クライアントは結果の取得・整形・可視化に専念する 🔵 *ヒアリング2026-06-08（集計は読み取り専用 RPC/View）+ PRD §5.3 注（Supabase RPC）*

### セキュリティ

- NFR-101: RLS により、他 Group の試合に紐づく録画データは集計・取得のいずれも不可でなければならない 🔵 *database-schema.sql FK 経由 RLS + REQ-403*

### ユーザビリティ

- NFR-201: 得点率はパーセント表記とし、母数（対象ラリー数）を必ず併記して誤読（少数サンプルでの過大評価等）を防がなければならない 🔵 *ヒアリング2026-06-08（母数併記を必須）+ 母数 0 の REQ-202 と整合*
- NFR-202: ダッシュボードはレスポンシブ対応（PC / スマホ）でなければならない 🔵 *ADR-013 §1（レスポンシブ Web）+ ADR-011 レイアウト方針*
- NFR-203: 「統計グラフ + ラリーテーブル + 埋め込みプレーヤー」を同一画面に共存させるレイアウトが画面に収まらない場合、タブ / 折りたたみ / セクション分割等の代替レイアウトを kairo-design / UI 設計で検討してよい 🟡 *ヒアリング2026-06-08（画面に収まらなさそうならまた考える）*

## Edgeケース

### エラー処理

- EDGE-001: 母数 0（対象ラリーが無い選手・スコープ）での得点率算出 → 0 除算を回避し「-」または「データなし」を表示 🔵 *境界値（REQ-202）*
- EDGE-002: `local` 動画 URL 喪失でラリージャンプ不可 → 再選択を促す（REQ-102） 🔵 *video-playback REQ-103*

### 境界値

- EDGE-101: 全ラリーがレット / 未確定で、確定ラリーが 0 件 → 集計対象 0 として REQ-103 の空状態にフォールバック 🔵 *REQ-101 + REQ-103 の論理的帰結（ヒアリング2026-06-08 で確認）*
- EDGE-102: ショット数 0 のラリー（得点のみ記録・「打った」未記録）→ **ラリー長分析（ラリー長 × 得点率チャート）からは除外**する。ただしラリー一覧テーブルには表示する 🔵 *ヒアリング2026-06-08（ショット未記録はデータ不備としてラリー長分析から除外）+ shots 0 件のラリーが存在し得る（match-recording REQ-110a）*
- EDGE-103: `video_start_timestamp_ms IS NULL` のラリー（動画アラインメントなしで記録）→ ジャンプ不可とし、一覧では非リンク表示 🔵 *rallies `video_start_timestamp_ms` NULL 許容（⑥ B-14）*
