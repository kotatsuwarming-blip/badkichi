# auth-onboarding 要件定義書

**作成日**: 2026-05-24
**作業規模**: フル機能開発
**依存単位**: data-foundation (Supabase Auth 設定 + Group/GroupMember/Invitation スキーマ + 3 RPC + RLS)

## 概要

ユーザーが Google でログインしてから Group に所属し、アプリの本機能（player-management 以降）を
使い始められる状態になるまでの UI 体験を担う単位。MVP では「1 ユーザー = 1 Group」制約を採用し、
複数 Group 所属・切替 UI・active Group 保持機構は実装しない (ADR-006 候補)。

## 関連文書

- **ヒアリング記録**: [💬 interview-record.md](interview-record.md)
- **ユーザストーリー**: [📖 user-stories.md](user-stories.md)
- **受け入れ基準**: [✅ acceptance-criteria.md](acceptance-criteria.md)
- **コンテキストノート**: [📝 note.md](note.md)
- **準備タスク**: [🔧 prep.md](prep.md)
- **PRD**: [badminton_analytics/prd.md](../../../.dcs/20260328153038_badminton_analytics/prd.md)
- **ADR-004 auth-onboarding 単位**: [../../decisions/004-add-auth-onboarding-unit.md](../../decisions/004-add-auth-onboarding-unit.md)
- **ADR-005 エラーハンドリング戦略**: [../../decisions/005-error-handling-strategy.md](../../decisions/005-error-handling-strategy.md)
- **ADR-006 (予定) 1 ユーザー = 1 Group MVP**: 未起票
- **data-foundation architecture**: [../../design/data-foundation/architecture.md](../../design/data-foundation/architecture.md)
- **data-foundation api-endpoints**: [../../design/data-foundation/api-endpoints.md](../../design/data-foundation/api-endpoints.md)
- **エラーハンドリング実装規約**: [../../design/cross-cutting/error-handling.md](../../design/cross-cutting/error-handling.md)

---

## 機能要件（EARS 記法）

**【信頼性レベル凡例】**:
- 🔵 **青信号**: PRD・ADR・data-foundation 設計文書・本セッションヒアリングを参考にした確実な要件
- 🟡 **黄信号**: 上記資料から妥当な推測 (実装フェーズで確認余地)
- 🔴 **赤信号**: 上記資料にない推測

### 通常要件

- **REQ-001**: システムは `/login` ページで Google OAuth ログインボタンを表示し、ユーザが押下した際に `supabase.auth.signInWithOAuth({ provider: 'google' })` を呼び出さなければならない 🔵 *PRD §3 + ADR-004 + data-foundation/api-endpoints.md §認証の前提*

- **REQ-002**: システムは OAuth コールバック URL `/confirm` を実装し、Supabase Auth のセッション確立を待機後、ユーザの Group 所属状況に応じて遷移しなければならない 🔵 *data-foundation/architecture.md §Auth フロー: /confirm ページ*

- **REQ-003**: システムは `/onboarding` ページで Group 未所属ユーザに「Group を作る」「招待リンクから参加」の 2 つの選択肢を提示しなければならない 🔵 *note.md MVP 画面一覧 + ヒアリング Q3*

- **REQ-004**: システムは `/groups/new` ページで Group 名 (1〜50 文字、trim 後) の入力フォームを表示し、送信時に `create_group_with_owner(p_group_name)` RPC を呼び出さなければならない 🔵 *data-foundation/api-endpoints.md §create_group_with_owner*

- **REQ-005**: システムは `/join/[code]` ページで招待コードを受け取り、ログイン済みの場合は `join_group_with_code(invite_code)` RPC を呼び出さなければならない 🔵 *data-foundation/api-endpoints.md §join_group_with_code*

- **REQ-006**: システムは Group 設定画面 `/groups/[id]/settings` で以下を表示しなければならない 🔵 *ヒアリング Q3*:
  - 既存招待リンクの一覧 (発行日 / 期限 / 状態)
  - 「招待リンクを発行」ボタン
  - 各招待リンクの URL コピーボタン
  - Group メンバー一覧 (read only、Google アカウントの表示名 + avatar)

