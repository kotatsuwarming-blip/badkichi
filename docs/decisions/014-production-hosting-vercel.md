# ADR-014: 本番ホスティング / デプロイ方針 (Vercel)

## ステータス
Accepted (2026-06-09)

## 背景

[[project_monetization_strategy]] (ADR-013) で「公開 SaaS 化・レスポンシブ Web / PWA・
freemium」という方向を確定した。本 ADR はその本番配信レイヤー、すなわち
**Nuxt アプリをどこにどうデプロイするか**を決める。

前提として、このプロジェクトはバックエンド (Postgres / Auth / RLS / Storage) を
**Supabase (マネージド) が既に担う**ため、自前で運用するインフラは
**「Nuxt アプリを置く場所」だけ**に絞られる。

利用者はインフラ知識が浅く、勤務先で使う AWS EKS はこの規模には過剰と判断している。
一方で将来の拡張性は確保したい。

## 決定

### 1. 本番ホスティングは Vercel

- Nuxt アプリは **Vercel** にデプロイする。Nitro が Vercel preset を自動検出するため
  特別なビルド構成は不要 (`process.env.VERCEL` を Nitro が検知)。
- **git push = デプロイ**。サーバー / コンテナ / k8s の運用は持たない。
  - `main` への push → 本番 (production) に自動デプロイ
  - その他ブランチ / PR → プレビュー環境を自動生成
- バックエンドは引き続き **Supabase prd プロジェクト** (`novhoxtyidbmoqihiurz`) を使う。
- **EKS / ECS / 自前サーバーは不採用** (§理由)。

### 2. リポジトリ側の構成 (本 worktree で対応済)

- ルートに `vercel.json` を追加:
  - `framework: "nuxtjs"`
  - `buildCommand: "nuxt build"` … package.json の `build` は `--dotenv .env.production` を
    付けており、その `.env.production` は gitignored で Vercel 上に存在しない。Vercel では
    **環境変数を `process.env` に直接注入する**ため、`--dotenv` を外した素の `nuxt build` を使う。
  - `installCommand: "pnpm install --frozen-lockfile"`
  - `regions: ["hnd1"]` … サーバーレス関数を**東京リージョン**に固定 (日本のユーザー・
    Supabase prd と近接させ遅延最小化)。

### 3. ランタイム環境変数 (Vercel プロジェクト設定で登録)

`server/` ディレクトリは無く、`serverSupabaseServiceRole` 等の **service role 利用も無い**ため、
**秘密鍵を Vercel に置く必要はない**。登録するのは公開系のみ:

| 変数 | 値 | スコープ | 備考 |
|---|---|---|---|
| `NUXT_PUBLIC_SUPABASE_URL` | `https://novhoxtyidbmoqihiurz.supabase.co` | Production (+Preview) | 公開情報 |
| `NUXT_PUBLIC_SUPABASE_KEY` | prd の `sb_publishable_...` | Production (+Preview) | publishable = 公開可、RLS で保護 |
| `NUXT_PUBLIC_ENV` | `prd` | Production | 環境ラベル ([[feedback_naming_prd]]) |
| `NUXT_PUBLIC_SENTRY_DSN` | Sentry の DSN (任意) | Production | 未設定でも起動可 |

- secret key (`sb_secret_*`) は **登録しない** (使っていない & [[feedback_strict_secret_policy]])。
- 将来 service role を使うサーバー処理を足す場合のみ、その時点で Vercel の Encrypted env に追加する。

### 4. 認証 (Google OAuth) のリダイレクト設定

prd は **Google OAuth のみ** ([[project_auth_provider_policy]] / ADR-009)。本番ドメインを
Supabase 側に許可させる必要がある (§影響 の手順)。`supabase/config.toml` の `site_url` /
`additional_redirect_urls` は**ローカル CLI 専用** (127.0.0.1) であり、prd の URL 設定は
**Supabase Dashboard 側で行う** (config.toml には書かない)。

## 理由

### 1. デプロイ対象が「アプリ 1 個」なので EKS は過剰

重いバックエンドを Supabase (マネージド) が持つため、残るのはアプリ層のみ。アプリ 1 個 +
マネージド DB に Kubernetes を持ち込むのは、「マネージドのスケジューラで足りるジョブのために
自前クラスタを立てる」のと同種の過剰さ。EKS は多数サービスを細かく制御する組織向けで、
本プロジェクトの規模・運用体制 (少人数) に合わない。

### 2. 「拡張性」はマネージドの方が手間なく得られる

- **DB スケール** → Supabase のプラン変更で対応 (自前運用なし)
- **Web 層スケール** → Vercel のサーバーレスが自動スケール (EKS より手間ゼロで伸びる)
- **将来の AI 推論 (重い ML)** → Web ホストには載せず、クライアント側 ([[project_monetization_strategy]]
  §6) か GPU 専用サービスに切り出す。**ホスト選択は AI スケールを縛らない**

「管理を増やす拡張性」ではなく「マネージドに任せて伸びる拡張性」を取る。

### 3. ロックインが軽い

Nuxt は Nitro preset でホストを切り替えられる (Vercel → Cloudflare → AWS Amplify はほぼ設定変更)。
初手の選択に重く悩む必要がなく、Vercel から始めて将来見直す余地が常にある。

### 4. 既存の運用と噛み合う

- `dev` ブランチ運用 ([[feedback_dev_direct_merge]]) と「main=本番 / その他=プレビュー」が自然に対応
- 既存 GitHub Actions (CI / migrate-prd / gen-types) はそのまま。Vercel はビルド & 配信のみ担当
- prd マイグレーションは引き続き `migrate-prd.yml` (main push) が担当。Vercel は DB を触らない

### データエンジニアのアナロジー

