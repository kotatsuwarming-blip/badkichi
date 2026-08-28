# singles-support 要件定義書

**作成日**: 2026-08-28
**作業規模**: 既存 5 単位（match-management / match-recording / rule-engine / shot-annotation / stats-dashboard・shot-stats）への横断的な拡張
**依存単位**: data-foundation（`matches` への additive migration）, match-management（試合フォーム）, match-recording + rule-engine（記録）, shot-annotation（注釈）, stats-dashboard / shot-stats（統計）

## 概要

現在ダブルス（各チーム 2 選手、計 4 選手）固定で作られているアプリを、**シングルス（各チーム 1 選手、計 2 選手）の試合も登録・記録・注釈・分析できる**ようにする。

方針は「**ダブルスの実装を最大限流用する**」こと。新しい記録フローや統計関数を作らず、以下の 2 点でシングルスをダブルスの上に載せる。

1. **データ**: `matches` に対戦形式列 `match_type` を追加し、`team_*_player2_id` を NULL 許容にする（シングルス = player2 が NULL）。
2. **ルールエンジン**: シングルスを「左右スロットに同一選手を入れたダブルス」として扱う。サーブ側得点時の左右入替は同一選手なので無害、`serverPosition`（偶数=右/奇数=左）がそのままシングルスのサービスコート規則になるため、`applyRally` / `applyOverride` は無変更で流用できる。

背景: ユーザビリティテスト U-04 でテスターがシングルスを入力して保存に失敗した（[research/usability-test-01/results.md](../../research/usability-test-01/results.md)）。また rule-engine NFR-201 / PRD は当初から「対戦形式を抽象化して拡張可能にする」方針を掲げていた。

## 関連文書

- **ユーザストーリー**: [📖 user-stories.md](user-stories.md)
- **受け入れ基準**: [✅ acceptance-criteria.md](acceptance-criteria.md)
- **コンテキストノート（設計の要点）**: [📝 note.md](note.md)
- **rule-engine 要件 NFR-201（形式抽象化）**: [../rule-engine/requirements.md](../rule-engine/requirements.md)
- **match-management 要件（REQ-407 ダブルス固定 → 本単位で解除）**: [../match-management/requirements.md](../match-management/requirements.md)
- **match-recording 要件（REQ-407 4 選手固定 → 本単位で解除）**: [../match-recording/requirements.md](../match-recording/requirements.md)
- **ADR-017（シングルスは将来対応と記載）**: [../../decisions/017-ai-staged-rollout-and-shot-annotation.md](../../decisions/017-ai-staged-rollout-and-shot-annotation.md)
- **ユーザビリティテスト U-04**: [../../research/usability-test-01/results.md](../../research/usability-test-01/results.md)

## スコープ

### 含む
- `matches` への additive migration（`match_type` 追加・player2 NULL 許容・CHECK 再定義）と `stats_pair_rates` のシングルス除外
- 試合フォームの対戦形式選択（シングルス／ダブルス）と、シングルス時の 1 枠化
- 試合一覧の形式表示と、選手 2 人からの試合作成許可
- 記録画面のシングルス対応（セット設定・コート図・入替ボタン）
- 注釈（種別パス）の打者自動確定
- 統計での player2 NULL の安全な扱い（ペア集計から除外、ペア別モード非表示）
- 既存ダブルスの挙動・データを一切変えないこと（既存行は `match_type='doubles'`）

### 含まない
- シングルス用サイドラインの描画（コート図・注釈コート・統計ゾーンはダブルス幅のまま）
- 失点マップ（StatsWeaknessMaps）のシングルス個人単位化（現状のチーム単位 = シングルスでは実質個人）
- ミックスダブルス／トリプルスなど他形式
- 既存試合の形式変更に伴う録画データの変換（形式変更はフォームの編集で可能だが、記録済みセットの立ち位置行は変換しない）

## 機能要件（EARS記法）

