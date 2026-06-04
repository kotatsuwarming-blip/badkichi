# player-management 要件定義書

## 概要

ログイン中ユーザーが所属する Group の **選手（players）ロスターを管理する UI + composable 層**。
新規 DB スキーマ・新規 API は作らず、data-foundation で確定済みの `players` テーブル
（PostgREST + RLS）を「消費」する。auth-onboarding と同じ「既存 DB を消費する UI 層」構造。

選手（player）は **選手マスタ**であり auth.users とは非連動。アプリ利用者（group_members）が
名簿として登録・編集・削除する対象であって、ログインアカウントを持つとは限らない。

## 関連文書

- **ヒアリング記録**: [💬 interview-record.md](interview-record.md)
- **ユーザストーリー**: [📖 user-stories.md](user-stories.md)
- **受け入れ基準**: [✅ acceptance-criteria.md](acceptance-criteria.md)
- **コンテキストノート**: [📝 note.md](note.md)
- **DBスキーマ(確定済)**: [🗄️ data-foundation/database-schema.sql](../../design/data-foundation/database-schema.sql)
- **エラー実装規約**: [⚠️ cross-cutting/error-handling.md](../../design/cross-cutting/error-handling.md)

> **本単位は新規 DB スキーマも新規 API も作らない**。data-foundation の既存 `players` テーブル
> （`players_select` / `players_insert` / `players_update` RLS）+ PostgREST を消費する UI 層。
> そのため `database-schema.sql` / `api-endpoints.md` は本単位では新規作成しない。

## スコープ

### 含む（MVP）
- 選手一覧表示（所属 Group・未削除のみ）
- 選手の新規追加（name 必須 / handedness 任意）
- 選手の編集（name / handedness）
- 選手のソフト削除（`deleted_at` 設定、無警告）

### 含まない（MVP 範囲外）
- 削除済み選手の復元（undelete）UI — 後続単位で再検討（保留）
- 選手の検索・絞り込み（ヒアリング2026-06-01 で MVP 外に確定、後続で再検討）
- 選手とアカウント（auth.users）の連動・招待
- 選手の物理削除（DB に DELETE ポリシー無し、そもそも不可）

## 機能要件（EARS記法）

**【信頼性レベル凡例】**:
- 🔵 **青信号**: 設計文書（確定スキーマ/ADR）・ユーザヒアリングを参考にした確実な要件
- 🟡 **黄信号**: 設計文書・ヒアリングから妥当な推測による要件
- 🔴 **赤信号**: 出典のない推測による要件

### 通常要件

- REQ-001: システムは、ログイン中ユーザーが所属する Group の選手一覧（未削除）を表示しなければならない 🔵 *players_select RLS + ADR-006(1user1group)*
- REQ-002: システムは、選手の新規追加（name 必須・handedness 任意）を提供しなければならない 🔵 *players_insert RLS + players テーブル定義*
- REQ-003: システムは、既存選手の name・handedness の編集を提供しなければならない 🔵 *players_update RLS*
- REQ-004: システムは、選手のソフト削除（`deleted_at` 設定）を提供しなければならない 🔵 *players に hard DELETE ポリシー無し → UPDATE deleted_at のみ*
- REQ-005: システムは、選手の追加・編集・削除を Group メンバーであれば誰でも実行できるようにしなければならない 🔵 *RLS is_member_of(group_id) / group_members にロール列なし*

### 条件付き要件

- REQ-101: 選手名が空、または trim 後 50 字超の場合、システムは登録／更新を拒否しエラーを表示しなければならない 🔵 *players_name_length_check CHECK(1〜50)*
- REQ-102: 同名の選手が既に存在する場合でも、システムは登録を許可しなければならない 🔵 *ヒアリング2026-06-01 / name 非UNIQUE*
- REQ-103: 選手を削除する場合、システムは確認ダイアログを出さずソフト削除を実行しなければならない 🔵 *ヒアリング2026-06-01（無警告ソフト削除）*
- REQ-104: 選手が過去の試合（matches）に参照されていても、システムはソフト削除を許可し試合履歴を保持しなければならない 🔵 *matches は player.id 参照 / soft delete で行は残存*

### 状態要件

