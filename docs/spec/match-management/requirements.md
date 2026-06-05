# match-management 要件定義書

**作成日**: 2026-06-02
**更新日**: 2026-06-05（試合名・試合日付の列追加、スキーマ拡張方針を反映）
**作業規模**: フル機能開発
**依存単位**: data-foundation (matches テーブル + RLS / 本単位向けに additive migration を追加), player-management (players ロスター), auth-onboarding (Group 所属 middleware)

## 概要

ログイン中ユーザーが所属する Group の **試合（matches）を管理する UI + composable 層**。
data-foundation で確定済みの `matches` テーブル（PostgREST + RLS）を「消費」する構造を基本としつつ、
本単位の要件（試合名・試合日付）に対応するため **matches への additive な列追加 migration を
data-foundation 側に 1 つ加える**（詳細は下記「スキーマ拡張」）。新規 API・新規 RPC は作らない。

試合（match）は「ダブルスの 4 選手 + 動画ソース + 試合名(任意) + 試合日付」を 1 レコードとする
**試合マスタ**であり、セット設定（`sets`）・初期立ち位置（`set_player_positions`）・ラリー
（`rallies`）等の**録画系データは本単位のスコープ外**（match-recording の責務）。本単位は録画を
開始する前段の「いつの・何という名前の・どの 4 選手の・どの動画の試合か」を登録・編集・削除する
責務に限定する。

## スキーマ拡張（data-foundation への additive migration）

本単位の要件を満たすため、`matches` テーブルに以下を**追加的（additive）**に加える。
data-foundation には ADR-006 対応で後から追記 migration を入れた前例（TASK-0018）があり、
今回も列追加のみでデータ破壊リスクは低い。migration の適用は CI 経由（db:push、ローカル不可）。

| 変更 | 内容 | 信頼性 |
|---|---|---|
| `ADD COLUMN name text` | 試合名。任意（NULL 可）。`CHECK (name IS NULL OR char_length(trim(name)) BETWEEN 1 AND 50)` | 🔵 *ヒアリング2026-06-05* |
| `ADD COLUMN match_date date` | 試合日付。必須運用（一覧の管理・並びキー）。default は UI ピッカーで本日 | 🔵 *ヒアリング2026-06-05* |
| `video_source_url` | **変更なし（NOT NULL 維持）**。local は元ファイル名ラベル、youtube は URL を保存 | 🔵 *ヒアリング2026-06-05* |

> 注: ブラウザはローカル動画の OS パスを永続化できない（再生は video-playback「方式A＝毎回再選択」）。
> そのため local の `video_source_url` は**再生に使う値ではなく**、一覧表示用の「前回選んだファイル名」
> という人間向けラベルである。

## 関連文書

- **ヒアリング記録**: [💬 interview-record.md](interview-record.md)
- **ユーザストーリー**: [📖 user-stories.md](user-stories.md)
- **受け入れ基準**: [✅ acceptance-criteria.md](acceptance-criteria.md)
- **コンテキストノート**: [📝 note.md](note.md)
- **DBスキーマ(確定済/要追記)**: [🗄️ data-foundation/database-schema.sql](../../design/data-foundation/database-schema.sql)
- **エラー実装規約**: [⚠️ cross-cutting/error-handling.md](../../design/cross-cutting/error-handling.md)
- **ADR-002 要件分割方針**: [../../decisions/002-requirements-splitting.md](../../decisions/002-requirements-splitting.md)
- **ADR-006 1ユーザー1Group MVP**: [../../decisions/006-single-group-per-user-mvp.md](../../decisions/006-single-group-per-user-mvp.md)
- **ADR-007 composable 命名規約**: [../../decisions/007-composable-naming-conventions.md](../../decisions/007-composable-naming-conventions.md)
- **先行単位(踏襲元)**: [player-management/requirements.md](../player-management/requirements.md)

## スコープ

### 含む（MVP）
- 試合一覧表示（所属 Group・未削除のみ、試合名 or 対戦カード + 試合日付、新しい順）
- 試合の新規作成（4 選手選択 + 動画ソース + 試合名(任意) + 試合日付）
- 試合の編集（4 選手構成 + 動画ソース + 試合名 + 試合日付の全項目）
- 試合の確認ダイアログ付きソフト削除（`deleted_at` 設定）
- 上記に必要な data-foundation への additive migration（`name` / `match_date` 列追加）

