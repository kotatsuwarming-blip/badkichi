# ai-draft-loop 要件定義書

**作成日**: 2026-11-23
**作業規模**: 大規模（テーブル 2 本 + 取り込み経路 + 確認画面の拡張 + 書き出し + 統計の未確認表示）
**位置づけ**: ADR-020「AI 先行入力への転換とループエンジニアリング」の最初の実装単位。
AI の下書き（予測）と人の確定（確認・訂正）を二層で記録し、人の確定だけが学習と評価に流れる土台を作る。
**依存単位**: shot-annotation（注釈スタジオと shots / rallies の注釈列。データモデルの土台）、
match-recording（ラリー・ショットの物理削除方針 REQ-110）、stats-dashboard / shot-stats（未確認の割合を出すチャート群）、
video-playback（確認画面の動画再生）。推論そのもの（`~/dev/badkichi-ai`）と動画の受け取り（video-intake、VID-0）は別単位。

## 概要

これまで人が 3 回のパス（決まり方 / 種別 / 打点）で入力していた注釈を、AI の下書きを人が確認・訂正する形に変える。
本単位が作るのは次の 5 つ。

1. **二層スキーマ**: `ai_predictions`（AI の出力、追記のみ）と `human_resolutions`（人の確認・訂正・却下、追記のみ）。
   shots / rallies の既存列は「現在の値」を持つだけにする。
2. **下書きの取り込み経路**: 推論バッチが出す JSON を `ai_predictions` に入れ、人の確定が無い項目だけ現在の値に反映する。
3. **確認画面**: 下書きを動画に重ねて表示し、ラリー単位の一括確認・一括却下、1 キー確定、項目ごとの訂正ができる。
   項目ごとに人が使った時間（`lead_time_ms`）を記録する。
4. **書き出し**: 学習用（人の確定がある項目）と評価用（評価専用の試合）を分けて書き出す。
5. **統計の未確認表示**: 人の確定が無い値で描かれた割合を各チャートに出す。

推論の実装、モデルの昇格、動画ファイルの受け取り、顧客自身による確認（BL-044）は含まない。

## 関連文書

- **決定の出典**: [ADR-020](../../decisions/020-ai-first-input-and-loop-engineering.md) §1（対象項目と確認画面の条件）、§2（二層スキーマ）、§3（評価セットと試合単位の分離）、§4（ループ）
- **設計根拠の調査**: [docs/research/loop-engineering/survey.md](../../research/loop-engineering/survey.md) §4-3（Label Studio の予測 / 注釈の二層）
- **ヒアリング記録**: [💬 interview-record.md](interview-record.md)（2026-11-13 〜 23 の決定の経緯）
- **ユーザストーリー**: [📖 user-stories.md](user-stories.md)
- **受け入れ基準**: [✅ acceptance-criteria.md](acceptance-criteria.md)
- **コンテキストノート**: [📝 note.md](note.md)（既存コードの接点、実装順、未決事項）
- **前例**: [shot-annotation/requirements.md](../shot-annotation/requirements.md)（注釈列、スタジオ 3 モード、REQ-301 `annotation_source`）
- **既存スキーマ**: `supabase/migrations/20260726120000_shot_annotation_add_annotation_columns.sql`（shots の `annotation_source` / `ai_model_version` / `ai_confidence`、rallies の `end_reason` / `land_x` / `land_y`）

## スコープ

### 含む

1. `ai_predictions` と `human_resolutions` の追加（additive migration、RLS）とそれを読む型・composable
2. 下書き JSON の取り込み（冪等、人の確定を上書きしない）と、試合ごとの下書き状態
3. 注釈スタジオに「確認モード」を追加（既存 3 モードは残す）
4. `lead_time_ms` の計測と、1 試合あたりの作業時間の集計（BL-020 の代替）
5. 学習用 / 評価用の書き出し（SQL 関数またはスクリプト）と、評価専用の試合の印
6. 統計チャートの「未確認 n / N」表示

### 前提（別単位）

- **記録層の確定が先**: ラリーの開始・終了、サーブ側・サーバー・左右、得点者（導出）は `docs/spec/serve-start-assist/` の方式で確認する。本単位のショット層の下書きは、記録層が確定したラリーに対してだけ出す（ADR-020 §1 原則、作者指摘 2026-11-23）。serve-start-assist の候補と確定を本単位の二層スキーマに載せる改訂は、INBOX-001 の仕分け後に行う。

### 含まない（スコープ外・別単位）

