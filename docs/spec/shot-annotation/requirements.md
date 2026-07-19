# shot-annotation 要件定義書

**作成日**: 2026-07-19
**作業規模**: フル機能開発 (ADR-018「最小実装先行」スコープ)
**依存単位**: data-foundation（録画系テーブル + RLS、additive migration の前例）, match-recording（`shots` / `rallies` データとタイムスタンプの供給元）, video-playback（再生 composable）, rule-engine（サーバー/レシーバー等の導出値）, player-management（`players`）, auth-onboarding（Group 所属 middleware）

## 概要

記録済みの試合に対して、**ショット種別・打点座標・打者・ラリー決着 (end_reason) を後付けで注釈する
アノテーションスタジオ** (`/groups/[id]/matches/[matchId]/annotate`) と、その保存先となる
**録画系テーブルの additive スキーマ拡張**を提供する。ADR-017 の Stage 0 に相当し、
(a) ショットレベル統計の入力データ、(b) 将来の AI 下書き (Stage 2 以降) の訂正 UI の器、
(c) 教師ラベルの蓄積、の3役を担う。ライブ記録 UI (record 画面) には一切変更を加えない
（ADR-017 選択肢 J）。

責務は「注釈 UI と注釈列への書き込み」に限定する。統計の集計・可視化は stats-dashboard、
ライブ記録は match-recording、再生エンジンは video-playback の責務であり、本単位は侵さない。

## 関連文書

- **ADR-017**: [AI導入の段階戦略とショットアノテーション基盤](../../decisions/017-ai-staged-rollout-and-shot-annotation.md)（本単位の設計上の親。スタジオ3モード・taxonomy・end_reason・座標設計はここで確定済み）
- **ADR-018**: [検証戦略の改訂](../../decisions/018-concierge-validation-and-minimal-build-ahead.md)（実装時期の根拠 = 最小実装先行）
- **ヒアリング記録**: [💬 interview-record.md](interview-record.md)
- **ユーザストーリー**: [📖 user-stories.md](user-stories.md)
- **受け入れ基準**: [✅ acceptance-criteria.md](acceptance-criteria.md)
- **コンテキストノート**: [📝 note.md](note.md)
- **DB スキーマ（拡張対象）**: [🗄️ data-foundation/database-schema.sql](../../design/data-foundation/database-schema.sql)
- **エラー実装規約**: [⚠️ cross-cutting/error-handling.md](../../design/cross-cutting/error-handling.md)

## スコープ

### 含む

- アノテーションスタジオ画面（CSR）と3モード: **クイックパス**（ラリー決着）/ **種別パス** / **打点パス**
- additive migration 1本: `shots` への注釈列追加 + `rallies` への `end_reason` / `out_direction` 追加
- rule-engine 由来のプレフィル（1〜2打目の打者確定・チームの偶奇確定・1打目サーブ確定）
- 進捗の導出表示（null 有無から）とセット/ラリー単位の再開
- YouTube / ローカルの動画ソース差に応じたモード切替（ローカル = サムネ帯、YouTube = ループ方式）

### 含まない

- ショットレベル統計の集計・可視化 → **stats-dashboard の拡張として別要件**（本単位の直後に定義）
- AI 下書き（Stage 1 以降）・`shot_corrections` テーブル → **Stage 2 導入時**（ADR-017 §9）
- ライブ記録 UI の変更 → **禁止**（REQ-407）
- 代行入力の製品化（依頼フォーム等） → ADR-018「まだやらないこと」
- シングルス対応（ダブルス4選手固定）

## 機能要件（EARS記法）

**【信頼性レベル凡例】**: 🔵 確定文書 (ADR/スキーマ/ヒアリング) 由来 / 🟡 妥当な推測 / 🔴 出典なし

### 通常要件

- REQ-001: システムは、アノテーションスタジオを `/groups/[id]/matches/[matchId]/annotate` で提供し、対象試合（所属 Group・未削除）の全セット・ラリー・ショットを読み込まなければならない 🔵 *ADR-017 §3 + 既存ルート規約*
- REQ-002: システムは、additive migration 1本で以下の列を追加しなければならない 🔵 *ADR-017 §5*
  - `shots`: `hit_player_id` / `shot_type` / `hand` / `hit_x` / `hit_y` / `land_x` / `land_y` / `annotation_source` / `ai_model_version` / `ai_confidence`
  - `shots`: `annotated_timestamp_ms integer`（打点パスで人間が確定した打球時刻。元の押下時刻 `video_timestamp_ms` は**上書きせず保持**する — 「押下時刻 → 真の打球時刻」のペアが Stage 2 の教師データになるため） 🟡 *ADR-017 §4「ナッジ訂正 = 教師データ」からの必然。列自体は ADR に明記がないため 🟡*
  - `rallies`: `end_reason`（7値 CHECK）/ `out_direction`（side / back / both）
