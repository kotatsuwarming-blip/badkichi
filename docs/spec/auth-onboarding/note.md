# auth-onboarding コンテキストノート

**作成日**: 2026-05-15

## 単位概要

ユーザーが Google でログインしてから Group に所属し、アプリの本機能（player-management 以降）を
使い始められる状態になるまでの UI 体験を担う単位。data-foundation 完了後に着手する。

- **責務**: ログイン UI / OAuth コールバック / オンボーディング / Group 作成 / 招待リンク参加 / Group 設定（招待リンク発行・メンバー管理）
- **責務外**: Supabase Auth プロバイダ設定（data-foundation）、Group/GroupMember テーブル・RLS・RPC（data-foundation）、選手 CRUD（player-management）
- **依存**: data-foundation（auth 基盤 + Group/GroupMember スキーマ + 3 RPC）

## 技術スタック

- Nuxt 4 (Vue 3 + TypeScript strict mode) + Nuxt UI v4
- `@nuxtjs/supabase`（`useSupabaseClient()` / `useSupabaseUser()`）
- `@nuxtjs/i18n`（ja のみ、en.json はキー構造ハコ、ADR-005 参照）
- `@sentry/nuxt`（Error Tracking）
- Zod（フォームバリデーション）
- Vitest + Vue Test Utils（コンポーネント単体）
- Playwright（E2E、prd スモーク）

## 開発ルール

- ドキュメントは日本語（CLAUDE.md のみ英語）
- ファイルパスはプロジェクトルート相対
- UI コンポーネントは Nuxt UI を優先利用。独自実装は最小限
- エラーハンドリングは ADR-005 / cross-cutting/error-handling.md に準拠
  - page から `supabase.from(...)` 直接呼びは禁止、domain composable 経由
  - 識別子は `app/types/error-codes.ts` で集約、context 文字列は composable に閉じる
- 認証 middleware は Nuxt の `definePageMeta({ middleware: ... })` ベース
- TDD はロジック層（composable）に適用。Vue コンポーネントの見た目テストは最小限

## 関連する既存実装

- data-foundation の TASK-0016 で `/confirm.vue` 最小スタブが先に作られる想定（OAuth コールバック）。auth-onboarding ではこのスタブを本実装に置き換える
- rule-engine（`app/utils/rule-engine/`）は本単位とは独立、関連なし

## 関連する設計文書

- `.dcs/20260328153038_badminton_analytics/prd.md` — PRD 全体
  - §1 マルチテナント設計（Group + GroupMember + RLS）
  - §5.2 データモデル（Group, GroupMember）
  - §5.4 UI/UX 設計（画面一覧は試合管理系のみで、auth-onboarding 画面は未記載）
- `docs/decisions/004-add-auth-onboarding-unit.md` — 単位責務の確定
- `docs/decisions/005-error-handling-strategy.md` — エラーハンドリング戦略
- `docs/design/cross-cutting/error-handling.md` — composable パターン詳細
- `docs/design/data-foundation/architecture.md` — Supabase 接続設定、Auth フロー、Group/GroupMember
- `docs/design/data-foundation/api-endpoints.md` — 3 RPC（`create_group_with_owner`, `join_group_with_code`, 他）
- `docs/design/data-foundation/database-schema.sql` — テーブル DDL（特に `groups`, `group_members`, `group_invitations`）

## スコープ

### MVP に含む

- **ログイン画面** (`/login`): Google OAuth ボタンのみ。サインアップ画面は分けず、Google アカウントがあれば誰でも新規/既存ログイン可能（OAuth の挙動上、初回は自動でユーザー作成される）
- **OAuth コールバック** (`/confirm`): Supabase が OAuth リダイレクト先として叩く。セッション確立後、ユーザーの Group 所属状況で分岐
- **オンボーディング画面** (`/onboarding`): Group 未所属ユーザー向け。「Group を作る」「招待リンクから参加」の 2 択提示（既存招待リンクを持たない場合は Group 作成のみ実質可能）
- **Group 作成画面** (`/groups/new`): Group 名入力 → `create_group_with_owner` RPC 呼び出し → トップへ
- **招待リンク着地ページ** (`/join/[code]`): 招待コードを URL 末尾セグメントで受け取り → 未ログインなら `/login?redirect=/join/[code]` に飛ばす → ログイン済みなら `join_group_with_code` RPC 呼び出し
- **Group 設定画面** (`/groups/[id]/settings`): 招待リンク発行（コピー可能な URL 表示）、メンバー一覧表示、必要なら招待リンク無効化
- **Group 切替 UI**: 複数所属時のための切替コントロール（ヘッダー or サイドバー）
- **認証 middleware**: 未ログインは `/login` へ、Group 未所属（ログイン済み）は `/onboarding` へ強制リダイレクト