- 推論の実装、モデルの学習・評価・昇格（`~/dev/badkichi-ai`、ADR-020 §4 L1）
- 動画ファイルの受け取り・保管・同意（video-intake、VID-0 〜 4）。本単位は「動画は既存の方式で再生できる」前提
- 顧客自身による確認画面（BL-044）。本単位の確認画面は運営（グループのメンバー）が使う
- 既存 3 パス（決まり方 / 種別 / 打点）の廃止。下書きが揃うまで残す（ADR-020 §1）
- ライブ記録 UI の変更（ADR-017 §3 の聖域）

## 用語

| 用語 | 意味 |
|---|---|
| 予測（prediction） | AI が出した 1 項目の値。モデルの版と確信度を持つ。書き換えない |
| 確定（resolution） | 人が 1 項目に対して行った確認・訂正・却下。元の予測を参照する。書き換えない |
| 現在の値 | shots / rallies の既存列に入っている値。画面と統計が読むのはこれ |
| 項目（field） | 予測・確定の単位。下表の値のいずれか |
| 下書き状態 | 項目ごとに導出する 3 状態: draft（予測のみ）/ confirmed / corrected。表には持たない |
| 評価専用の試合 | 人の確定を学習に使わず評価だけに使う試合（ADR-020 §3） |

### 対象項目

| target | field | 現在の値の列 | 値の型 |
|---|---|---|---|
| rally | `start_ms` | `video_start_timestamp_ms` | integer（動画 ms） |
| rally | `end_ms` | 列なし（最終ショットの `annotated_timestamp_ms` で代替。取り込み時のショット行生成にのみ使う） | integer |
| rally | `serving_team` / `server_player_id` / `server_position` | 同名列（いずれも NOT NULL。予測が欠ける場合の既定値は REQ-008）。人の訂正はここに対して行い、得点者の訂正を兼ねる | text / uuid / text |
| rally | `point_winner` | `point_winner`（**予測項目ではない**。次のラリーの `serving_team` / `server_player_id` の確定から rule-engine で導出。直前がレットなら導出不可。作者決定 2026-11-23） | text（導出） |
| rally | `end_reason` | `end_reason` | text |
| rally | `land_x` / `land_y` | `land_x` / `land_y` | real |
| shot | `timestamp_ms` | `annotated_timestamp_ms`（押下時刻 `video_timestamp_ms` は保持） | integer |
| shot | `hit_player_id` | `hit_player_id` | uuid |
| shot | `shot_type` | `shot_type` | text（16 種） |
| shot | `hit_x` / `hit_y` | `hit_x` / `hit_y` | real |

座標は x と y を 1 項目として扱う（訂正は必ず対で行う）。

## 機能要件（EARS記法）

### 二層スキーマ

- REQ-001: システムは、AI の出力を `ai_predictions` に **追記のみ**で保存しなければならない。列は id、match_id、target_type（shot / rally）、target_id、field、value（jsonb）、ai_model_version、score（0 〜 1、null 可）、batch_id、input_hash、created_at とする。UPDATE と DELETE は提供しない（試合の削除に伴う連鎖削除を除く）🔵 *ADR-020 §2*
- REQ-002: システムは、人の確定を `human_resolutions` に **追記のみ**で保存しなければならない。列は id、prediction_id（元予測。人が新規に入力した場合は null）、match_id、target_type、target_id、field、value（jsonb。却下のときは null）、kind（confirmed / corrected / rejected）、lead_time_ms（null 可）、user_id、created_at とする 🔵 *ADR-020 §2*
- REQ-003: システムは、ある項目の下書き状態を次の規則で導出しなければならない。最新の予測に対する確定が無ければ draft、kind = confirmed なら confirmed、kind = corrected なら corrected、kind = rejected なら現在の値は null で状態は corrected と同じ扱い（人が見た）。状態の列は持たない 🔵 *ADR-020 §2「未変更 ≠ 正解」*
- REQ-004: システムは、確定が書かれたとき、同じ項目の現在の値（shots / rallies の列）を確定の値で更新しなければならない。`annotation_source` は下書き起点の行では `ai` のまま変えない（人が最初から入力した行は `human`）。`ai_model_version` / `ai_confidence` は採用中の予測のものを保持する 🔵 *ADR-020 §2*
- REQ-005: システムは、ラリー単位の一括確認を、そのラリーの shots / rallies の未確定の全項目に対する kind = confirmed の確定として記録しなければならない。一括却下は同様に kind = rejected として記録し、現在の値を null にする 🔵 *ADR-020 §1（ラリー単位の全却下）*

### 下書きの取り込み

