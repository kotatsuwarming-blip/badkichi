# ADR-009: 環境別 Supabase Auth Provider 設定方針

## ステータス
Accepted (2026-05-29)

## 背景

`auth-onboarding` REQ-402 で本番認証は **Google OAuth のみ** と決定済 (Email/Password 認証は不使用)。
一方、data-foundation TASK-0013 / TASK-0014 の RLS 統合テストでは、CI 内で 2 名のテストユーザ
(User A / User B) を作成してログインさせる必要があり、設計は以下のパターンを採用している:

1. `auth.admin.createUser({ email, password, email_confirm: true })` でテストユーザを作成
2. `auth.signInWithPassword({ email, password })` でログインして RLS を検証

この構造を成立させるには Supabase Auth の **Email Provider 有効化** が前提となるが、
そのまま有効化すると anon key 経由の `auth.signUp()` が公開状態となり、外部から
誰でも dev project にユーザ登録できる攻撃面が発生する。anon key は client bundle に
バンドルされる公開情報 ([[project_supabase_new_keys]]) として扱う必要があり、URL の秘匿には
頼れない。

本 ADR は dev / prd の Auth Provider 設定を明文化し、テスト要件とセキュリティ要件を
両立させる方針を確定する。

## 決定

### dev project (`fjfuurlxgijuqpoebtbg`)

| 設定項目 | 値 | 理由 |
|---------|---|------|
| Email Provider | **ON** | TASK-0013/0014 の integration test 要件 |
| Google Provider | ON | 本番フロー (REQ-402) の dev 検証 |
| Anonymous sign-ins | OFF | 不要、攻撃面削減 |
| Allow new users to sign up | **OFF** | anon key 経由の `signUp` を遮断 |

### prd project (今後作成)

| 設定項目 | 値 | 理由 |
|---------|---|------|
| Email Provider | **OFF** | REQ-402 で Google OAuth only、不要 |
| Google Provider | ON | REQ-402 |
| Anonymous sign-ins | OFF | 不要、攻撃面削減 |
| Allow new users to sign up | OFF | Google でも野良登録は許容しない、必要時のみ手動許可 |

### CI / テスト運用

- テストユーザ作成は **Admin API (`service_role` key)** 経由のみ
- `service_role` は signup 設定をバイパスするため、上記の signup OFF は CI に影響しない
- `service_role` key は GitHub Environment Secrets (`dev`) で管理 ([[feedback_environment_secrets]])
- ローカル開発でテストユーザを再現する場合も `service_role` 経由 (anon key で signUp しない)

## 理由

### 1. 公開 anon key を前提とした攻撃面設計

Supabase の anon key は client bundle に含まれる公開情報のため、URL や key を隠すアプローチは成立しない。
攻撃面を塞ぐ唯一の手段は **provider と signup 設定の組み合わせ**:

- Email Provider OFF → `signUp({ email })` も `signInWithPassword` も 422
- Email Provider ON + Allow signup OFF → `signUp` のみ 422、Admin API は通る
- Email Provider ON + Allow signup ON → 外部から自由に登録可能 (NG)

dev では「Admin API は通したいが signUp は塞ぎたい」が要件なので、組み合わせ B が唯一解。

### 2. Admin API は signup 設定をバイパスする (Supabase 仕様)

`auth.admin.createUser()` は service_role 認証下で動作し、`auth.signup_enabled` の値に関わらず
ユーザを作成できる。これは Supabase の公式仕様で、管理機能としての位置付け。
そのため signup OFF と admin user 作成は両立する。

### 3. ADR-006 の二重防御思想を踏襲

ADR-006 で「DB UNIQUE + RPC ガード」の二重防御を採用したのと同様、本 ADR でも:

- **第一層**: Auth provider 設定で攻撃面そのものを削減 (signup OFF)
- **第二層**: RLS で「Group 未所属ユーザは何もできない」状態に閉じ込め (ADR-006)

仮に第一層が破られて野良ユーザが入っても、第二層 (RLS + group_members 未登録) で
データへのアクセスは構造的に防止される。

### 4. CI と本番で provider 構成を変える正当性

本来 dev と prd は同一構成が望ましいが、CI で Google OAuth を通すには:

- Google Workspace の Service Account + Domain-wide Delegation (本プロジェクト未契約)
- もしくは実 Google アカウントで OAuth → bot detection でほぼ確実に塞がれる (NFR-302 の前提)

いずれも非現実的なため、**dev のみ Email を併用** する例外を許容する。
本番フロー (Google) は別途 Playwright E2E + mock で検証する (NFR-302 の方針)。

### データエンジニアのアナロジー

- **anon key = 公開 read connection string**: 隠せないので権限側で絞る (RLS = row-level grant)
- **service_role = DB superuser**: CI / migration / admin tool のみで使う ([[feedback_db_password_ci_only]])
- **signup OFF = `REVOKE INSERT ON auth.users FROM anon`**: 公開ロールから書き込み権を剥がす

## 影響

### Supabase Dashboard 設定 (手動)

dev project (`https://supabase.com/dashboard/project/fjfuurlxgijuqpoebtbg`):

```
Auth → Providers → Email → Enable (ON)
Auth → Providers → Google → Enable (ON) [既設定]
Auth → Sign In / Up → Allow new users to sign up → OFF
Auth → Sign In / Up → Allow anonymous sign-ins → OFF (確認)
```

prd project (作成時):

```
Auth → Providers → Email → Disable (OFF)
Auth → Providers → Google → Enable (ON) + client_id / secret 設定
Auth → Sign In / Up → Allow new users to sign up → OFF
Auth → Sign In / Up → Allow anonymous sign-ins → OFF
```

### TASK-0014 への影響

dev の Email Provider 有効化が CI 統合の最終ブロッカーだったため、本 ADR 適用後に
`gh workflow run ci.yml --ref dev` で再実行 → TASK-0014 完了マークを戻す。

### 文書更新

- `docs/spec/auth-onboarding/requirements.md` REQ-402 の補足として本 ADR を参照
- `docs/design/data-foundation/architecture.md` §Supabase プロジェクト に provider 構成を追記
- `docs/tasks/data-foundation/TASK-0013.md` 既知の制約に本 ADR の前提を追記

### 既存実装への影響

なし (Admin API 経路は既に実装済、TASK-0013 の `setupTestUsers()` がそのまま動く)。

## 採用しなかった選択肢

| 案 | 却下理由 |
|---|---|
| A. dev も prd と同じ Google only | CI で `signInWithPassword` できず TASK-0014/0015 が成立しない。Google OAuth を CI から通す手段が非現実的 |
| B. テスト用 Google アカウントで実 OAuth | Google の bot detection でほぼ確実に塞がれる (NFR-302 の前提)。2FA / reCAPTCHA / "unusual sign-in" 警告で不安定、Playwright 自動化は規約的にもグレー |
| C. `signInWithIdToken` + Google Workspace Service Account | Workspace 契約していない、Domain-wide Delegation の設定コストも大きい。MVP スコープ外 |
| D. Email Provider ON + signup ON のまま運用 | 外部から自由にユーザ登録可能。anon key は公開のため URL 秘匿で守れない。第一層防御を放棄する設計は不採用 |
| E. dev project 自体に IP allowlist | Supabase Pro plan 以上の機能、MVP コスト構造に合わない。anon key は CDN 経由でアクセスされるので IP 制限も実効性が低い |

## 関連メモリ

- [[project_supabase_new_keys]] (新 API キー体系、publishable / secret の使い分け)
- [[feedback_strict_secret_policy]] (secret は .env に書かない、CI Secrets のみ)
- [[feedback_db_password_ci_only]] (service_role 系認証は CI 一本化)
- [[feedback_environment_secrets]] (GitHub Environment Secrets の運用)
- [[project_mvp_revised_scope]] (TASK-0014 ブロッカー解消が本 ADR の動機)

## 参考

- `docs/spec/auth-onboarding/requirements.md` REQ-402 (Google OAuth only)
- `docs/spec/auth-onboarding/acceptance-criteria.md` NFR-302 (E2E で Google OAuth を踏まない方針)
- `docs/tasks/data-foundation/TASK-0013.md` `setupTestUsers()` (Admin API + email_confirm: true)
- `docs/tasks/data-foundation/TASK-0014.md` `signInWithPassword` で RLS 検証
- ADR-006 (二重防御の思想)
- Supabase Docs: Auth → Configuration → Sign In / Up Settings
- Supabase Docs: Auth Admin API (`createUser`)