**【信頼性レベル凡例】**:
- 🔵 **青信号**: 設計文書（確定スキーマ/ADR）・ユーザヒアリング・バドミントン競技規則を参考にした確実な要件
- 🟡 **黄信号**: 設計文書・既存実装から妥当な推測による要件
- 🔴 **赤信号**: 出典のない推測による要件

### 通常要件

- REQ-001: システムは、試合の対戦形式として `singles` / `doubles` を保持しなければならない（`matches.match_type`、既定 `doubles`） 🔵 *U-04 + PRD 形式抽象化方針*
- REQ-002: システムは、試合フォームで対戦形式を選択させ、既定をダブルスとしなければならない 🔵 *既存利用者はダブルス中心（match-management ヒアリング）*
- REQ-003: システムは、シングルスの試合を「チーム A 1 選手 / チーム B 1 選手」として保存しなければならない（`team_a_player2_id` / `team_b_player2_id` は NULL） 🔵 *matches_match_type_players_check*
- REQ-004: システムは、シングルスの試合でもダブルスと同じ記録フロー（セット設定 → ショット／得点／レット／スキップ → セット決着 → 試合完了）を提供しなければならない 🔵 *match-recording REQ-002〜008 流用*
- REQ-005: システムは、シングルスのサーブ位置を「サーブ側スコアが偶数のとき右サービスコート、奇数のとき左サービスコート」と導出し、レシーバーを相手選手としなければならない 🔵 *BWF 競技規則 §9 / rule-engine serverPosition の偶奇規則*
- REQ-006: システムは、シングルスの試合でもショット注釈（クイック／種別／打点の 3 パス）と統計（得点率・ショット統計）を提供しなければならない 🔵 *shot-annotation / shot-stats 流用*
- REQ-007: システムは、試合一覧で各試合の対戦形式を識別できるように表示しなければならない 🟡 *形式混在時の判別のため妥当な推測*

### 条件付き要件

- REQ-101: 対戦形式がシングルスの場合、システムは試合フォームで各チーム 1 枠の選手選択のみを表示し、player2 の入力値は無視して NULL に正規化しなければならない 🔵 *REQ-003*
- REQ-102: 対戦形式がダブルスの場合、システムは従来どおり各チーム 2 枠を必須としなければならない（player2 未選択は `player_required`） 🔵 *match-management REQ-102 維持*
- REQ-103: 選択された選手に重複がある場合、システムは作成／更新を拒否しなければならない（シングルスは 2 名、ダブルスは 4 名で判定） 🔵 *matches_players_distinct_check（NULL 対応版）*
- REQ-104: 対戦形式がシングルスの場合、システムはセット設定の「ファースト（偶数側の選手）」入力を省略し、唯一の選手を右コート（ファースト）として `set_player_positions` に各チーム 1 行（`position='right'`）保存しなければならない 🔵 *set_player_positions UNIQUE(set_id, player_id) のため同一選手を 2 行入れられない*
- REQ-105: セット開始時の立ち位置がチームにつき片側スロットしか無い場合、rule-engine はもう一方のスロットを同一選手で埋めなければならない 🔵 *note.md「左右スロットに同一選手」方針*
- REQ-106: 対戦形式がシングルスの場合、システムは記録画面の「A入替／B入替」（左右入れ替わり）ボタンを表示してはならない 🔵 *position_overrides はペアの左右ズレ専用（ADR-002）*
- REQ-107: 対戦形式がシングルスの場合、コート図はサーブ位置（偶数=右/奇数=左）のサービスコートにのみ選手を描き、反対側のセルを空として描かなければならない 🔵 *REQ-005 + 同一選手が 2 セルに出る誤表示の回避*
- REQ-108: 注釈の種別パスで 3 打目以降の打者候補が 1 人（シングルス）の場合、システムは打者二択を待たず当該選手を打者として確定し、次のショットへ進まなければならない 🔵 *shot-annotation REQ-012（打順の偶奇でチーム確定）+ 候補 1 人*
- REQ-109: リロード時に進行中セットを再開する場合、システムは `set_player_positions` の行数が 2（シングルス）でも 4（ダブルス）でも再開できなければならない（両チームの行が揃っていることを条件とする） 🔵 *match-recording resume + REQ-104*
- REQ-110: 試合単体の統計画面で対象試合がシングルスの場合、システムは「ペア別」モードを表示してはならない 🟡 *ペアが存在しないため妥当な推測*