- **REQ-007**: システムは Group 設定画面の「招待リンクを発行」ボタン押下時に `generate_invitation_code(target_group_id)` RPC を呼び出し、返却された code を `${useRequestURL().origin}/join/{code}` 形式で組み立てて表示しなければならない 🔵 *data-foundation/api-endpoints.md §generate_invitation_code + note.md §注意事項*

- **REQ-008**: システムはヘッダーまたはメニュー領域にログアウトボタンを配置し、押下時に `supabase.auth.signOut()` を呼び出し `/login` へ遷移しなければならない 🟡 *PRD 暗黙要件 (認証あればログアウトも必要)*

### 条件付き要件

- **REQ-101**: 未認証ユーザが保護ページ (`/` および `/groups/**` 等) にアクセスした場合、システムは `/login?redirect={requested_path}` へリダイレクトしなければならない 🔵 *note.md F-AO-01 + ヒアリング A1*

- **REQ-102**: ログイン済み Group 未所属ユーザが保護ページにアクセスした場合、システムは `/onboarding` へリダイレクトしなければならない 🔵 *note.md F-AO-02 + ヒアリング A1*

- **REQ-103**: ログイン済み Group 所属ユーザが `/login` または `/onboarding` にアクセスした場合、システムは `/` へリダイレクトしなければならない 🟡 *UX 標準パターン (重複ログイン防止)*

- **REQ-104**: OAuth コールバック処理完了時、URL に `redirect` クエリパラメータが含まれる場合、システムはそのパスへ遷移しなければならない (含まれない場合は `/` へ) 🔵 *ヒアリング A2 + note.md §未確定論点 A-2 案 1*

- **REQ-105**: 既に Group 所属のユーザが `/join/[code]` 経由で `join_group_with_code` を呼び出した場合、システムは `ALREADY_IN_GROUP` エラーを `<UAlert>` で表示しなければならない (1 ユーザー = 1 Group 制約) 🔵 *ヒアリング Q2 + ADR-006 候補*

- **REQ-106**: `join_group_with_code` RPC が `invitation_expired` 例外をスローした場合、システムは `INVITATION_EXPIRED` エラーを `<UAlert>` で表示しなければならない 🔵 *data-foundation/api-endpoints.md §join_group_with_code + cross-cutting/error-handling.md §6.3 #3*

- **REQ-107**: `join_group_with_code` RPC が `invitation_not_found` を返した場合 (URL 直リンク着地由来)、システムは `INVITATION_NOT_FOUND_BY_LINK` エラーを `<UAlert>` で表示しなければならない 🔵 *cross-cutting/error-handling.md §4.1 + ADR-005 §D3*

- **REQ-108**: 未ログインで `/join/[code]` にアクセスした場合、システムは `/login?redirect=/join/[code]` へリダイレクトしなければならない 🔵 *note.md F-AO-04 + ヒアリング A2*

- **REQ-109**: `create_group_with_owner` RPC が `invalid_group_name` 例外をスローした場合、システムは `<UFormField>` の inline error として Group 名フィールド直下に表示しなければならない 🔵 *cross-cutting/error-handling.md §6.3 #2 + cross-cutting/error-handling.md §5.5*

- **REQ-110**: `generate_invitation_code` RPC が `not_a_member` 例外をスローした場合、システムは `<UToast>` で「このグループのメンバーではありません」を表示しなければならない (権限エラーの一過性通知) 🔵 *cross-cutting/error-handling.md §6.3 #5*

### 状態要件

- **REQ-201**: ユーザが未認証状態 (anon ロール) にある場合、システムは Supabase クエリを発行せず、middleware で `/login` へ強制リダイレクトしなければならない 🔵 *data-foundation/architecture.md §RLS 設計*

- **REQ-202**: ユーザがログイン済み Group 未所属状態にある場合、システムは保護ページの本体を一切レンダリングせず、`/onboarding` へ強制リダイレクトしなければならない 🔵 *note.md §注意事項 §Group 未所属からのアクセス制限*