### MVP から除外

- メールパスワード認証（Google OAuth のみ）
- パスワードリセット / メール認証フロー
- メンバー削除・ロール管理（PRD §3.2 で除外明記、メンバーは全員フラット read/write）
- Group 削除・退会（MVP では削除機能なし、PRD §3.2）
- プロフィール編集画面（avatar / 表示名は Google アカウントの値そのまま使用）
- 招待リンクの個別有効期限カスタマイズ（DB 側 `expires_at` 固定値、要相談）
- 多言語切替 UI（ja 固定、dev のみ `?locale=en`）

## 画面一覧（MVP 案）

| パス | 画面 | 認証 | Group 所属 | 主な操作 |
|---|---|:---:|:---:|---|
| `/login` | ログイン | ❌ 未ログイン専用 | — | Google OAuth ボタン押下 |
| `/confirm` | OAuth コールバック | ❌→✅ 遷移中 | — | セッション確立 → 適切な画面へ |
| `/onboarding` | オンボーディング | ✅ | ❌ 未所属専用 | Group 作成 or 招待リンク待ち |
| `/groups/new` | Group 作成 | ✅ | 任意 | Group 名入力 → 作成 |
| `/join/[code]` | 招待リンク着地 | ✅（未ログインは `/login` 経由） | 任意 | 招待コードで参加 |
| `/groups/[id]/settings` | Group 設定 | ✅ | ✅ 該当 Group メンバーのみ | 招待リンク発行・メンバー一覧 |

（注: `/` トップ画面の責務は他単位。本単位では遷移先として扱う）

## 主要機能要件（粗粒度）

1. **F-AO-01: Google ログイン**
   - 未ログインで保護ページにアクセス → `/login` リダイレクト
   - `/login` で Google OAuth ボタン → Google 認証画面 → `/confirm` で戻る
2. **F-AO-02: 初回オンボーディング**
   - 初回ログイン or Group 未所属時に `/onboarding` 強制表示
   - 「Group を作る」「招待を待つ」（あるいは招待リンク URL を貼り付け）の選択
3. **F-AO-03: Group 作成**
   - Group 名（1〜50 文字）入力 → `create_group_with_owner` RPC
   - 作成者は自動的に owner として `group_members` に追加（data-foundation 側で実装済）
   - 成功後トップへ
4. **F-AO-04: 招待リンクでの参加**
   - 招待 URL `/join/[code]` を開く → 未ログインなら `/login?redirect=/join/[code]` へ → ログイン後リダイレクトで戻る
   - ログイン済み → `join_group_with_code` RPC → 成功でトップ、失敗で `INVITATION_NOT_FOUND_BY_LINK` / `INVITATION_EXPIRED` を `<UAlert>` 表示
5. **F-AO-05: 招待リンク発行**
   - Group 設定画面で「招待リンク発行」ボタン → `create_invitation` 相当の RPC → URL 表示 + コピーボタン
   - 既存有効リンクの再発行ポリシーは要相談
6. **F-AO-06: Group 切替（複数所属時）**
   - 現在の active Group を localStorage または URL パラメータで管理（要相談）
   - ヘッダー or サイドバーに切替 UI

## 既決事項（data-foundation / ADR 引用）

- Google OAuth のみ、Supabase Auth が provider 設定済（TASK-0001）
- `@nuxtjs/supabase` の `redirectOptions.callback = '/confirm'`、`redirectOptions.login = '/login'`（TASK-0002）
- Group / GroupMember / Invitation のテーブル + RLS は data-foundation で完成（TASK-0005, 0006）
- 3 RPC は data-foundation で実装済（TASK-0007）:
  - `create_group_with_owner(p_group_name text)` → owner として自動追加、SECURITY DEFINER
  - `join_group_with_code(invite_code text)` → 招待コード検証 + GroupMember 追加
  - 招待コード生成系 RPC（B4 で衝突リトライ確定済、TASK-0015 で全敗テスト）