### 状態要件

- REQ-201: 選択可能な選手（所属 Group・未削除）が 2 人以上の場合、システムは試合作成を許可しなければならない（ダブルスの 4 人要件はフォーム検証で担う） 🔵 *match-management REQ-203 の緩和（シングルス最小人数）*
- REQ-202: 選択可能な選手が 2 人未満の場合、システムは試合作成を不可とし、選手追加への導線を表示しなければならない 🔵 *match-management REQ-203 踏襲*
- REQ-203: 既存のダブルス試合（migration 以前に作成）は、`match_type='doubles'` として扱われ、挙動が変わってはならない 🔵 *DEFAULT 'doubles' による後方互換*

### オプション要件

- REQ-301: システムはシングルス用のサイドライン（内側のライン）をコート図に描いてもよい（本単位では実装しない） 🟡
- REQ-302: システムは失点マップをシングルスでは個人単位として表示してもよい（本単位では実装しない） 🟡

### 制約要件

- REQ-401: システムは `matches` への変更を **additive migration** で行い、既存列の削除・既存行のデータ変更を行ってはならない 🔵 *match-management REQ-408 踏襲*
- REQ-402: システムは形式と player2 列の整合を DB CHECK で強制しなければならない（singles → 両 player2 NULL / doubles → 両 player2 NOT NULL） 🔵 *matches_match_type_players_check*
- REQ-403: システムは「全選手相異」CHECK を NULL 対応で再定義しなければならない（旧 6-way 不等号は NULL 混入で CHECK 全体が NULL = 通過となり `a1 = b1` を検出できない） 🔵 *PostgreSQL CHECK の NULL セマンティクス*
- REQ-404: `stats_pair_rates` は player2 が NULL の試合をペア集計から除外しなければならない（`LEAST/GREATEST` が NULL を無視し `(p1, p1)` の偽ペアを生成するため） 🔵 *PostgreSQL LEAST/GREATEST の仕様*
- REQ-405: rule-engine の `applyRally` / `applyOverride` / `determineSetWinner` はシングルス対応のために変更してはならない（`createInitialState` のスロット補完のみで対応する） 🔵 *note.md 流用方針 / rule-engine NFR-201*
- REQ-406: 既存の shot_stats 系 SQL 関数（`hit_player_id IN (a1, a2)` による打者チーム解決）は変更してはならない（`a2 = NULL` でも NULL は不一致扱いとなり正しく動作する） 🔵 *SQL の IN と NULL のセマンティクス*
- REQ-407: migration の適用は CI（`migrate-dev.yml` / `migrate-prd.yml`）経由とし、ローカルから `db push` してはならない 🔵 *docs/operations/supabase-cli.md*
- REQ-408: `app/types/supabase.ts` は migration 適用後に `pnpm db:types` で再生成し、手修正との差分が無いことを確認しなければならない 🟡 *手修正の暫定運用*
- REQ-409: システムは画面の全文言を i18n locales（ja/en）経由で表示しなければならない 🔵 *match-management REQ-404 踏襲*

## 非機能要件

### パフォーマンス

- NFR-001: シングルス対応によって既存の統計 RPC・一覧クエリのインデックス利用が変わってはならない（列追加のみで結合条件は不変） 🔵

### セキュリティ

- NFR-101: `match_type` 列・NULL 許容化は既存 RLS（`is_member_of(group_id)`）の対象範囲を変えてはならない 🔵

### ユーザビリティ

- NFR-201: 対戦形式の切替は試合フォーム内の 1 操作（ラジオ）で完結し、切替時に不要になった選手枠は即座に消えること 🔵 *U-04（形式が分からず入力に失敗）への対応*
- NFR-202: シングルスの記録画面では、ダブルス専用の操作（ファースト選択・入替ボタン）が一切表示されないこと 🔵 *REQ-104 / REQ-106*
- NFR-203: シングルスのコート図で、サーバーが偶数点で右・奇数点で左に移動する様子が視覚的に追えること 🔵 *REQ-107*

