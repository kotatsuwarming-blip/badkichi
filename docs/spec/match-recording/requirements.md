# match-recording 要件定義書

**作成日**: 2026-06-05
**作業規模**: フル機能開発
**依存単位**: match-management（`matches` マスタ）, video-playback（プレーヤー composable）, rule-engine（`app/utils/rule-engine/` 純ロジック）, player-management（`players`）, data-foundation（録画系テーブル + RLS）, auth-onboarding（Group 所属 middleware）

## 概要

ログイン中ユーザーが、所属 Group の試合（`matches`）を選び、**動画を再生しながらラリーデータを記録するメイン画面（録画画面）+ composable 層**。video-playback で再生位置（ms）を取得し、ユーザーの最小入力（ショットタイミング・得点結果・初期立ち位置）から rule-engine がサーバー/レシーバー・スコア・勝敗を推論し、その結果を録画系テーブルへ **denormalize して永続化**する（[[project_state_storage]]）。MVP 最後尾の統合ユニットであり、上流をすべて消費する。録画系テーブルは data-foundation で確定済を消費するが、undo の物理削除（REQ-110）のため **DELETE RLS ポリシー追加の additive migration を1本のみ**加える（`rallies`/`shots`/`position_overrides`、REQ-406）。列追加・新規テーブルは不要。

責務は「録画画面と、録画系テーブル（`sets` / `set_player_positions` / `rallies` / `shots` / `position_overrides`）への書き込み」に限定する。試合マスタ CRUD は match-management、純ルール計算は rule-engine、再生制御は video-playback、統計集計は stats-dashboard の責務であり、本単位は侵さない。

## 関連文書

- **ヒアリング記録**: [💬 interview-record.md](interview-record.md)
- **ユーザストーリー**: [📖 user-stories.md](user-stories.md)
- **受け入れ基準**: [✅ acceptance-criteria.md](acceptance-criteria.md)
- **コンテキストノート**: [📝 note.md](note.md)
- **PRD §F-02/§F-03/§5.2/§5.4**: [badminton_analytics PRD](../../../.dcs/20260328153038_badminton_analytics/prd.md)
- **DBスキーマ（録画系・確定済）**: [🗄️ data-foundation/database-schema.sql](../../design/data-foundation/database-schema.sql)
- **rule-engine 実装**: `app/utils/rule-engine/`（[仕様](../rule-engine/requirements.md)）
- **video-playback 仕様**: [video-playback/requirements.md](../video-playback/requirements.md)
- **match-management 仕様**: [match-management/requirements.md](../match-management/requirements.md)
- **エラー実装規約**: [⚠️ cross-cutting/error-handling.md](../../design/cross-cutting/error-handling.md)
- **ADR**: [002 分割](../../decisions/002-requirements-splitting.md) / [007 composable](../../decisions/007-composable-naming-conventions.md) / [010 SSR/CSR](../../decisions/010-supabase-ssr-csr-boundary.md) / [012 テスト戦略](../../decisions/012-test-strategy.md)

## スコープ

### 含む（MVP）

- 録画画面（`/groups/[id]/matches/[matchId]/record`）。match を所与に動画再生 + データ入力
- セット設定の作成（目標点・デュース有無・デュース上限点・先攻チーム・カメラ手前チーム）→ `sets`
- セット開始時の初期立ち位置の手動入力（4選手 × team × left/right、4行）→ `set_player_positions`
- 「打った」ボタンでショットタイミング（ms）記録 → `shots`
- ラリー終了時の得点記録（チームA得点 / チームB得点 / レット / スキップ）→ `rallies`
- rule-engine によるサーバー/レシーバー・サーバー位置・スコアの即時推論と、結果の `rallies` への denormalize 保存
- 左右入れ替わり（position override）の記録 → `position_overrides`
- 直前ラリーの得点者/レット修正と、それ以降の再計算・再保存
- 現在スコア・サーバー・レシーバー・セット番号のリアルタイム表示
- ラリー履歴一覧の表示（番号・サーバー・結果・ショット数）
- セット勝者・試合勝者の判定と、勝敗検知後の手動セット遷移