### 含まない（MVP 範囲外）
- セット設定（`sets`: セット数・目標点・デュース・サーブ権・カメラ手前チーム）→ **match-recording の責務**
- 初期立ち位置（`set_player_positions`: 左右ポジション）→ **match-recording の責務**
- 録画・スコア・ラリー・ショット入力（`rallies` / `shots` / `position_overrides`）→ **match-recording の責務**
- Group の作成・参加・招待・メンバー管理 → **auth-onboarding が担当済**（ADR-002 の「Group 管理」は実質移管済）
- 削除済み試合の復元（undelete）UI — 後続単位で再検討（保留）
- 試合一覧の検索・絞り込み（player-management と同様 MVP 外、後続で再検討）
- 試合の物理削除（DB に DELETE ポリシー無し、そもそも不可）
- シングルス / トリプルス（matches は 4 選手列固定 = ダブルス専用）

## 機能要件（EARS記法）

**【信頼性レベル凡例】**:
- 🔵 **青信号**: 設計文書（確定スキーマ/ADR）・ユーザヒアリングを参考にした確実な要件
- 🟡 **黄信号**: 設計文書・ヒアリングから妥当な推測による要件
- 🔴 **赤信号**: 出典のない推測による要件

### 通常要件

- REQ-001: システムは、ログイン中ユーザーが所属する Group の試合一覧（未削除）を表示しなければならない 🔵 *matches_select RLS + ADR-006(1user1group)*
- REQ-002: システムは、試合の新規作成（4 選手選択 + 動画ソース + 試合名(任意) + 試合日付）を提供しなければならない 🔵 *matches_insert RLS + matches テーブル定義 + ヒアリング2026-06-05*
- REQ-003: システムは、既存試合の全項目（4 選手構成・動画ソース・試合名・試合日付）の編集を提供しなければならない 🔵 *ヒアリング2026-06-02（全項目編集可） + matches_update RLS*
- REQ-004: システムは、試合の確認ダイアログ付きソフト削除（`deleted_at` 設定）を提供しなければならない 🔵 *ヒアリング2026-06-02（確認ダイアログ付きソフト削除）+ matches に hard DELETE ポリシー無し*
- REQ-005: システムは、試合の作成・編集・削除を Group メンバーであれば誰でも実行できるようにしなければならない 🔵 *RLS is_member_of(group_id) / group_members にロール列なし*
- REQ-006: システムは、試合の 4 選手を所属 Group の選手（players、未削除）から選択させなければならない 🔵 *matches 複合FK REFERENCES players(group_id,id) + players_select RLS*
- REQ-007: システムは、試合名（`name`、任意）の入力を提供し、未入力を許容しなければならない 🔵 *ヒアリング2026-06-05（任意入力、例: XX練習会／横浜市大会）*
- REQ-008: システムは、試合日付（`match_date`）の入力を提供し、これを一覧の管理・並びキーとして用いなければならない（入力 UI の既定は本日） 🔵 *ヒアリング2026-06-05（作成日でなく試合の日付で管理）*

### 条件付き要件

- REQ-101: 4 選手のいずれかが重複（同一 player を 2 スロット以上に指定）した場合、システムは作成／更新を拒否しなければならない 🔵 *matches_players_distinct_check（6-way 不等号）*
- REQ-102: 4 選手スロット（team A × 2 / team B × 2）のいずれかが未選択の場合、システムは作成／更新を拒否しなければならない 🔵 *4 player 列が NOT NULL*
- REQ-103: 動画ソース（`video_source_url`）が未指定（local 未選択 / youtube URL 空）の場合、システムは作成／更新を拒否しなければならない 🔵 *video_source_url NOT NULL*
- REQ-104: 同一カード（同じ 4 選手・同じ動画）の試合が既に存在する場合でも、システムは作成を許可しなければならない 🔵 *ヒアリング2026-06-02（重複許可）/ matches に該当 UNIQUE 無し*
- REQ-105: ユーザーが試合を削除する場合、システムは確認ダイアログを表示し、承認後にソフト削除を実行しなければならない 🔵 *ヒアリング2026-06-02（録画データを伴うため確認必須）*
- REQ-106: ユーザーが動画ソースに local を選択した場合、システムは `video_source_type='local'` とし、選択ファイルの元ファイル名（表示用ラベル）を `video_source_url` に保存しなければならない 🔵 *ヒアリング2026-06-05（NOT NULL維持・ラベル保存）+ video-playback「毎回再選択方式A」（実体パスは保持しない）*
- REQ-107: ユーザーが動画ソースに youtube を選択した場合、システムは `video_source_type='youtube'` とし、URL / 動画 ID を `video_source_url` に保存しなければならない 🔵 *video_source_type CHECK IN ('youtube','local')*
- REQ-108: 試合名が入力されかつ trim 後 50 字を超える場合、システムは作成／更新を拒否しなければならない（未入力は許容） 🔵 *ヒアリング2026-06-05 + groups/players の name 1〜50 字 CHECK と整合*
- REQ-109: 試合日付が未入力の場合、システムは作成／更新を拒否しなければならない 🔵 *REQ-008（管理・並びキーのため必須運用）*