- REQ-006: システムは、推論バッチが出す下書き JSON（batch_id、ai_model_version、match_id、predictions[]）を受け取り、`ai_predictions` に追記しなければならない。同じ batch_id の再取り込みは何も追加しない（冪等）🔵 *ADR-020 §4 L1「推論は 1 コマンド」*
- REQ-007: システムは、取り込んだ予測を、**その項目に人の確定が無い場合に限り**現在の値に反映しなければならない。確定がある項目は予測だけ追記し、現在の値は変えない 🔵 *ADR-020 §4 L1（昇格後も人の確定は残る）*
- REQ-008: システムは、取り込みの前にラリーとショットの行が無い試合に対して、予測の `start_ms` / `end_ms` / `timestamp_ms` から rallies / shots の行を生成しなければならない。生成した行は `annotation_source = 'ai'`、`input_source` は AI 由来を示す値とする（値域の追加は note.md）。rallies の NOT NULL 列（`serving_team` / `server_player_id` / `receiver_player_id` / `server_position`）に予測が無い場合は、ルールエンジンの導出か直前ラリーからの繰り越しで埋め、その項目を低確信度（score = 0）の予測として記録する 🟡 *ADR-020 §1 順 1 〜 2（ラリー開始・打刻が最初の下書き）。行の生成規則の詳細は設計で確定*
- REQ-009: システムは、試合ごとに下書きの状態（none / imported / in_review / reviewed）と、採用中の ai_model_version、最終取り込み日時を保持し、試合一覧と確認画面で表示しなければならない 🟡 *運用上の必要から補完*

### 確認画面

- REQ-010: システムは、注釈スタジオに「確認モード」を追加し、ラリーごとに、動画の該当区間の再生と、そのラリーの全項目（ラリー属性とショット列）の現在の値・下書き状態・確信度を一画面で表示しなければならない 🔵 *ADR-020 §1「1 回の確認パス」、`analysis.md` §3-3*
- REQ-011: システムは、ラリー単位の一括確認を 1 キーで実行でき、実行後に次の未確認ラリーへ移動しなければならない 🔵 *ADR-020 §1（1 キーでの確定）*
- REQ-012: システムは、ラリー単位の一括却下を 1 操作で実行でき、却下後にそのラリーを既存の人手パスで入力し直せなければならない 🔵 *ADR-020 §1（直す方が速い UX の条件）*
- REQ-013: システムは、項目ごとの訂正を、種別と打者はキー、時刻はフレーム送り、座標はコート図またはドラッグで行え、訂正の確定は 1 操作としなければならない 🔵 *shot-annotation の既存操作に揃える*
- REQ-014: システムは、確信度の低い項目（閾値は設定値、初期 0.6）を視覚的に区別し、ラリー内でそこへ直接移動できなければならない 🟡 *精度の低い項目を人が見落とさないための補完*
- REQ-015: システムは、確認モードの操作を既存のキー配置と衝突させてはならない。キー一覧は画面内で参照できること 🔵 *shot-annotation REQ 群の方針*

### 作業時間の計測

- REQ-016: システムは、項目ごとの `lead_time_ms` を「その項目（またはラリー）が操作対象になってから確定が書かれるまで」の時間として計測し、確定と一緒に保存しなければならない。一括確認では、ラリーが操作対象になってからの時間をラリー属性の確定に記録し、ショットの確定には 0 を記録する 🔵 *ADR-020 §2（lead_time_ms が BL-020 を満たす）*
- REQ-017: システムは、60 秒を超える無操作を検出したとき、その区間を `lead_time_ms` に含めてはならない（休憩の除外）。閾値は設定値とする 🟡 *`analysis.md` §1 の計測方法（3 分以内の間隔だけ合計）に揃えつつ短くした*
- REQ-018: システムは、試合ごとの作業時間（`lead_time_ms` の合計、項目別・kind 別の内訳、確定した項目数）を読み取れる SQL 関数を提供しなければならない 🔵 *ADR-020 §4 L2 の信号*

### 書き出し