### 含まない（MVP 範囲外）

- 動画断絶記録（`recording_gaps`）→ **MVP 対象外**（テーブルは将来利用、断絶入力 UX は実使用後に再検討）
- ラリー単位のカメラ視点変更（`rallies.camera_near_team` の動的更新）→ セット開始時の `camera_near_team_at_start` のみ MVP
- 履歴から任意の過去ラリーを編集する UI → 修正は**直前ラリーのみ**（[[project_rally_correction]]）
- 統計の集計・可視化（得点率・ショット数分析・ラリージャンプ）→ **stats-dashboard の責務**
- 試合・選手・動画ソースの CRUD → **match-management / player-management の責務**
- 純ルール計算ロジックそのものの実装 → **rule-engine（実装済）を利用するのみ**
- 再生エンジンの実装 → **video-playback（実装済）を利用するのみ**
- シングルス / トリプルス（ダブルス4選手固定）
- ショットの AI 自動検出（`input_source='ai'`）→ 構成のみ将来対応、MVP は manual

## 機能要件（EARS記法）

**【信頼性レベル凡例】**:
- 🔵 **青信号**: PRD・確定スキーマ・ADR・上流実装・ユーザヒアリングを参考にした確実な要件
- 🟡 **黄信号**: 上記から妥当な推測による要件
- 🔴 **赤信号**: 出典のない推測による要件

### 通常要件

- REQ-001: システムは、録画画面を `/groups/[id]/matches/[matchId]/record` で提供し、`matchId` の試合（所属 Group・未削除）を所与として読み込まなければならない 🔵 *PRD §5.4 画面一覧 + player-management ルート規約 `/groups/[id]/...`*
- REQ-002: システムは、セット設定（`target_points` / `enable_deuce` / `deuce_point_cap` / `first_serving_team` / `camera_near_team_at_start`）の入力を提供し、`sets` レコードを作成しなければならない 🔵 *sets テーブル定義 + rule-engine SetConfig + ヒアリング2026-06-05（カメラはセット開始時1回）*
- REQ-003: システムは、セット開始時の初期立ち位置（4選手それぞれの team・left/right）を手動入力させ、`set_player_positions` に4行保存しなければならない 🔵 *PRD §F-03「最初の立ち位置」+ set_player_positions 定義 + rule-engine REQ-001（初期立ち位置は手動入力）*
- REQ-004: システムは、video-playback の composable を経由して match の動画ソース（`youtube` / `local`）を再生し、再生・一時停止・シーク・速度変更を提供しなければならない 🔵 *PRD §F-02 + video-playback REQ-001〜003*
- REQ-005: システムは、「打った」ボタン押下時に video-playback から現在再生位置（ms）を取得し、現在ラリーに紐づくショットとして `shots`（`video_timestamp_ms` / `shot_number` / `input_source='manual'`）に記録しなければならない 🔵 *PRD §F-02「打った」 + ヒアリング2026-06-05（ショット記録 MVP）+ shots 定義 + video-playback REQ-004*
- REQ-006: システムは、ラリー終了時に「チームA得点」「チームB得点」「レット」「スキップ」の入力を提供し、`rallies` レコードを記録しなければならない 🔵 *PRD §F-02 + §5.4 レイアウト*
- REQ-007: システムは、確定した得点結果を rule-engine（`applyRally`）に渡し、算出された `servingTeam` / `serverPosition` / `server`（=`server_player_id`） / `receiver`（=`receiver_player_id`）を `rallies` に denormalize 保存しなければならない 🔵 *PRD §F-03 + rule-engine GameState + ② B-7（rallies に導出値 denormalize）+ [[project_state_storage]]*
- REQ-008: システムは、現在のスコア・サーブ権チーム・サーバー・レシーバー・セット番号をリアルタイムに表示しなければならない 🔵 *PRD §F-02「リアルタイム表示」 + §5.4 レイアウト*
- REQ-009: システムは、記録済みラリーの履歴一覧（ラリー番号・サーバー・得点結果・ショット数）を表示しなければならない 🔵 *PRD §5.4 ラリー履歴 + §F-04 ラリー一覧*
- REQ-010: システムは、rule-engine（`determineSetWinner`）でセット勝者を検知し、`sets.winner` を更新したうえで「次のセットへ」の手動導線を提示しなければならない 🔵 *ヒアリング2026-06-05（勝敗検知し手動で次セット）+ rule-engine REQ-007/REQ-009*
- REQ-011: システムは、試合勝者（3セットマッチで先に2セット取ったチーム等、セット設定に応じた先取数）を判定し表示しなければならない 🟡 *rule-engine REQ-008（試合勝者判定）から妥当な推測。先取数の具体ルールは kairo-design*