- エラー識別子は ADR-005 確定（`NOT_AUTHENTICATED` / `NOT_A_MEMBER` / `INVALID_GROUP_NAME` / `INVITATION_NOT_FOUND_BY_LINK` / `INVITATION_EXPIRED` / `INVITATION_CODE_COLLISION_AFTER_RETRY`）
- エラー UI チャネル: ADR-005 §6.2 の決定木に従う
  - フィールド原因明確 → `<UFormField>`、フォーム上部 → `<UAlert>`、一過性 → `useToast()`、セッション切れ → `navigateTo('/login')`
- ja のみ + en.json ハコ、dev `?locale=en` 切替

## 未確定の論点（kairo-requirements / kairo-design で詰める）

### A. 動線・遷移系
1. **`/onboarding` 強制リダイレクトの実装方式**: 専用 middleware を 1 つ用意するか、auth middleware 内で Group 所属チェックを兼ねるか
2. **OAuth リダイレクトの戻り先制御**: `/join/[code]` 経由のログインで認証完了後どう戻すか
   - 案 1: `redirect` クエリパラメータを `/login` → `/confirm` まで運ぶ
   - 案 2: localStorage に保存して `/confirm` で参照
3. **初回ログイン判定**: Supabase Auth の `user.created_at == last_sign_in_at` で判定するか、`group_members` の有無のみ見るか

### B. UI 構造系
4. **Group 切替 UI の場所**: ヘッダードロップダウン / サイドバー / 専用ページのどれか（Nuxt UI のパターン参照）
5. **active Group の保持方式**: localStorage / cookie / URL パラメータ（`/g/[group_id]/...` ネスト）/ Pinia store
   - 影響範囲: 全画面のルーティングと API 呼び出し。重要決定
6. **招待リンク UI**: 単純な URL コピーボタンか、QR コード生成も含むか

### C. Group 設定の MVP 範囲
7. **メンバー削除**: PRD §3.2 で「ロール管理は将来」とあるが、自分の退会（Group leave）は MVP で必要か
8. **招待リンク無効化**: MVP で必須か、Phase 2 か
9. **招待リンクの有効期限**: data-foundation 側でデフォルト固定（例: 7 日）か、UI で選択可能か

### D. テスト戦略
10. **コンポーネント単体テストの範囲**: Vue Test Utils でどこまで書くか（フォームバリデーション中心 / UI 全体）
11. **E2E テスト**: Playwright で Google ログインフローを通すか（Supabase Auth テストヘルパー利用 or モック）
12. **i18n キーの整合性チェック**: ja / en の構造一致を自動検証するか

### E. 細部
13. **エラー時の Sentry 報告粒度**: `_BY_LINK` / `_EXPIRED` を Sentry に送るか（ユーザ操作起因の想定エラーは送らない方針が一般的）
14. **ローディング表示**: 各画面のローディング UI を共通化するか個別か（Nuxt UI の Skeleton 利用？）

## 注意事項

- **Supabase 実装は data-foundation 完了後**: 本単位の実装着手は TASK-0009 (dev DB 適用) 完了後。spec/design はリモートで進められる
- **`/confirm` の重複対応**: data-foundation TASK-0016 で最小スタブが作られる。本単位ではそれを本実装に置き換える（差分 commit でわかるように）
- **招待リンク URL の絶対パス**: メール送信 UI は MVP 外だが、URL は `https://<host>/join/[code]` 形式でコピー機能が必要。host は `useRequestURL()` で取得（SSR 対応）
- **Group 未所属からのアクセス制限**: player-management 以降の全画面は「Group 所属済み」を前提にする。本単位の middleware で担保

## 用語

- **オンボーディング**: 初回ログイン後、Group に所属するまでの誘導画面
- **招待リンク**: Group が発行する `/join/[code]` URL。MVP では「招待コード手入力フォーム」は提供せず URL 直リンクのみ
- **active Group**: 複数所属ユーザーが現在閲覧している Group。アプリ全体のデータスコープを決める
- **owner**: Group 作成者。`group_members.role` で表現（MVP では owner / member の 2 値のみ、ロール管理は将来）