- REQ-201: 選手が 0 人の場合、システムは空状態（empty state）の説明文と「選手を追加」CTA を表示しなければならない 🔵 *ヒアリング2026-06-01（空状態+追加CTA を採用）*
- REQ-202: ユーザーが Group 未所属の場合、本画面には到達せず auth-onboarding middleware が `/onboarding` へ誘導しなければならない 🔵 *auth-onboarding auth.global.ts §Group所属チェック*

### オプション要件

- REQ-301: システムは選手一覧の検索・絞り込みを **MVP では提供しない**（後続単位で再検討） 🔵 *ヒアリング2026-06-01（MVP外で確定）*

### 制約要件

- REQ-401: システムは players テーブルへの操作を PostgREST 経由で行い、RLS（is_member_of）に従わなければならない 🔵 *ADR / auth-onboarding REQ-406 パターン踏襲*
- REQ-402: システムは選手の物理削除を行ってはならない（`deleted_at` のソフト削除のみ） 🔵 *players に DELETE ポリシー無し*
- REQ-403: システムは page/component から supabase クライアントを直叩きせず、composable 経由で操作しなければならない 🔵 *auth-onboarding REQ-406 / ADR-007 踏襲*
- REQ-404: システムは画面の全文言を i18n locales（ja/en）経由で表示しなければならない 🔵 *auth-onboarding NFR-204 踏襲*
- REQ-405: システムは選手とアカウント（auth.users）を連動させてはならない 🔵 *memory players_vs_auth_users / players に user_id 列なし*

## 非機能要件

### パフォーマンス

- NFR-001: システムは選手一覧の取得に既存の部分インデックス `idx_players_group_id`（`WHERE deleted_at IS NULL`）を利用しなければならない 🔵 *initial_schema.sql:289（具体的な応答時間目標は PRD 不在のため数値化せず、構造的保証で代替）*

### セキュリティ

- NFR-101: RLS により、他 Group の選手は取得・追加・更新のいずれも不可であること 🔵 *players_* RLS = is_member_of(group_id)*

### ユーザビリティ

- NFR-201: システムは選手管理 UI に Nuxt UI v4 コンポーネントを使用しなければならない（追加／編集フォームをモーダルとするか否かの具体形式は kairo-design で決定） 🔵 *CLAUDE.md「Use Nuxt UI components for UI elements」*
- NFR-202: handedness は3択（right / left / unknown）のUIで選択し、未選択時は unknown を既定とすること 🔵 *players.handedness CHECK + DEFAULT 'unknown'*

### 国際化

- NFR-301: 全文言は locales/ja.json・en.json に定義し、キー構造一致 CI チェックの対象とすること 🔵 *auth-onboarding i18n 基盤踏襲*

## Edgeケース

### 入力検証

- EDGE-001: name が前後空白のみ → trim 後 0 字となり登録を拒否する 🔵 *CHECK char_length(trim(name)) BETWEEN 1 AND 50*
- EDGE-002: name が trim 後ちょうど 50 字 → 許可 / 51 字 → 拒否 🔵 *境界値, CHECK 制約*
- EDGE-003: handedness 未選択 → `unknown` を送信（または列省略で DB 既定値） 🔵 *DEFAULT 'unknown'*

### データ整合

- EDGE-004: 同名選手を2件登録 → 両方成功し、一覧に2行表示される 🔵 *ヒアリング2026-06-01 / name 非UNIQUE*
- EDGE-005: 削除済み（`deleted_at IS NOT NULL`）選手は一覧・編集対象に表示されない 🔵 *REQ-001 未削除フィルタ*
- EDGE-006: 試合参照中の選手を削除 → ソフト削除成功・過去 matches の表示は player.id 経由で維持 🔵 *REQ-104*

### 通信・エラー

- EDGE-007: name 検証エラー（必須未入力・文字数超過）は `<UFormField>` の inline error で表示する 🔵 *error-handling.md §2.C(フォーム入力検証) + §6 決定木①*
- EDGE-008: insert／update／delete の RLS 拒否・PostgREST／ネットワークエラーは `useToast()` で一過性通知する 🔵 *error-handling.md §2.A/F + §6 決定木④*