### 条件付き要件

- REQ-101: 「打った」押下時に video-playback の現在時刻取得が `null`（未ロード / バッファ中）の場合、システムはショットを記録してはならない 🔵 *video-playback REQ-201（未ロード時 null 契約）*
- REQ-102: ラリーがレット（`is_let=true`）として記録された場合、システムはそのラリーをスコアに加算してはならず、`point_winner` は NULL としなければならない 🔵 *PRD §F-02「レットは得点に影響しない」+ rule-engine REQ-006 + rallies 定義*
- REQ-103: 得点者が判断不能でスキップされた場合、システムは当該ラリーを `point_winner=NULL` / `is_point_confirmed=false` で保留し、後から確定できるようにしなければならない 🔵 *PRD US-05 + rallies `is_point_confirmed`*
- REQ-104: スキップされたラリーの得点者が後から確定された場合、システムは `is_point_confirmed=true` とし、当該ラリーを rule-engine に渡してサーバー/レシーバー・スコアを確定・保存しなければならない 🔵 *PRD US-05 + rule-engine REQ-403（pointWinner 必須）*
- REQ-105: 左右入れ替わり（override）が入力された場合、システムは当該チームの現在のトグル状態から `override_type`（偶数回目=`swapped` / 奇数回目=`restored`）を決定して `position_overrides` に記録し、rule-engine（`applyOverride`）を適用して以降の推論に反映しなければならない 🔵 *PRD §F-02「変わった→戻った の2アクション」 + position_overrides 定義 + rule-engine REQ-104/REQ-105（ステートレストグル）*
- REQ-106: ユーザーが直前ラリーの得点者またはレット種別を修正した場合、システムはそれ以降のラリーのサーバー/レシーバー・スコアを rule-engine で再計算し、`rallies` を再保存しなければならない 🔵 *PRD §F-03「修正箇所以降を再計算」 + ヒアリング2026-06-05（修正は直前ラリーのみ）+ [[project_rally_correction]]*
- REQ-107: rule-engine がセット勝者を検知した場合、システムは自動でセット遷移せず、「次のセットへ」導線を提示し、ユーザーの操作で次セット（先攻＝前セット勝者を既定）の設定・立ち位置入力へ進めなければならない 🔵 *ヒアリング2026-06-05（手動で次セット）+ rule-engine REQ-009（前セット勝者が先攻）*
- REQ-108: 動画ソースが `local` でページ再読込後にオブジェクト URL が失われている場合、システムは同一ファイルの再選択を促さなければならない（記録済みデータは ms で保持され、再選択後にジャンプ可能） 🔵 *video-playback REQ-103（方式A）+ NFR-101*
- REQ-110: システムは、**直近の記録操作を1つ戻す統一「取り消し」（↩ ボタン + PC は Backspace）**を提供しなければならない。現在セット内で linear（逆順）に、ショット・得点・レット・スキップ・左右入替を戻せること。戻せる操作が無いときは no-op とする 🔵 *UI ヒアリング2026-06-05（取り消しはショット取消と同じ仕組み）*
  - REQ-110a: 直近が「打った」の場合、取り消しは進行中ラリーの最後の shot 行を**物理削除（hard delete）**する。その削除でラリーが空（shot 0 件・point 未確定）になり、かつそのラリーが遅延生成された行であれば、当該 rally 行も物理削除する 🔵 *UI ヒアリング2026-06-05（取り消しは物理削除）*
  - REQ-110b: 直近が「得点 / レット」の場合、取り消しは当該ラリーを進行中に戻し（`point_winner=null`・`is_point_confirmed=false` へ UPDATE）、engine を直前の `GameState` スナップショットへ復元する。ユーザーは正しい結果を入力し直す 🔵 *UI ヒアリング2026-06-05（取り消してから得点を入れ直す）。得点の誤入力修正（REQ-106）はこの取り消し+再入力で実現*
  - REQ-110c: 直近が「左右入替（override）」の場合、取り消しは該当 position_overrides 行を**物理削除**し engine 状態を復元する 🔵 *UI ヒアリング2026-06-05（取り消しは物理削除）*
  - REQ-110d: 取り消し対象の行がまだ楽観書き込み（非同期 insert）の途中だった場合、システムは insert の解決（id 確定）を待ってから物理削除する、または未送信なら送信をキャンセルしなければならない（delete が insert を追い越さない） 🔵 *ハイブリッド永続化（楽観）との整合*