- REQ-019: システムは、`matches` に評価専用の印（`eval_holdout`、boolean、既定 false）を持ち、下書きを初めて取り込む試合に対して「取り込み順で 5 試合に 1 試合」を自動で true にしなければならない。人は印を手で変えられる 🟡 *ADR-020 §3（試合単位の分離）。比率と自動付与の規則は仮*
- REQ-020: システムは、学習用の書き出しとして、`eval_holdout = false` の試合の `human_resolutions` を元予測と結合し、項目・値・kind・ai_model_version・試合・ラリー・ショットの識別子を含む形で出力しなければならない。確定の無い予測は含めない 🔵 *ADR-020 §2「学習に使うのは human_resolutions のある項目だけ」*
- REQ-021: システムは、評価用の書き出しとして、`eval_holdout = true` の試合の現在の値（人の確定があるものだけ）を、評価器が読む形（試合・ラリー・ショット識別子、項目、値）で出力しなければならない 🔵 *ADR-020 §3*
- REQ-022: 書き出しは、学習利用の同意が無い動画に由来する試合を除外できる引数を持たなければならない。同意の列は video-intake（VID-3）で追加されるため、本単位では引数の口だけを用意する 🟡 *ADR-020 §6*

### 統計の未確認表示

- REQ-023: システムは、注釈を集計する各チャートに、集計に使った値のうち人の確定が無い（draft）ものの割合を「未確認 n / N」として表示しなければならない。既存の `stats_annotation_coverage` と同じ位置に出す 🔵 *ADR-020 §2*
- REQ-024: システムは、未確認の割合が設定値（初期 50%）を超えるチャートに注意表示を出さなければならない 🟡 *精度が低い間の誤読を防ぐための補完*

### 条件付き要件

- REQ-101: ある項目に人の確定がある状態で新しい版の予測が取り込まれた場合、システムは現在の値を変えず、予測だけを追記しなければならない（REQ-007 の再掲、版の切り替え時）
- REQ-102: 人が却下したラリーに対して再度予測が取り込まれた場合、システムは却下を有効なまま保ち、現在の値を復活させてはならない。人がそのラリーの却下を取り消したときだけ最新の予測を反映する
- REQ-103: ショットが人手パスで削除された場合、そのショットの予測と確定は試合の削除と同じ連鎖規則で扱う（match-recording REQ-110 に整合）
- REQ-104: 下書きの無い試合（ライブ記録のみ）では、確認モードは「下書きがありません」と表示し、既存 3 モードはこれまでどおり動かなければならない
- REQ-105: 同じ項目に複数の利用者が確定を書いた場合、システムは両方の確定を保存し、現在の値は最後の確定とする

### 制約要件

- REQ-301: マイグレーションは additive のみとし、既存列の意味を変えてはならない（shot-annotation の方針を継続）
- REQ-302: `ai_predictions` と `human_resolutions` の RLS は既存の `is_member_of` に揃える。`ai_predictions` への INSERT は service role（推論バッチ）のみ、`human_resolutions` への INSERT はグループのメンバー
- REQ-303: 予測と確定の物理削除は、試合の削除に伴う連鎖以外では行わない
- REQ-304: 下書き JSON の形式は本単位と `~/dev/badkichi-ai` の間の契約として `docs/design/ai-draft-loop/` に版付きで置き、互換性の無い変更は版を上げる

## 非機能要件

- NFR-001: 確認モードでの訂正は 1 ショットあたり中央値 5 秒以内、ラリーの一括確認は 1 秒以内に完了できること。計測は `lead_time_ms` で行う 🔵 *ADR-020 §1 の受け入れ条件*
- NFR-002: 1 試合（720 打、112 ラリー）の取り込みは 10 秒以内に終わること
- NFR-003: 確認モードは既存スタジオと同じ端末（PC のブラウザ）で動作し、スマホは対象外

## Edgeケース

- EDGE-001: 予測の target_id が存在しないショットを指す（削除済み）→ 取り込み時にスキップし件数を報告する
- EDGE-002: 確認モードでブラウザのタブが非表示になった → 無操作として扱い、`lead_time_ms` から除外する（REQ-017）
- EDGE-003: score が null の予測 → 確信度表示は「不明」とし、REQ-014 の低確信度扱いにする
- EDGE-004: 同じ batch_id で中身が違う JSON → 取り込みを拒否し、input_hash の不一致を報告する
- EDGE-005: 1 ラリーの全項目が既に確定済みのときの一括確認 → 何も書かず次へ移動する
- EDGE-006: `eval_holdout` の自動付与で、グループ内の下書き試合が 5 未満 → 5 試合目まで付与されない（評価セットは当面 `~/dev/badkichi-ai` の固定セットで賄う）

## 受け入れ基準

[acceptance-criteria.md](acceptance-criteria.md) を参照。

## 信頼性レベル

- 🔵 ADR-020 または既存の要件・スキーマに根拠がある
- 🟡 ADR-020 の方針から妥当に補完した（値や規則は設計・運用で確定）
- 🔴 本文書に無し