### 状態要件

- REQ-201: 試合が 0 件の場合、システムは空状態（empty state）の説明文と「試合を追加」CTA を表示しなければならない 🔵 *player-management REQ-201 踏襲（空状態+追加CTA）*
- REQ-202: ユーザーが Group 未所属の場合、本画面には到達せず auth-onboarding middleware が `/onboarding` へ誘導しなければならない 🔵 *auth-onboarding REQ-102/REQ-202（auth.global.ts Group所属チェック）*
- REQ-203: 選択可能な選手（所属 Group・未削除）が 4 人未満の場合、システムは試合作成を不可とし、選手追加への導線または説明を表示しなければならない 🟡 *ダブルス4選手必須（matches 4列）から妥当な推測。具体UIは kairo-design*

### オプション要件

- REQ-301: システムは試合一覧の検索・絞り込みを **MVP では提供しない**（後続単位で再検討） 🔵 *player-management REQ-301 踏襲（MVP外）*
- REQ-302: システムは動画ソース種別（`video_source_type`）を将来の独自クラウド等へ拡張可能な構成としてよい（現 DB CHECK は `youtube`/`local`、拡張時は data-foundation 側でスキーマ対応） 🔵 *ヒアリング2026-06-02（youtube・将来の独自クラウド追加できる構成）*

### 制約要件

- REQ-401: システムは matches テーブルへの操作を PostgREST 経由で行い、RLS（is_member_of）に従わなければならない 🔵 *matches_* RLS + auth-onboarding REQ-401 パターン踏襲*
- REQ-402: システムは試合の物理削除を行ってはならない（`deleted_at` のソフト削除のみ） 🔵 *matches に DELETE ポリシー無し*
- REQ-403: システムは page/component から supabase クライアントを直叩きせず、composable 経由で操作しなければならない 🔵 *auth-onboarding REQ-406 / ADR-007 踏襲*
- REQ-404: システムは画面の全文言を i18n locales（ja/en）経由で表示しなければならない 🔵 *auth-onboarding NFR-204 / player-management REQ-404 踏襲*
- REQ-405: システムは録画系テーブル（`sets` / `set_player_positions` / `rallies` / `shots` / `position_overrides` / `recording_gaps`）への書き込みを行ってはならない（match-recording の責務） 🔵 *ヒアリング2026-06-02（スコープ=matchesのみ）+ ADR-002*
- REQ-406: システムは試合の 4 選手を同一 Group 所属の player のみに制限しなければならない（選択肢段階で他 Group の player を出さず、複合 FK でも保証される） 🔵 *matches 複合FK REFERENCES players(group_id,id)*
- REQ-407: システムは試合をダブルス（4 選手）固定として扱い、シングルス／トリプルスを対象としてはならない 🔵 *matches は team_a/b × 2 = 4 選手列固定*
- REQ-408: システムは `matches` への `name` / `match_date` 列追加を **data-foundation の additive migration** として行い、適用は CI 経由（db:push、ローカル不可）としなければならない 🔵 *ヒアリング2026-06-05 + TASK-0018 追記 migration 前例 + memory feedback_db_password_ci_only*

## 非機能要件

### パフォーマンス

- NFR-001: システムは試合一覧の取得に既存の部分インデックス `idx_matches_group_id`（`WHERE deleted_at IS NULL`）を利用しなければならない 🔵 *database-schema.sql:305（具体的応答時間目標は PRD 不在のため構造的保証で代替）*

### セキュリティ

- NFR-101: RLS により、他 Group の試合は取得・追加・更新のいずれも不可であること 🔵 *matches_* RLS = is_member_of(group_id)*
- NFR-102: 本単位は publishable key（`sb_publishable_*`）のみを `useSupabaseClient()` 経由で使用し、service_role キーをクライアントバンドルに含めないこと 🔵 *auth-onboarding NFR-102 踏襲*

### ユーザビリティ

- NFR-201: システムは試合管理 UI に Nuxt UI v4 コンポーネントを使用しなければならない（作成／編集フォームをモーダルとするか専用ページとするかの具体形式は kairo-design で決定） 🔵 *CLAUDE.md「Use Nuxt UI components for UI elements」*
- NFR-202: 選手選択 UI は所属 Group・未削除の player のみを選択肢とし、4 スロットで同一 player の重複選択を防ぐ UI とすること 🟡 *REQ-101/REQ-006 から妥当な推測。具体形式は kairo-design*
- NFR-203: 試合一覧は「試合名（未入力時は対戦カード team A 2 選手 vs team B 2 選手）」と「試合日付（日付のみ表示）」を表示し、試合日付の降順（新しい順、同日は作成時刻 created_at で安定ソート）を既定とすること 🔵 *ヒアリング2026-06-05（試合名表示・日付表示・新しい順）*