- **REQ-203**: OAuth コールバック処理中 (`/confirm` 内) はシステムはローディング UI (`<USkeleton>` または spinner) を表示し、ユーザに進行中であることを示さなければならない 🟡 *UX 標準 + Nuxt UI v4 パターン*

### オプション要件

- **REQ-301**: Group 設定画面では、招待リンクの「使用回数 (参加実績)」を統計表示してもよい 🟡 *将来拡張余地、MVP では unknown*

- **REQ-302**: ログイン画面では、Google OAuth 以外の認証手段が将来追加可能なように UI レイアウトを拡張可能にしてもよい 🟡 *将来拡張、MVP では Google ボタン 1 つのみ*

### 制約要件

- **REQ-401**: **1 ユーザーは 1 Group のみ所属可能とする** (MVP 制約)。DB 制約 (`group_members UNIQUE(user_id)`) と RPC ガード (`join_group_with_code` で `already_in_group` 例外) の二重で強制する 🔵 *ヒアリング Q2 + Q2a、ADR-006 候補*

- **REQ-402**: Email/Password 認証は使用しない。Google OAuth のみで認証する 🔵 *data-foundation/architecture.md §Supabase プロジェクト + PRD 暗黙要件*

- **REQ-403**: UI 文言は `ja` ロケールのみ表示する。`en.json` はキー構造のみ用意 (空文字 or `[en]` プレースホルダ)。dev のみ `?locale=en` で切替可能 🔵 *ADR-005 §D5 + cross-cutting/error-handling.md §7*

- **REQ-404**: 削除機能 (Group 退会・招待リンク無効化・Group 削除等) は MVP に含まない。`deleted_at` カラムは data-foundation で用意済だが MVP では常に NULL 🔵 *ヒアリング Q3 + PRD §3.2 + project_mvp_revised_scope*

- **REQ-405**: 招待リンクの有効期限は固定 7 日とし、UI で変更できない (data-foundation `generate_invitation_code` RPC で固定設定済) 🔵 *ヒアリング Q3 + data-foundation/api-endpoints.md §generate_invitation_code*

- **REQ-406**: page から `supabase.from(...)` および `supabase.rpc(...)` を直接呼んではならない。必ず domain composable (`useLogin`, `useCreateGroup`, `useJoinGroup`, `useInvitation`, `useCurrentGroup` 等) を経由する 🔵 *ADR-005 §D1 + cross-cutting/error-handling.md §3 原則 1*

- **REQ-407**: エラー識別子は `app/types/error-codes.ts` で集約定数として宣言し、生文字列 (`'invitation_expired'` 等) を page / composable で直接比較してはならない 🔵 *ADR-005 §D2 + cross-cutting/error-handling.md §4.1*

- **REQ-408**: 招待リンク URL は `${useRequestURL().origin}/join/${code}` 形式で組み立てる。SSR 環境での host 取得は `useRequestURL()` を使う 🔵 *note.md §注意事項*

---

## 非機能要件

### パフォーマンス

- **NFR-001**: ログイン押下 → Google OAuth → `/confirm` 経由 → 行き先ページ表示完了までの合計時間は dev 環境で 5 秒以内 (Google OAuth 画面表示〜認証承認のユーザ操作時間を除く) 🟡 *UX 妥当な推測 (Supabase Auth レイテンシ実測未実施)*

- **NFR-002**: `useCurrentGroup()` composable は middleware から 1 リクエスト/ナビゲーションでのみ呼び出され、SSR レンダリング中にキャッシュされる (重複クエリ防止) 🟡 *Nuxt SSR ベストプラクティス*

### セキュリティ

- **NFR-101**: 招待コードは data-foundation の CSPRNG 8 hex 文字 (32 bit) を使用し、ブラウザでの予測・総当たりを困難にする 🔵 *data-foundation/architecture.md §招待コード生成 (⑧ B-12)*

- **NFR-102**: `sb_secret_*` キー (service_role) はクライアントバンドルに一切含めない。auth-onboarding は publishable key (`sb_publishable_*`) のみを `useSupabaseClient()` 経由で使用する 🔵 *data-foundation/architecture.md §セキュリティ + project_supabase_new_keys*

