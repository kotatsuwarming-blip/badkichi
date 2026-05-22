# data-foundation 準備タスク（ユーザー作業）

> **仕様**: [requirements.md](requirements.md)
> **生成日**: 2026-04-17

data-foundation 実装に入る前に、開発者（kotatsu828）が手動で用意・契約する必要がある項目。
これらが完了していないとマイグレーション適用や認証連携のステップでブロックする。

**【信頼性レベル凡例】**:
- 🔵 要件定義書・設計文書・ユーザヒアリングで明確に必要
- 🟡 要件から妥当に推測される
- 🔴 推測による予防的タスク

---

## 必須（実装開始前に完了が必要）

### 1. Supabase アカウント作成 🔵 *ヒアリング Q1*

- [ ] https://supabase.com でアカウント作成（GitHub ログイン推奨）
- [ ] 組織（Organization）を作成する
- 関連要件: REQ-001

### 2. Supabase プロジェクトを 2 つ作成 🔵 *ヒアリング Q1*

- [ ] `badkichi-dev` プロジェクト作成（リージョン: Asia Northeast Tokyo 推奨）
- [ ] `badkichi-prd` プロジェクト作成
- [ ] 各プロジェクトの以下の情報を控える:
  - プロジェクト URL（Settings → API）
  - publishable key
  - secret key（サーバーサイドでのみ使用、漏洩厳禁）
- 関連要件: REQ-001

### 3. Google Cloud Console で OAuth クライアント ID を作成 🔵 *ヒアリング Q2*

- [ ] https://console.cloud.google.com でプロジェクト作成（例: `badkichi`）
- [ ] APIs & Services → Credentials → Create OAuth client ID
  - Application type: **Web application**
  - Authorized redirect URIs に以下を追加:
    - `https://{supabase-dev-project-ref}.supabase.co/auth/v1/callback`
    - `https://{supabase-prd-project-ref}.supabase.co/auth/v1/callback`
- [ ] Client ID と Client Secret を控える
- [ ] OAuth 同意画面（OAuth consent screen）の設定:
  - User Type: External
  - スコープ: email, profile, openid
- 関連要件: REQ-002

### 4. Supabase Dashboard で Google OAuth プロバイダ設定 🔵 *ヒアリング Q2*

- [ ] dev プロジェクト: Authentication → Providers → Google を有効化、Client ID / Secret を入力
- [ ] prd プロジェクト: 同じく有効化、別の（or 同じ）Client ID / Secret を入力
- [ ] Redirect URLs に以下を追加:
  - dev: `http://localhost:3000/confirm` など Nuxt 側の callback URL
  - prd: 実ドメインの callback URL
- 関連要件: REQ-002

### 5. Supabase CLI インストール 🔵 *ヒアリング Q4*

- [ ] macOS: `brew install supabase/tap/supabase`
- [ ] 動作確認: `supabase --version`
- [ ] `supabase login` でアカウントリンク
- 関連要件: REQ-004

### 6. 環境変数ファイルの初期化 🔵 *NFR-102*

- [ ] `.env.development` を作成（git 管理外）、以下を記載:
  ```
  NUXT_PUBLIC_SUPABASE_URL=https://xxxx.supabase.co
  NUXT_PUBLIC_SUPABASE_KEY=sb_publishable_xxx...（publishable key）
  ```
- [ ] `.env.production` を作成（デプロイ環境で設定）
- [ ] `.gitignore` に `.env.*` が含まれていることを確認（既存 Nuxt `.gitignore` で既に除外されている想定）
- 関連要件: NFR-101, NFR-102

---

## 推奨（実装中に用意できればOK）

### 7. 本番ドメイン取得 🟡

- [ ] badkichi のデプロイ先ドメインを決める（例: Vercel の自動ドメイン or 独自ドメイン）
- [ ] 取得後、Google OAuth の redirect URI と Supabase prd の Site URL に追記
- 必要になるフェーズ: MVP リリース前（data-foundation 完了までは後回し可）
- 関連要件: REQ-002

### 8. prd への初回マイグレーション適用判断 🟡

- [ ] dev で一通り検証完了後、prd に `supabase db push` を適用するタイミングを決める
- [ ] prd 適用前にバックアップ取得（Supabase Dashboard の Database → Backups）
- 必要になるフェーズ: data-foundation タスク終盤
- 関連要件: REQ-003

### 9. GitHub Secrets 登録 🔵 *TASK-0011 / TASK-0012 で利用*

`.github/workflows/ci.yml` の `db-lint` ジョブと `.github/workflows/migrate-prd.yml`
が Supabase CLI で dev/prd にリンクするため、以下の Secrets を GitHub リポジトリの
**Settings → Secrets and variables → Actions** に登録する。

| Secret 名 | 用途 | 値の取得元 |
|----------|------|-----------|
| `SUPABASE_ACCESS_TOKEN` | Supabase CLI 認証 (dev/prd 共通) | https://supabase.com/dashboard/account/tokens で発行 |
| `SUPABASE_DEV_PROJECT_REF` | dev プロジェクト Ref (`db-lint` ジョブで使用) | Supabase Dashboard (dev) → Project Settings → General |
| `SUPABASE_DB_PASSWORD` | dev DB password (`db-lint` の `supabase link` で要求される場合あり) | TASK-0001 で設定したパスワード |
| `SUPABASE_PRD_PROJECT_REF` | prd プロジェクト Ref (`migrate-prd` ジョブで使用) | Supabase Dashboard (prd) → Project Settings → General |
| `SUPABASE_PRD_DB_PASSWORD` | prd DB password (`migrate-prd` の `supabase link` で使用) | TASK-0001 で設定したパスワード |

**注意**:

- これらは dev / prd 環境への書き込み権限を持つため漏洩厳禁。
- リポジトリ運用が本格化したら、`production` Environment を切って Environment Secrets +
  Required reviewers の承認ゲートを追加することを検討（MVP では Repository Secrets で開始）。
- `SUPABASE_ACCESS_TOKEN` を発行した開発者が退職等で抜けた場合は token を revoke して再発行
  する。本番運用時は Bot ユーザでの発行を推奨（MVP では個人 token で OK）。
- 関連要件: REQ-003, REQ-011

---

## 確認事項（判断が必要）

### 9. ~~`deleted_at` カラムを全テーブルに入れるか~~ → **確定: 最初から全テーブルに入れる** 🔵

- [x] ヒアリング 2026-04-17 で確定。全主要テーブルに `deleted_at timestamptz NULL` を含める
- MVP では常に NULL を維持（削除機能は実装しない）
- 関連要件: REQ-405, REQ-402

### 10. Supabase の有料プラン移行タイミング 🔴

- [ ] Free プランの制限（500MB DB, 1GB file, 50MAU）を超える見込みか
- [ ] チームサイズ・利用頻度から判断
- 判断の影響: コスト・ストレージ容量
- 関連要件: 非機能要件全般（PRD §8）

---

## サマリー

| 優先度 | 件数 | 🔵 | 🟡 | 🔴 |
|--------|------|-----|-----|-----|
| 必須 | 6 | 6 | 0 | 0 |
| 推奨 | 3 | 1 | 2 | 0 |
| 確認事項 | 2 | 0 | 0 | 1 |

## 関連文書

- **要件定義書**: [requirements.md](requirements.md)
- **ヒアリング記録**: [interview-record.md](interview-record.md)