### 状態要件

- REQ-201: 当該試合にまだセットが作成されていない状態の場合、システムはセット設定 + 初期立ち位置の入力を促さなければならない 🔵 *REQ-002/REQ-003 + 録画開始前提（セット必須）*
- REQ-202: 動画がロード未完了 / バッファ中の状態にある場合、システムは記録操作（「打った」・得点入力）を無効化しなければならない 🔵 *video-playback REQ-201（未ロード時 no-op / null）*
- REQ-203: セットが決着済み（`winner` 確定）の状態にある場合、システムは当該セットへのラリー追加を不可とし、次セット遷移または試合終了を提示しなければならない 🔵 *rule-engine 勝敗判定 + sets.winner*
- REQ-204: ユーザーが Group 未所属の場合、本画面には到達せず auth-onboarding middleware が `/onboarding` へ誘導しなければならない 🔵 *auth-onboarding REQ-102/REQ-202*

### オプション要件

- REQ-301: システムはショットの `input_source` を将来の AI 自動検出（`'ai'`）に拡張可能な構成としてよい（MVP は `'manual'` 固定） 🔵 *shots `input_source` CHECK + PRD AI ロードマップ*
- REQ-302: システムは長時間記録時に、video-playback の YouTube 利用推奨 UX（方式A の補完）を活用してよい 🔵 *video-playback REQ-301*

### 制約要件