- **NFR-103**: RLS は data-foundation で全テーブルに設定済。auth-onboarding は新規 RLS ポリシーを追加せず、既存ポリシーの範囲内で動作する 🔵 *data-foundation/architecture.md §RLS 設計*

- **NFR-104**: 認証 middleware は `auth.global.ts` として global middleware にし、新規ページ追加時に保護漏れが起きない構造とする 🟡 *Nuxt セキュリティベストプラクティス*

### ユーザビリティ

- **NFR-201**: フォームバリデーション (Group 名 1〜50 文字、空白のみ不可) は Zod スキーマで定義し、`<UFormField>` inline error として表示する 🔵 *cross-cutting/error-handling.md §6.3 #1 + note.md §技術スタック*

- **NFR-202**: 処理中状態 (`/confirm` セッション確立中、Group 作成中、招待参加処理中) は `<USkeleton>` / spinner で共通化し、ユーザに「待っている」状態を明示する 🟡 *Nuxt UI v4 パターン + UX 標準*

- **NFR-203**: 招待リンク URL のコピーボタン押下後、`<UToast>` で「コピーしました」を 2 秒程度表示する 🟡 *UX 標準パターン*

- **NFR-204**: エラー文言は ADR-005 で確定した識別子に対応する `locales/ja.json` キーから取得し、コード内に直接 UI 文言を書かない 🔵 *ADR-005 §D5 + cross-cutting/error-handling.md §5.4*

### 保守性

- **NFR-301**: Vue コンポーネント単体テスト (Vitest + Vue Test Utils) は以下の範囲に限定する 🔵 *memory `feedback_test_coverage`*:
  - フォームバリデーション (Zod スキーマ単体)
  - middleware の分岐ロジック (未認証 / Group 未所属 / Group 所属)
  - composable のエラー処理 (成功 / 失敗 / エッジケース)
  - UI 全体の見た目テストは書かない

- **NFR-302**: E2E テスト (Playwright) は data-foundation の Supabase Admin API ヘルパー (`tests/setup/create-test-users.ts`) でテストユーザを作成し、**ログイン後** の画面遷移 (オンボーディング → Group 作成 → トップ) を検証する。Google OAuth フロー自体は単体テストで `supabase.auth.signInWithOAuth` 呼び出しを mock 検証 🟡 *ヒアリング D2 + data-foundation TASK-0013*

- **NFR-303**: `ja.json` / `en.json` のキー構造が一致することを CI で自動チェックする (auth-onboarding 専用ではなく全単位横断のチェック) 🔵 *memory `feedback_dedicated_linter_cli` + cross-cutting/error-handling.md §7.3*

- **NFR-304**: Sentry には以下を送信する 🔵 *ADR-005 §D6 + cross-cutting/error-handling.md §8*:
  - `error.vue` 落下時の例外
  - `useErrorMessage` の `unmapped_error_code` fallthrough
  - ユーザ操作起因の想定エラー (`INVITATION_NOT_FOUND_BY_LINK` / `INVITATION_EXPIRED` / `NOT_A_MEMBER` / `ALREADY_IN_GROUP`) は **送信しない**

---

## Edgeケース

### エラー処理

- **EDGE-001**: 招待リンク URL `/join/[code]` を未ログイン状態でクリック → `/login?redirect=/join/[code]` → Google OAuth 承認 → `/confirm?redirect=/join/[code]` → セッション確立 → `/join/[code]` に戻る (リダイレクトチェーン全体が機能する) 🔵 *ヒアリング A2 + note.md F-AO-04*

- **EDGE-002**: OAuth コールバック中にネットワークエラー → `/confirm` で `<UAlert>` エラー表示 + 「ログイン画面に戻る」ボタン提示 🟡 *エッジケース、Supabase Auth 仕様*

- **EDGE-003**: Group 作成画面でユーザが二重送信 (送信ボタン連打) → 送信中はボタン disabled で防止 (重複 Group が作られない) 🟡 *UX 標準パターン*