- REQ-003: システムは、3モードを任意の順で開始・途中打ち切り・再開できるようにしなければならない（全注釈列は nullable であり部分的な注釈を正常状態として扱う） 🔵 *ADR-017 §3*
- REQ-004: システムは、クイックパスでラリーごとに最終ショット付近（±2秒程度）を自動ループ再生し、`end_reason` の入力後、次のラリーへ自動遷移しなければならない 🔵 *ADR-017 §3*
- REQ-005: システムは、`end_reason` が `in` / `out` の場合に限り落下点（`land_x` / `land_y`）の入力を求め、コート図は**ライン外領域を含めて**描画しなければならない。`out` の細分（side / back / both）は落下点座標から導出し、落下点がスキップされた場合のみ `out_direction` のサブ選択を提示しなければならない 🔵 *ADR-017 §5 / §7*
- REQ-006: システムは、クイックパスで決定打（= 勝者チームの最後のショット。in / body なら最終ショット、out / net / not_over ならその1つ前）を自動特定し、その `shot_type` の入力を促さなければならない 🔵 *ADR-017 §7*
- REQ-007: システムは、種別パスで動画を連続再生しながら、キー入力を**順番マッチング**（ラリー内 k 回目の入力 = k 番目のショット）で `shot_type` に対応づけなければならない。キー配置は固定（数字段 1-0 + QWE = レシーブ3種）とし、文脈でキー割当を変えてはならない 🔵 *ADR-017 §4 / §6*
- REQ-008: システムは、種別パスでラリー境界での自動一時停止・ラリー間の自動スキップ・再生速度のユーザー可変（少なくとも 0.5〜1.5 倍）を提供しなければならない 🔵 *ADR-017 §4*
- REQ-009: システムは、打点パスでショットごとに打球時刻の静止フレームを表示し、コート図タップ/クリックで打点（`hit_x` / `hit_y`）を正規化座標として保存し、次のショットへ自動遷移しなければならない 🔵 *ADR-017 §4*
- REQ-010: システムは、打点パス開始時に冒頭数ショットでユーザーにフレーム合わせをさせ、その平均遅延を**一律オフセット**として以降の初期表示フレームに適用しなければならない。ユーザーが確定した打球時刻は `annotated_timestamp_ms` に保存しなければならない 🔵 *ADR-017 §4*
- REQ-011: システムは、ローカル動画では補正後時刻の前後 ±0.5 秒から抜いた**サムネイル帯**（5〜7枚）を提示し、正しいフレームの選択と打点入力を同一画面で行えるようにしなければならない 🔵 *ADR-017 §4*
- REQ-012: システムは、打者（`hit_player_id`）を次のプレフィルで自動確定しなければならない: 1打目 = `server_player_id`、2打目 = `receiver_player_id`、3打目以降 = 打順の偶奇でチーム確定。チーム内の個人が不定の場合のみ**二択**の入力を求める 🔵 *ADR-017 §4*
- REQ-013: システムは、注釈の進捗（モード別の完了率・次の未注釈位置）を注釈列の null 有無から導出して表示し、セット/ラリー単位で再開できなければならない（専用の進捗テーブルは持たない） 🔵 *ADR-017 §3*
- REQ-014: システムは、座標を次の定義で保存しなければならない: コートを真上から見た正規化座標で、x ∈ [0,1] = コート幅（チームA側バックバウンダリーから見て左→右）、y ∈ [0,1] = コート全長（y=0 = チームA側バックバウンダリーライン、y=1 = チームB側）。**ライン外は範囲外値（<0 / >1）として許容**する。打者基準へのミラー正規化は集計側（stats-dashboard）の責務とする 🟡 *ADR-017 §5 の推奨（絶対座標保存・集計時ミラー）の具体化*

### 条件付き要件