- REQ-401: システムは録画系テーブルへの操作を PostgREST 経由で行い、FK 経由の RLS（`is_member_of(matches.group_id)`）に従わなければならない 🔵 *database-schema.sql RLS（sets/rallies/shots/spp/position_overrides）*
- REQ-402: システムは page / component から supabase クライアントおよび動画 API を直叩きせず、composable 経由で操作しなければならない 🔵 *ADR-007 + video-playback REQ-402*
- REQ-403: システムは rule-engine（`app/utils/rule-engine/`）を純ロジックとして利用し、状態の永続化は match-recording の composable が担わなければならない（rule-engine は DB を触らない） 🔵 *ADR-002 + rule-engine REQ-401 + [[project_state_storage]]*
- REQ-404: システムは video-playback を依存方向 match-recording → video-playback の一方向で利用し、video-playback にドメイン概念（ショット・ラリー）を持ち込んではならない 🔵 *video-playback REQ-405 + ADR-002（循環依存防止）*
- REQ-405: システムは画面の全文言を i18n locales（ja/en）経由で表示しなければならない 🔵 *player-management / auth-onboarding 踏襲*
- REQ-406: システムは録画系テーブルの**物理削除（undo、REQ-110）を行うため、data-foundation に DELETE RLS ポリシー追加の additive migration を1本加え**、適用は CI 経由（db:push、ローカル不可）としなければならない。対象は `rallies` / `shots` / `position_overrides`（FK 経由 `is_member_of(matches.group_id)` でスコープ）。列追加・新規テーブルは不要 🔵 *REQ-110（物理削除）+ 録画系テーブルは現状 DELETE ポリシー無し（SELECT/INSERT/UPDATE のみ）+ match-management の additive migration 前例 + memory [[feedback_db_password_ci_only]]*
- REQ-407: システムは試合をダブルス（4選手）固定として扱い、シングルス / トリプルスを対象としてはならない 🔵 *matches 4選手列固定 + set_player_positions 4行*
- REQ-408: システムは録画画面をブラウザ専用 API（動画 API）利用のため CSR で初期化しなければならない 🔵 *ADR-010 + video-playback REQ-401*
- REQ-409: システムは `recording_gaps` への書き込みを行ってはならない（MVP 対象外） 🔵 *ヒアリング2026-06-05（recording_gaps 対象外）*
- REQ-410: システムは `rallies` の状態列（`serving_team` / `server_position` / `server_player_id` / `receiver_player_id` / `camera_near_team`）を rule-engine 出力で denormalize 保存し、stats-dashboard が SQL で直接集計できる状態を維持しなければならない 🔵 *[[project_state_storage]] + ② B-7（denormalize 方針）*

## 非機能要件

### パフォーマンス

- NFR-001: 「打った」ボタン押下からショット記録までの遅延は 100ms 以内でなければならない（video-playback の同期的現在時刻取得を前提とする） 🔵 *PRD 性能 NFR「ボタン押下から記録完了まで 100ms」+ video-playback NFR-001*
- NFR-002: ラリー入力から次のサーバー/レシーバー表示までの遅延は 100ms 以内でなければならない 🔵 *PRD §F-03 受入基準「100ms 以内」+ rule-engine NFR-001（10ms 以内）*

### セキュリティ

- NFR-101: RLS により、他 Group の試合に紐づく録画データ（sets/rallies/shots/spp/position_overrides）は取得・追加・更新のいずれも不可でなければならない 🔵 *database-schema.sql FK 経由 RLS*
- NFR-102: 本単位は publishable key（`sb_publishable_*`）のみを `useSupabaseClient()` 経由で使用し、service_role キーをクライアントバンドルに含めてはならない 🔵 *auth-onboarding / match-management NFR-102 踏襲*

### ユーザビリティ

- NFR-201: 記録 UI に Nuxt UI v4 コンポーネントを使用し、主要な記録ボタン群（打った・得点・レット・スキップ）はキーボード操作可能でなければならない 🔵 *CLAUDE.md + video-playback NFR-201（キーボード操作）*
- NFR-202: システムは「打った」で記録したショットの痕跡を、video-playback のオーバーレイスロット（タイムライン上）に重ねて表示しなければならない 🔵 *video-playback REQ-009/REQ-406（痕跡表示は match-recording の責務）+ PRD §F-02*
- NFR-203: override 入力のタイミング問題（再生しながらの同時操作の困難さ）に配慮し、ラリー開始後でも override を入力可能としなければならない。具体的な入力フローはプロトタイプで再検証する 🟡 *[[project_override_ux]]（実使用前提の UX 懸念）。具体形式は kairo-design + プロトタイプ*

### 国際化

- NFR-301: 全文言は locales/ja.json・en.json に定義し、キー構造一致 CI チェックの対象としなければならない 🔵 *auth-onboarding / player-management 踏襲*

### 保守性

- NFR-302: composable は操作別に分割しなければならない（例: 録画セッション / セット / ラリー / ショット / override / 履歴）。具体的な分割粒度は kairo-design で決定する 🟡 *ADR-007 + player-management/match-management の操作別分割パターンから妥当な推測*
- NFR-303: Vue コンポーネント単体テスト（Vitest）は Zod スキーマ単体・composable のエラー処理（成功/失敗/エッジ）・分岐ロジック（rule-engine 連携の入出力対応）に限定し、見た目テストは書かないこと 🔵 *ADR-012 + [[feedback_test_coverage]]*