### 保守性

- NFR-301: シングルス／ダブルスの分岐は「ロスター人数」または `matchType` から導出し、両形式で共通の composable・純関数を使うこと（形式ごとの別実装を作らない） 🔵 *流用方針*
- NFR-302: 形式ごとの人数は `PLAYERS_PER_TEAM` 定数など 1 箇所に集約し、将来の形式追加（ミックス等）で変更点が局所化されること 🟡

## Edgeケース

### 入力検証

- EDGE-001: フォームでダブルスの 4 枠を選んだ後にシングルスへ切り替えた場合、player2 の残存値は保存されない（NULL に正規化） 🔵 *REQ-101*
- EDGE-002: シングルスで A と B に同一選手を選んだ場合、`players_must_be_distinct` で拒否される 🔵 *REQ-103*
- EDGE-003: 選手が 2〜3 人の Group でダブルスを選ぶと、player2 未選択で `player_required` になる（追加ボタン自体は活性） 🔵 *REQ-102 / REQ-201*

### データ整合・状態遷移

- EDGE-101: 記録済みセットがあるダブルス試合を編集でシングルスに変更した場合、既存の `set_player_positions`（4 行）は変換されない。再開時は両チームの行があれば再開でき、rule-engine は 4 行をそのまま使う（ロスターと不整合な表示になり得る） 🟡 *スコープ外として明記*
- EDGE-102: シングルスのセットを再開（リロード）した場合、`set_player_positions` は 2 行であり、`createInitialState` が左右を補完して確定ラリーを replay できる 🔵 *REQ-105 / REQ-109*
- EDGE-103: シングルス試合を含む Group 統計の「ペア別」は、ダブルス試合のペアのみが集計され、シングルス試合は無視される 🔵 *REQ-404*
- EDGE-104: 選手別統計（`stats_player_rates` / 選手別ショット統計）はシングルス試合のラリーも通常どおり含む 🔵 *player 単位の関数は形式非依存*
- EDGE-105: 注釈の打点パス・クイックパスは打者個人を問わない（チームは打順偶奇で確定）ため、シングルスでも変更なく動作する 🔵 *usePositionPass / useQuickPass*

### 表示

- EDGE-201: 試合名未入力のシングルス試合の対戦カードは「選手A vs 選手B」（`・` 区切りなし）となる 🔵 *REQ-007*
- EDGE-202: シングルスのコート図で、サーバーが左（奇数）のとき、レシーバーも自陣の同ラベル側（対角）に描かれる 🔵 *REQ-005 / REQ-107*

## 受け入れ基準

詳細は [acceptance-criteria.md](acceptance-criteria.md)。

### 機能テスト

- [ ] シングルスを選ぶと各チーム 1 枠になり、2 人で保存でき、DB に `match_type='singles'` / player2 NULL で入る
- [ ] ダブルスは従来どおり 4 枠必須・4 人相異で保存できる
- [ ] 一覧に形式が表示され、選手 2 人の Group で「試合を追加」が活性
- [ ] シングルスの記録: ファースト欄なし、入替ボタンなし、サーブ位置が偶奇で右／左に移動、セット決着・試合完了まで到達
- [ ] シングルスのリロード再開ができる
- [ ] 種別パスで 3 打目以降が打者二択なしに前進する
- [ ] 試合統計でシングルスは「ペア別」が出ず、Group 統計のペア別にシングルス試合が混入しない

### 非機能テスト

- [ ] 既存ダブルスの単体テスト（rule-engine / recording / annotation / stats）が全て通る
- [ ] migration が dev に CI 適用され、`pnpm db:types` の再生成結果が手修正版と一致する
- [ ] i18n キー構造チェック（ja/en）が通る

## 信頼性レベルサマリー

- 🔵 青信号: 39 / 🟡 黄信号: 8 / 🔴 赤信号: 0