### 国際化

- NFR-301: 全文言は locales/ja.json・en.json に定義し、キー構造一致 CI チェックの対象とすること 🔵 *auth-onboarding NFR-303 / player-management NFR-301 踏襲*

### 保守性

- NFR-302: composable は操作別に分割すること（`useMatches`(Read) + `useCreateMatch` / `useUpdateMatch` / `useDeleteMatch`） 🔵 *ADR-007 + player-management(usePlayers/useCreatePlayer/useUpdatePlayer/useDeletePlayer) 踏襲*
- NFR-303: Vue コンポーネント単体テスト（Vitest）は Zod スキーマ単体・composable のエラー処理（成功/失敗/エッジ）・分岐ロジックに限定し、見た目テストは書かないこと 🔵 *ADR-012 + memory feedback_test_coverage*

## Edgeケース

### 入力検証

- EDGE-001: 4 選手に同一 player を含む（例: team_a_player1 と team_b_player2 が同一） → 6-way CHECK 違反、UI 段階で拒否 🔵 *matches_players_distinct_check*
- EDGE-002: 選手スロットのいずれかが未選択 → 送信前に Zod / UI で拒否（DB の NOT NULL 到達前） 🔵 *4 player 列 NOT NULL*
- EDGE-003: 動画ソース未指定（local ファイル未選択 / youtube URL 空欄） → 送信前に拒否 🔵 *video_source_url NOT NULL*
- EDGE-004: youtube URL の形式不正（URL ですらない文字列） → 検証の程度は kairo-design で決定（MVP は最低限「空でないこと」を保証） 🟡 *video_source_url は text のみで DB 形式制約なし、妥当な推測*
- EDGE-011: 試合名 trim 後 50 字 → 許可 / 51 字 → 拒否 / 未入力（空） → 許可（一覧では対戦カード表示） 🔵 *REQ-108 境界値*

### データ整合

- EDGE-005: 同一カード（同 4 選手・同動画）を 2 件作成 → 両方成功し、一覧に 2 行表示される 🔵 *REQ-104 / 該当 UNIQUE 無し*
- EDGE-006: 削除済み（`deleted_at IS NOT NULL`）試合は一覧・編集対象に表示されない 🔵 *REQ-001 未削除フィルタ*
- EDGE-007: 試合に使われている player が（player-management で）ソフト削除された場合 → 試合行は player.id 参照で残存し、一覧では当該選手名を引き続き表示する（soft delete で players 行は残るため名前解決可能） 🔵 *player-management EDGE-006 と対 / matches は player.id 参照*
- EDGE-008: 他 Group の player を指定しようとする → 選択肢に出ず、万一送信されても複合 FK REFERENCES players(group_id,id) で拒否 🔵 *REQ-406 / 複合FK*
- EDGE-012: 試合日付未入力で送信 → 送信前に拒否 🔵 *REQ-109*
- EDGE-013: 同一 `match_date` の試合が複数 → 一覧では created_at 降順で安定的に並ぶ 🔵 *NFR-203*

### 通信・エラー

- EDGE-009: 入力検証エラー（選手未選択・重複・動画ソース空・試合名超過・試合日付未入力）は `<UFormField>` の inline error で表示する 🔵 *error-handling.md §2.C(フォーム入力検証) + §6 決定木①*
- EDGE-010: insert／update／delete の RLS 拒否・PostgREST／ネットワークエラーは `useToast()` で一過性通知する 🔵 *error-handling.md §2.A/F + §6 決定木④*

## 信頼性レベルサマリー

| カテゴリ | 🔵 青信号 | 🟡 黄信号 | 🔴 赤信号 | 合計 |
|---------|---------|---------|---------|------|
| 通常要件 (REQ-001〜008) | 8 | 0 | 0 | 8 |
| 条件付要件 (REQ-101〜109) | 9 | 0 | 0 | 9 |
| 状態要件 (REQ-201〜203) | 2 | 1 | 0 | 3 |
| オプション要件 (REQ-301〜302) | 2 | 0 | 0 | 2 |
| 制約要件 (REQ-401〜408) | 8 | 0 | 0 | 8 |
| 非機能要件 (NFR-*) | 8 | 1 | 0 | 9 |
| Edgeケース (EDGE-*) | 12 | 1 | 0 | 13 |
| **合計** | **49** | **3** | **0** | **52** |

**品質評価**: 高品質（🔵 94%、🔴 0%）。残る 🟡 は ①選手4人未満時の導線UI（REQ-203）②選手選択UIの重複防止形式（NFR-202）③youtube URL 検証の程度（EDGE-004）の 3 件で、いずれも kairo-design で詳細化することで 🔵 に昇格可能。