- REQ-101: 動画ソースが YouTube の場合、システムはサムネイル帯・静止画ステッピングを提供せず、**スローループ方式**（該当区間 1.5 秒程度を低速ループ再生 → 一時停止 → 入力）に切り替えなければならない 🔵 *ADR-017 §4 動画ソース制約*
- REQ-102: `end_reason` 入力時、(最終接触者のチーム, end_reason) から導出される勝者が記録済み `point_winner` と矛盾する場合、システムは入力ミスの可能性を警告しなければならない（保存は拒否しない） 🔵 *ADR-017 §7 整合チェック*
- REQ-103: 種別パスで直前ショットがスマッシュ / プッシュ / ドライブの場合、システムはレシーブ3種を**ハイライト表示**しなければならない（選択肢は減らさない）。文脈と矛盾する入力（スマッシュ直後のロブ等）には保存を妨げないソフト警告を出してよい 🔵 *ADR-017 §4*
- REQ-104: システムは、フォア/バック（`hand`）を修飾入力（PC: Shift+種別キー = バック、モバイル: 長押し）でのみ受け付け、未入力（null）を「フォア」と解釈してはならない 🔵 *ADR-017 §6*
- REQ-105: 最終ショットが失敗した接触（`end_reason` が `not_over` / `out` 等で敗者側が最後に触れた場合）のとき、システムはその行の `shot_type` 入力を任意としなければならない 🔵 *ADR-017 §7*
- REQ-106: レットラリー（`is_let=true`）の場合、システムはクイックパス（end_reason 入力）の対象から除外しなければならない。種別パス・打点パスの対象には含めてよい 🟡 *レットは得点に影響しないラリー（rallies 定義）であり「決着」が存在しないため*
- REQ-107: 動画ソースが `local` でページ再読込後にオブジェクト URL が失われている場合、システムは同一ファイルの再選択を促さなければならない（方式 A、記録済み注釈は保持） 🔵 *video-playback REQ-103 踏襲*
- REQ-108: システムは、各モード内で直近の注釈入力を取り消す undo を提供しなければならない（対象列を null に戻す / 直前の値に戻す） 🟡 *match-recording REQ-110（統一取り消し）の作法踏襲。スタック深さ等は設計で確定*
- REQ-109: 1打目のショットの場合、システムは `shot_type` をサーブに自動確定し、ショート / ロング / ドライブの三択のみを提示しなければならない 🔵 *ADR-017 §6*

### 状態要件

- REQ-201: 対象試合にラリーが1件も記録されていない場合、システムは注釈対象がない旨を表示し record 画面への導線を提示しなければならない 🟡 *妥当な推測*
- REQ-202: 動画がロード未完了 / バッファ中の状態では、システムは時刻依存の入力（フレーム選択・ループ再生起点の操作）を無効化しなければならない 🔵 *video-playback REQ-201 踏襲*
- REQ-203: ユーザーが Group 未所属の場合、auth-onboarding middleware が `/onboarding` へ誘導しなければならない 🔵 *auth-onboarding 踏襲*

### オプション要件

- REQ-301: `annotation_source` / `ai_model_version` / `ai_confidence` は AI 下書き（Stage 2 以降）用の拡張列であり、本単位では `annotation_source='human'` 固定で保存してよい 🔵 *ADR-017 §5*
- REQ-302: `shot_corrections` テーブル（AI 値 → 人の訂正の append-only ログ）は本単位では**作成しない**（Stage 2 導入時の migration とする） 🔵 *ADR-017 §5 / §9（最小実装先行の範囲）*

### 制約要件

- REQ-401: システムは注釈列への操作を PostgREST 経由で行い、FK 経由の RLS（`is_member_of(matches.group_id)`）に従わなければならない 🔵 *database-schema.sql RLS*
- REQ-402: システムは page / component から supabase クライアント・動画 API を直叩きせず、composable 経由で操作しなければならない 🔵 *ADR-007*
- REQ-403: システムは video-playback を一方向依存で利用し、video-playback に注釈のドメイン概念を持ち込んではならない 🔵 *video-playback REQ-405*
- REQ-404: システムは全文言を i18n locales（ja/en）経由で表示しなければならない 🔵 *既存単位踏襲*
- REQ-405: システムはスタジオ画面を CSR で初期化しなければならない（動画 API・canvas 利用のため） 🔵 *ADR-010*
- REQ-406: migration は additive のみ（列追加・CHECK 追加）とし、適用は CI 経由（db:push）としなければならない 🔵 *data-foundation / match-recording の前例 + [[feedback_db_password_ci_only]]*
- REQ-407: システムはライブ記録 UI（record 画面）およびその composable に変更を加えてはならない 🔵 *ADR-017 選択肢 J（記録と注釈の責務分離）*
- REQ-408: システムは試合をダブルス（4選手）固定として扱わなければならない 🔵 *matches 定義*
- REQ-409: システムは統計の集計・可視化を実装してはならない（stats-dashboard の責務） 🔵 *ADR-002 分割 + stats-dashboard note*