## Edgeケース

### 入力検証

- EDGE-001: 動画未ロード / バッファ中に「打った」を押下 → ショット記録不可（無効化 or no-op） 🔵 *REQ-101/REQ-202 + video-playback REQ-201*
- EDGE-002: 初期立ち位置で同一 `(team, position)` スロットに2選手を割り当て → `set_player_positions` の UNIQUE(set_id, team, position) 違反、UI 段階で拒否 🔵 *set_player_positions ⑤ B-11 UNIQUE 制約*
- EDGE-008: 同一チームに対し override を2回連続入力 → トグルで元の表示状態に戻る（`position_overrides` には swapped→restored の2行が残り、engine 状態は元に戻る） 🔵 *rule-engine EDGE-002/REQ-105 + position_overrides override_type*

### データ整合・状態遷移

- EDGE-003: スキップ（未確定）ラリーを残したまま次ラリーを記録 → rule-engine は `pointWinner` 必須（null 不可）のため、未確定ラリーのサーバー/レシーバーは確定まで保留し、UI で未確定を明示すること 🔵 *rule-engine REQ-403 + REQ-103*
- EDGE-005: 直前ラリーの得点者を A→B に修正 → それ以降のサーバー/レシーバー・スコアを rule-engine で再計算し `rallies` を再保存 🔵 *REQ-106 + PRD §F-03*
- EDGE-006: セット決着後にさらに得点入力を試行 → 拒否し、「次のセットへ」または試合終了を提示 🔵 *REQ-203*
- EDGE-010: レットを連続記録 → ラリー番号は採番されるがスコアは不変 🔵 *REQ-102 + rule-engine REQ-006*
- EDGE-011: 試合勝者確定（先取セット数到達）後にさらにセット追加を試行 → 試合終了として扱い、新規セット作成を抑止すること 🟡 *REQ-011 から妥当な推測。具体挙動は kairo-design*

### 通信・再生

- EDGE-007: `local` 動画でページ再読込 → 同一ファイルの再選択を促す。記録済みデータ（ms）は保持され、再選択後にラリー位置へジャンプ可能 🔵 *REQ-108 + video-playback REQ-103*
- EDGE-009: 入力検証エラー（立ち位置重複・必須未入力等）は `<UFormField>` の inline error、保存/RLS/PostgREST/ネットワークエラーは `useToast()` で通知すること 🔵 *cross-cutting/error-handling.md §2 + 決定木*

## 信頼性レベルサマリー

| カテゴリ | 🔵 青信号 | 🟡 黄信号 | 🔴 赤信号 | 合計 |
|---------|---------|---------|---------|------|
| 通常要件 (REQ-001〜011) | 10 | 1 | 0 | 11 |
| 条件付要件 (REQ-101〜110) | 9 | 0 | 0 | 9 |
| 状態要件 (REQ-201〜204) | 4 | 0 | 0 | 4 |
| オプション要件 (REQ-301〜302) | 2 | 0 | 0 | 2 |
| 制約要件 (REQ-401〜410) | 10 | 0 | 0 | 10 |
| 非機能要件 (NFR-*) | 8 | 2 | 0 | 10 |
| Edgeケース (EDGE-*) | 9 | 1 | 0 | 10 |
| **合計** | **52** | **4** | **0** | **56** |

**品質評価**: 高品質（🔵 93%、🔴 0%）。残る 🟡 4件は ①試合勝者の先取数ルール（REQ-011）②override 入力フローのプロトタイプ検証（NFR-203）③composable 分割粒度（NFR-302）④試合終了後のセット追加抑止挙動（EDGE-011）で、いずれも kairo-design で詳細化することで 🔵 に昇格可能。