- **EDGE-004**: ログイン中に Supabase セッションが期限切れ → `supabase.auth.onAuthStateChange` を購読し、`SIGNED_OUT` イベントで `navigateTo('/login')` 実行 + `<UToast>` で「セッションが切れました。再ログインしてください」表示 🔵 *cross-cutting/error-handling.md §6.3 #4*

- **EDGE-005**: 招待リンクの code に変な文字 (空白・特殊文字・極端な長さ) が含まれる場合 → DB 側でマッチせず `invitation_not_found` → `INVITATION_NOT_FOUND_BY_LINK` エラー表示 (新規エラー識別子は追加しない) 🔵 *cross-cutting/error-handling.md §5.2 §App 識別子の 1:1 ルール*

- **EDGE-006**: 同じユーザが `/onboarding` で「Group 作成」と「招待リンク参加」を別タブで同時に試行 → DB UNIQUE 制約 (`group_members.user_id`) で 1 件目のみ成功、2 件目は `already_in_group` で拒否 🔵 *REQ-401 + EDGE-001 と整合*

- **EDGE-007**: `create_group_with_owner` RPC が `not_authenticated` を返す (セッション期限切れの稀ケース) → `<UToast>` 「ログインが必要です」 + `navigateTo('/login')` 🔵 *cross-cutting/error-handling.md §6.3 #4*

- **EDGE-008**: `generate_invitation_code` RPC が `invitation_code_collision_after_retry` を返す (事実上ゼロ確率) → `<UToast>` で「招待コードの生成に失敗しました。再度お試しください」 + 再試行ボタン 🟡 *data-foundation/api-endpoints.md §generate_invitation_code 例外定義*

### 境界値

- **EDGE-101**: Group 名 1 文字 (最小) → 受理 🔵 *REQ-004 + data-foundation/api-endpoints.md §create_group_with_owner*
- **EDGE-102**: Group 名 50 文字 (最大) → 受理 🔵 *同上*
- **EDGE-103**: Group 名 0 文字 (trim 後空) → Zod バリデーションエラー (送信前) 🔵 *Zod スキーマ仕様*
- **EDGE-104**: Group 名 51 文字以上 → Zod バリデーションエラー (送信前) 🔵 *同上*
- **EDGE-105**: Group 名が空白のみ (trim 後 0 文字) → Zod バリデーションエラー (送信前) 🔵 *cross-cutting/error-handling.md §4.1 + Zod transform/refine*
- **EDGE-106**: 招待コード長 8 文字以外 → DB 側でマッチせず `INVITATION_NOT_FOUND_BY_LINK` 🔵 *NFR-101 + EDGE-005*
- **EDGE-107**: 招待リンクの期限切れ瞬間 (`expires_at == now()`) → `expires_at < now()` の SQL 比較で `now()` ≤ `expires_at` は受理、`now()` > `expires_at` は `INVITATION_EXPIRED` 🟡 *data-foundation RPC 実装仕様*

---

## 信頼性レベルサマリー

| カテゴリ | 🔵 青信号 | 🟡 黄信号 | 🔴 赤信号 | 合計 |
|---------|---------|---------|---------|------|
| 通常要件 (REQ-001〜008) | 7 | 1 | 0 | 8 |
| 条件付要件 (REQ-101〜110) | 10 | 0 | 0 | 10 |
| 状態要件 (REQ-201〜203) | 2 | 1 | 0 | 3 |
| オプション要件 (REQ-301〜302) | 0 | 2 | 0 | 2 |
| 制約要件 (REQ-401〜408) | 8 | 0 | 0 | 8 |
| 非機能要件 (NFR-*) | 9 | 6 | 0 | 15 |
| Edgeケース (EDGE-*) | 11 | 4 | 0 | 15 |
| **合計** | **47** | **14** | **0** | **61** |

**品質評価**: 高品質 (🔵 77%、🔴 0%)。🟡 はオプション要件・UX 標準パターン・パフォーマンス目標等で、実装フェーズで実測 / kairo-design で詳細化することで 🔵 に昇格可能。