## 非機能要件

### パフォーマンス

- NFR-001: 打点パスのショット間遷移（ローカル動画・サムネ帯生成込み）は先読みにより体感即時（目安 300ms 以内）でなければならない 🟡 *ADR-017 §3 の「1〜2秒/ショット」目標からの逆算*
- NFR-002: 種別パスのキー入力は 100ms 以内に UI へ反映されなければならない（順番マッチングはローカル状態で即時確定し、保存は楽観書き込み） 🔵 *match-recording NFR-001 の作法踏襲*

### セキュリティ

- NFR-101: RLS により他 Group の試合の注釈データは取得・追加・更新不可でなければならない 🔵
- NFR-102: publishable key のみを使用し、service_role キーをクライアントに含めてはならない 🔵

### ユーザビリティ

- NFR-201: Nuxt UI v4 を使用し、種別パスの全種別はキーボードのみで入力可能でなければならない 🔵 *ADR-017 §6 + NFR-201 踏襲*
- NFR-202: 打点の入力精度は ±50cm 程度で足りる前提の UI トーン（大きめのマーカー・厳密さを要求しない文言）としなければならない 🔵 *ADR-017 §4*

### 国際化

- NFR-301: 全文言は locales/ja.json・en.json に定義し、キー構造一致 CI チェックの対象とする 🔵

### 保守性

- NFR-401: 単体テストは、座標変換 util（タップ→正規化座標・範囲外値）、順番マッチング、決定打導出、勝敗整合チェック、オフセット適用の各純ロジックを高優先とし、見た目テストは書かない 🔵 *ADR-012 + [[feedback_test_coverage]]*
- NFR-402: composable はモード別 + 保存系で分割する（例: session / quick-pass / type-pass / position-pass / annotation-save）。粒度は kairo-design で確定 🟡

## Edgeケース

- EDGE-001: 2人のメンバーが同じ試合を同時に注釈 → last-write-wins（`updated_at` で追跡）。MVP では競合警告は出さない 🟡 *チーム分担（ADR-017 §3）の裏面。実害は同一ショットの同時編集のみで稀*
- EDGE-002: `end_reason='out'` なのに落下点座標がコート内（0〜1 範囲内）→ 矛盾としてソフト警告（REQ-102 と同型） 🟡
- EDGE-003: 種別パスでラリー内のキー入力数がショット数を超過 → 超過分は無視し警告表示。ラリー単位でやり直し可能 🔵 *ADR-017 §4（ラリー単位のやり直し）*
- EDGE-004: オフセット適用後の表示時刻が動画開始前（負値）→ 0 に clamp 🟡
- EDGE-005: 未確定ラリー（`is_point_confirmed=false`）→ 注釈は可能とするが、REQ-102 の整合チェックは `point_winner` 確定済みラリーのみに適用 🟡
- EDGE-006: YouTube 動画が削除・非公開化されている → video-playback のエラー表示作法に従い、注釈済みデータは閲覧可能のまま 🔵 *video-playback 踏襲*
- EDGE-007: 入力検証エラーは inline、保存/RLS/ネットワークエラーは `useToast()` 🔵 *cross-cutting/error-handling.md*

## 信頼性レベルサマリー

| カテゴリ | 🔵 | 🟡 | 🔴 | 合計 |
|---------|----|----|----|------|
| 通常要件 (REQ-001〜014) | 12 | 2 | 0 | 14 |
| 条件付き要件 (REQ-101〜109) | 6 | 3 | 0 | 9 |
| 状態要件 (REQ-201〜203) | 2 | 1 | 0 | 3 |
| オプション要件 (REQ-301〜302) | 2 | 0 | 0 | 2 |
| 制約要件 (REQ-401〜409) | 9 | 0 | 0 | 9 |
| 非機能要件 (NFR-*) | 8 | 2 | 0 | 10 |
| Edgeケース (EDGE-*) | 3 | 4 | 0 | 7 |
| **合計** | **42** | **12** | **0** | **54** |

**品質評価**: 高品質（🔵 78%、🔴 0%）。🟡 の大半は ADR-017 で確定した設計からの具体化
（座標系の軸定義・undo 深さ・同時編集・composable 分割粒度）であり、kairo-design と
プロトタイプで 🔵 に昇格可能。`annotated_timestamp_ms`（REQ-002）は ADR-017 に明記のない
追加列のため、設計レビュー時に ADR への反映を検討する。