- **Supabase = マネージド DWH** (BigQuery/Snowflake 同様、DB サーバーは自前で持たない)
- **Vercel = マネージドのクエリ/配信レイヤー** (VM を手で立てず、push したら動く)
- **EKS を選ぶ = 単一ジョブのために自前 k8s を立てる**過剰投資

## 影響

### 本番公開の手順 (Runbook)

#### A. リポジトリ側 (本 worktree `feat/hosting-vercel` で対応済 → dev 経由で main へ)

1. `vercel.json` を追加済。`feat/hosting-vercel` → `dev` → `main` にマージすると本番ビルドに反映。

#### B. ユーザー操作 (アカウント / コンソール / シークレット — Claude では実施不可)

2. **Vercel アカウント作成** し、GitHub リポジトリ (`badkichi`) を **Import**。
   - Framework Preset: Nuxt (自動検出される)
   - Production Branch: `main`
3. **環境変数を登録** (Vercel → Project → Settings → Environment Variables)。上記 §決定 3 の 4 変数。
   - `NUXT_PUBLIC_ENV=prd` は Production スコープ。Preview には別途 `prd` または検証用値を設定。
4. **Supabase prd の URL 設定** (Supabase Dashboard `novhoxtyidbmoqihiurz` → Authentication → URL Configuration):
   - **Site URL** = `https://<本番ドメイン>` (Vercel 既定ドメイン or 独自ドメイン)
   - **Redirect URLs** に `https://<本番ドメイン>/confirm` を追加
     (callback パスは `nuxt.config` の `redirectOptions.callback = '/confirm'` に一致させる)
   - プレビューでもログインを通したい場合は `https://*-<vercel-scope>.vercel.app/confirm` の
     ワイルドカードを追加 (任意)
5. **Google OAuth (prd)** が Supabase prd で有効か確認 (ADR-009)。
   - Supabase → Authentication → Providers → Google: client_id / secret 設定済みであること
   - Google Cloud Console の OAuth client の Authorized redirect URI に
     `https://novhoxtyidbmoqihiurz.supabase.co/auth/v1/callback` が入っていること
     (Google のコールバック先は Supabase であって Vercel ではない点に注意)
6. **デプロイ確認**: `main` への反映で本番ビルド → 発行 URL でログイン (Google) → 主要画面を確認。
7. **独自ドメイン** (任意): Vercel → Domains で追加。追加したら手順 4 の Site URL / Redirect URL を
   そのドメインに更新する。

### コスト

- Vercel の無料 (Hobby) プランは規約上**非商用**。サブスク課金開始 = 商用になる段階で
  **Pro プラン (月 $20 程度) が必要**。仲間内の無料検証中は Hobby で可。
- Supabase prd の Free プランの上限 (DB 容量・MAU 等) に達したら有料プランへ。

### 既知のハマりどころ

- **OAuth リダイレクト未設定**が最頻のハマり (手順 4/5)。これを忘れるとログインが無言で失敗する。
- `package.json` の `build` は `--dotenv .env.production` 付き。Vercel では `vercel.json` の
  `buildCommand: "nuxt build"` で上書きするため**この .env.production 依存は本番に持ち込まない**。
- プレビュー環境の URL は動的なため、プレビューで OAuth を使うならワイルドカード Redirect URL が要る。

### まだやらないこと

- PWA 化 / 独自ドメインは任意・後回し可
- Vercel Pro への切り替えは課金開始時

## 採用しなかった選択肢

| 案 | 却下理由 |
|---|---|
| A. AWS EKS | アプリ 1 個 + マネージド DB に対し過剰。運用負荷・コストが体制に見合わない |
| B. AWS ECS Fargate (コンテナ) | k8s よりは軽いが、Supabase が backend を持つ本構成では自前サーバーを持つ必然性がない |
| C. AWS Amplify Hosting | AWS に揃える利点はあるが、Nuxt との相性・DX は Vercel が上。インフラ知識が浅い体制では Vercel が最短 |
| D. Cloudflare Pages/Workers | 規模拡大時のコストは最強だが、Workers ランタイム制約で一部ライブラリが非対応リスク。初手は Vercel、規模が出たら再評価 (Nitro preset で移行容易) |
| E. 静的エクスポート (SSG/SPA) + S3/CloudFront | ADR-010 で SSR/CSR を併用しており完全静的化は不可。SSR ランタイムが要る |

## 関連メモリ

- [[project_monetization_strategy]] (ADR-013: 公開 SaaS / Web・PWA / AI 方針。本 ADR はその配信層)
- [[project_auth_provider_policy]] (ADR-009: prd は Google OAuth only。リダイレクト設定の前提)
- [[feedback_strict_secret_policy]] (secret は .env に書かない / Vercel Encrypted env のみ)
- [[feedback_naming_prd]] (環境ラベルは prd)
- [[feedback_dev_direct_merge]] (feat → dev 直接マージ。main = 本番デプロイ)
- [[reference_supabase_dev_project]] (Supabase プロジェクト情報)
- [[feedback_environment_secrets]] (GitHub Environment Secrets。migrate-prd が利用)

## 参考

- ADR-009 (Supabase Auth Provider 設定方針)
- ADR-010 (Supabase SSR/CSR 境界 — 完全静的化できない根拠)
- ADR-013 (収益化・プラットフォーム方針)
- `.github/workflows/migrate-prd.yml` (prd マイグレーションは引き続き CI が担当)
- Nuxt Deployment / Nitro Vercel preset: https://nuxt.com/docs/getting-started/deployment
- Vercel + Nuxt: https://vercel.com/docs/frameworks/nuxt
- Supabase Auth Redirect URLs: https://supabase.com/docs/guides/auth/redirect-urls
