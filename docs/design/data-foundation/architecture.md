# data-foundation アーキテクチャ設計

**作成日**: 2026-04-22
**関連要件定義**: [requirements.md](../../spec/data-foundation/requirements.md)
**ヒアリング記録**: [interview-record.md](../../spec/data-foundation/interview-record.md)

**【信頼性レベル凡例】**:
- 🔵 **青信号**: 要件定義書・設計文書・ユーザヒアリングを参考にした確実な設計
- 🟡 **黄信号**: 妥当な推測による設計
- 🔴 **赤信号**: 推測による設計

---

## システム概要 🔵

**信頼性**: 🔵 *要件定義書・ADR-002・ADR-004 より*

data-foundation は badkichi の **Infrastructure Layer** に位置するデータ基盤単位。
Supabase Cloud を使った PostgreSQL データベース、Google OAuth 認証設定、マルチテナント基盤
（Group/GroupMember + RLS）、マイグレーション運用、TypeScript 型自動生成、開発環境セットアップを
提供する。

UI は含まない。後続の auth-onboarding / player-management / match-management 等の単位が
この基盤上で UI を構築する。

## badkichi 全体のレイヤー構造での位置 🔵

**信頼性**: 🔵 *rule-engine architecture.md + ADR-002 より*

```
┌─────────────────────────────────────────────────┐
│  Presentation Layer                              │
│  pages/, components/                             │
│  → auth-onboarding, player-management 等が担当    │
├─────────────────────────────────────────────────┤
│  Use Case / Application Service Layer            │
│  composables/, server/api/                       │
│  → match-recording, stats-dashboard 等が担当     │
├─────────────────────────────────────────────────┤
│  Domain Layer                                    │
│  app/utils/rule-engine/ (✅ 実装済み)             │
│  → 純 TypeScript、外部依存ゼロ                    │
├─────────────────────────────────────────────────┤
│  Infrastructure Layer ★ data-foundation はここ    │
│  Supabase (PostgreSQL + Auth + RLS)              │
│  @nuxtjs/supabase モジュール                      │
│  TypeScript 型自動生成                            │
│  マイグレーション管理                              │
└─────────────────────────────────────────────────┘
```

## アーキテクチャパターン 🔵

**信頼性**: 🔵 *PRD §5.1 + ヒアリング 2026-04-16*

### 共有 DB + Row Level Security パターン

全テナント（Group）のデータが同一 PostgreSQL インスタンスに格納され、
RLS ポリシーによって「自分の所属 Group のデータのみ」に自動フィルタされる。

```
Supabase Cloud (dev)               Supabase Cloud (prd)
┌───────────────────────┐          ┌───────────────────────┐
│  PostgreSQL            │          │  PostgreSQL            │
│  ┌─────────────────┐  │          │  ┌─────────────────┐  │
│  │ groups           │  │          │  │ groups           │  │
│  │ group_members    │  │          │  │ group_members    │  │
│  │ group_invitations│  │          │  │ group_invitations│  │
│  │ players          │  │          │  │ players          │  │
│  │ matches          │  │          │  │ matches          │  │
│  │ sets             │  │          │  │ sets             │  │
│  │ ... (全11テーブル) │  │          │  │ ... (全11テーブル) │  │
│  └─────────────────┘  │          │  └─────────────────┘  │
│  + RLS ポリシー        │          │  + RLS ポリシー        │
│  + DB 関数             │          │  + DB 関数             │
│  + Auth (Google OAuth) │          │  + Auth (Google OAuth) │
└───────────────────────┘          └───────────────────────┘
         ↑                                  ↑
    supabase link                      supabase link
    supabase db push                   supabase db push
         ↑                                  ↑
┌───────────────────────────────────────────────────────┐
│  リポジトリ (git)                                      │
│  supabase/                                            │
│  ├── migrations/                                      │
│  │   └── 20260422000000_initial_schema.sql            │
│  ├── seed.sql                                         │
│  └── config.toml                                      │
└───────────────────────────────────────────────────────┘
```

## コンポーネント構成

### Supabase プロジェクト 🔵

**信頼性**: 🔵 *ヒアリング 2026-04-16 Q1*

| 項目 | dev | prd |
|------|-----|------|
| プロジェクト名 | badkichi-dev | badkichi-prd |
| 用途 | 開発・検証 | 本番 |
| Auth provider | Google OAuth | Google OAuth |
| Email/Password | **disabled** | **disabled** |
| seed.sql 適用 | ✅ db:reset で適用 | ❌ 適用しない |
| db:reset 実行 | ✅ 許可 | ❌ ガードで拒否 |

### Nuxt 側の接続設定 🔵

**信頼性**: 🔵 *ヒアリング 2026-04-20 Q4*

```
nuxt.config.ts
├── modules: ['@nuxtjs/supabase', ...]
└── supabase:
    └── redirectOptions:
        └── login: '/login'
        └── callback: '/confirm'

.env.development
├── NUXT_PUBLIC_SUPABASE_URL=https://xxxx.supabase.co
└── NUXT_PUBLIC_SUPABASE_KEY=sb_publishable_xxx...  (publishable key)

.env.production
├── NUXT_PUBLIC_SUPABASE_URL=https://yyyy.supabase.co
└── NUXT_PUBLIC_SUPABASE_KEY=sb_publishable_yyy...  (publishable key)
```

`@nuxtjs/supabase` が自動的に環境変数を読み込み、`useSupabaseClient()` / `useSupabaseUser()` composable を提供する。

### データベース構成 🔵

**信頼性**: 🔵 *PRD §5.2 + ヒアリング全般*

**テーブル一覧（11 テーブル）**:

| テーブル | 直接 group_id | 間接 FK 経路 | 用途 |
|---------|:---:|:----|------|
| groups | - | (自身が Group) | グループマスタ |
| group_members | ✅ | - | ユーザー所属 |
| group_invitations | ✅ | - | 招待コード |
| players | ✅ | - | 選手マスタ |
| matches | ✅ | - | 試合マスタ |
| sets | - | sets → matches → group_id | セット |
| set_player_positions | - | → sets → matches → group_id | 初期立ち位置 |
| rallies | - | → sets → matches → group_id | ラリー |
| shots | - | → rallies → sets → matches | ショット |
| position_overrides | - | → rallies → sets → matches | 左右入替記録 |
| recording_gaps | - | → sets → matches → group_id | 動画断絶イベント |

**詳細 DDL**: [database-schema.sql](database-schema.sql)

**スコア管理方針 🔵** (② B-7、設計原則 1〜2):
- `sets.score_team_a/b` および `rallies.score_team_a_after/b_after` は **保持しない**。
  スコアは `rallies.point_winner` の COUNT 集計で都度導出する。
- 「SQL で導出できない値」 (サーブチーム / サーバー / レシーバー / サーブ位置 / カメラ向き) のみ
  rallies に denormalize 保存する (rule-engine の出力を保存する形)。
- 動画が見えないために「ラリー数すら数えられない断絶」は per-rally フラグではなく
  独立テーブル `recording_gaps` で記録する (設計原則 6)。

### RLS 設計 🔵

**信頼性**: 🔵 *ヒアリング 2026-04-20 Q2*

**方式**: ヘルパー関数 `is_member_of(group_id)` を使った DRY パターン

```sql
-- ヘルパー関数（1 つ）
CREATE FUNCTION is_member_of(target_group_id uuid) RETURNS boolean
-- 「ログイン中ユーザーが group_members に存在するか」を返す

-- 各テーブルのポリシー（テーブルごとに 1 行）
CREATE POLICY "xxx_select" ON xxx FOR SELECT USING (is_member_of(group_id));
CREATE POLICY "xxx_insert" ON xxx FOR INSERT WITH CHECK (is_member_of(group_id));
CREATE POLICY "xxx_update" ON xxx FOR UPDATE USING (is_member_of(group_id));
```

**group_id を直接持たないテーブル**（sets, rallies, shots 等）:
- FK 経路を辿って group_id を解決する SQL をポリシー内に記述
- 例: rallies → sets.match_id → matches.group_id

### Group 作成・招待コード設計 🔵

**信頼性**: 🔵 *ヒアリング 2026-04-20 Q1 + ⑦ A-1 + ⑧ B-12 + ⑨ B-13*

**方式**: PostgreSQL 関数（plpgsql、すべて `SECURITY DEFINER`）

| 関数名 | 用途 | 呼び出し方 |
|--------|------|-----------|
| `create_group_with_owner(group_name)` | Group 作成 + 作成者の自己加入を原子化 | `supabase.rpc('create_group_with_owner', { group_name })` |
| `generate_invitation_code(group_id)` | 招待コード発行 | `supabase.rpc('generate_invitation_code', { target_group_id })` |
| `join_group_with_code(code)` | 招待コードで参加 | `supabase.rpc('join_group_with_code', { invite_code })` |

**Group 作成 (⑦ A-1 + A-2)**:
- `groups` および `group_members` の **直接 INSERT は RLS で禁止**。Group 作成は `create_group_with_owner` RPC のみ。
- 2 ステップ INSERT (groups + group_members) の中途失敗で「孤児 Group」が生まれるリスクを排除し、
  `group_members_insert` ポリシーの OR 条件 (任意 Group への自己追加) も削除して攻撃面を縮小。

**招待コード生成 (⑧ B-12)**:
- ランダム源は CSPRNG (`gen_random_uuid()` の hex から 8 文字)。`random()` ベースの PRNG は使わない。
- UNIQUE 衝突時は最大 **5 回リトライ**で透過回復。全リトライ失敗時は `invitation_code_collision_after_retry`
  例外をスロー (事実上発生しないが UI でハンドリング可能)。
- コード長は 8 hex 文字を維持 (口頭/Slack で伝える UX を優先)。

**期限切れ招待コードの GC 方針 (⑨ B-13)**:
- MVP では GC せず放置。`group_invitations` の行数が **10 万行を超えた段階** で、
  Supabase Scheduled Functions / pg_cron による定期論理削除 (`deleted_at` を立てる) job を導入する。
- 物理削除は監査要件 (招待発行履歴) を損なうため不採用。
- `code` の UNIQUE 制約は論理削除後も残るが、32bit 空間 (43 億通り) に対し 10 万行は 0.002% であり
  衝突確率に影響なし。partial UNIQUE 化 (`UNIQUE (code) WHERE deleted_at IS NULL`) は不要。

> 例外メッセージ → UI 文言の変換、UI チャネル使い分けは
> [`docs/design/cross-cutting/error-handling.md`](../cross-cutting/error-handling.md)
> および [ADR-005](../../decisions/005-error-handling-strategy.md) を参照。

### Auth フロー: /confirm ページ 🔵

**信頼性**: 🔵 *⑬ C-15*

`@nuxtjs/supabase` の callback URL `/confirm` は OAuth リダイレクト戻り先となるため、
data-foundation で **最小スタブ** (`app/pages/confirm.vue`) を配置する。
スタブの責務は「Supabase ユーザーセッションを検知したらホーム (`/`) に遷移するだけ」で、
ローディング UI / エラー UI / Group 未所属時のオンボーディング遷移などの本実装は
**auth-onboarding 単位** で置換する。これにより data-foundation 完了時に
「Google ログイン → /confirm → ホーム遷移」のスモークテストが成立する。

### マイグレーション運用 🔵

**信頼性**: 🔵 *ヒアリング 2026-04-16 Q4*

```
supabase/
├── migrations/
│   ├── 20260422000000_initial_schema.sql    ← 全テーブル + RLS + 関数
│   └── (以後の変更は新ファイル追加のみ)
├── seed.sql                                  ← dev 用初期データ（空 or 最小）
└── config.toml                               ← Supabase CLI 設定
```

**運用ルール**:
- 既存マイグレーションファイルは **変更禁止**（NFR-302）
- 変更検出: pre-commit フック + GitHub Actions の二重ガード（REQ-011）
- dev 適用: `supabase db push`
- dev リセット: `pnpm db:reset`（seed.sql 再投入）
- prd 適用 (⑮ C-17): `main` ブランチへの merge を契機に GitHub Actions
  (`.github/workflows/migrate-prd.yml`) が自動実行する。発火条件は
  `supabase/migrations/**` パス変更時のみ。バックアップは Supabase 標準の日次自動バックアップに依存し、
  適用直前バックアップは追加しない。失敗時は通知 (Slack / GitHub Issue 等) のみ。

**seed.sql 方針 (⑭ C-16)**:
- `supabase/seed.sql` は **空** (枠ファイル、INSERT ゼロ行) としてコミットする。
- 理由: `group_members` は `auth.uid()` 紐付けが必須のため、メンバーなしの Group を seed しても
  RLS で誰にも見えない。意味のある seed データを作るには本物の auth ユーザーが必要となり、
  ローカル開発体験を損ねる。
- CI のテストデータは `tests/setup/create-test-users.ts` から Supabase Admin API
  (`auth.admin.createUser`) で動的生成する。

### CI / 開発者ツール 🔵

**信頼性**: 🔵 *ヒアリング 2026-04-20 Q3*

| ツール | 用途 | 実装場所 |
|--------|------|---------|
| pre-commit フック | マイグレーション改変検出 + 既存 lint/typecheck/test | `.husky/pre-commit` |
| GitHub Actions | マイグレーション改変検出（セーフティネット） + main merge 時の prd 自動適用 | `.github/workflows/` (`ci.yml`, `migrate-prd.yml`) |
| `pnpm db:push` | dev にマイグレーション適用 | `package.json` scripts |
| `pnpm db:reset` | dev をリセット（prd ガード付き） | `package.json` scripts |
| `pnpm db:types` | TypeScript 型再生成 | `package.json` scripts |
| `pnpm test:integration` | RLS 統合テスト + RPC テスト (Supabase Admin API でテスト用ユーザを自動生成して RLS の境界・RPC の挙動を検証) | `package.json` scripts |

### 型生成パイプライン 🔵

**信頼性**: 🔵 *ヒアリング 2026-04-16 Q6*

```
マイグレーション追加
  → pnpm db:push（dev に適用）
  → pnpm db:types（型再生成）
  → types/supabase.ts が更新される
  → pnpm typecheck で検証
  → git commit
```

### ディレクトリ構造（data-foundation 関連） 🔵

**信頼性**: 🔵 *既存プロジェクト構造 + Supabase CLI 標準*

```
badkichi/
├── supabase/                     ← 🆕 data-foundation で追加
│   ├── migrations/
│   │   └── 20260422000000_initial_schema.sql
│   ├── seed.sql                  ← 空 (枠ファイル、INSERT ゼロ行。⑭ C-16)
│   └── config.toml
├── types/                        ← 🆕 data-foundation で追加
│   └── supabase.ts               ← supabase gen types で自動生成
├── scripts/                      ← 🆕 data-foundation で追加
│   └── check-migration-integrity.sh  ← CI/pre-commit 用
├── tests/                        ← 🆕 data-foundation で追加
│   └── setup/
│       └── create-test-users.ts  ← Supabase Admin API でテスト用ユーザを動的生成 (⑭ C-16)
├── .env.development              ← 🆕（gitignore 対象）
├── .env.production               ← 🆕（gitignore 対象）
├── .github/
│   └── workflows/
│       ├── ci.yml                ← 🆕 マイグレーション改変検出 + RLS/RPC 統合テスト
│       └── migrate-prd.yml       ← 🆕 main merge 時に prd 自動適用 (⑮ C-17)
├── app/
│   └── pages/
│       └── confirm.vue           ← 🆕 OAuth callback 最小スタブ (⑬ C-15、auth-onboarding で置換)
├── nuxt.config.ts                ← modules に @nuxtjs/supabase 追加
├── package.json                  ← scripts に db:push, db:reset, db:types, test:integration 追加
├── app/
│   └── utils/
│       └── rule-engine/          ← 既存（Domain Layer）
└── docs/
    └── design/
        └── data-foundation/      ← 本設計文書
```

## 非機能要件の実現方法

### パフォーマンス 🟡

**信頼性**: 🟡 *NFR-001 は実測確認推奨*

- マイグレーション適用: 30 秒以内目標（初期 10 テーブル規模なら十分余裕の見込み）
- RLS のクエリコスト: `is_member_of()` 内の `group_members` 参照にインデックスを設定
- 将来のデータ増加: rallies / shots テーブルに set_id / rally_id のインデックスを設定

### セキュリティ 🔵

**信頼性**: 🔵 *NFR-101〜104*

- secret キー (`sb_secret_*`): **`.env.*` には書かない**。パスワードマネージャ保管 + シェル env で必要時のみ渡す。クライアントバンドルに含めない。CI/CD では GitHub Actions Secrets 等に登録
- publishable キー (`sb_publishable_*`): `runtimeConfig.public` 経由（ブラウザに露出するが RLS で保護）
- RLS: 全テーブルで有効化。anon ロールは全拒否
- 招待コード: 8 文字英数字、text 型（将来拡張可能）
- Email/Password: 明示的に disabled

### 保守性 🔵

**信頼性**: 🔵 *NFR-301, NFR-302, REQ-011*

- マイグレーション: 追記のみ運用 + CI 改変検出（二重ガード）
- 型同期: `pnpm db:types` で手動同期排除
- DRY: RLS ヘルパー関数で 10 テーブル分のポリシーを統一パターン化

## 技術的制約 🔵

**信頼性**: 🔵 *ヒアリング全般*

- Docker / ローカル Supabase は使用しない（REQ-403）
- MVP では削除機能を実装しない（REQ-402）。`deleted_at` カラムは存在するが常に NULL
- Supabase Free プランの制限内で運用（500MB DB, 50 MAU）

## 関連文書

- **データフロー**: [dataflow.md](dataflow.md)
- **DB スキーマ**: [database-schema.sql](database-schema.sql)
- **要件定義**: [requirements.md](../../spec/data-foundation/requirements.md)
- **準備タスク**: [prep.md](../../spec/data-foundation/prep.md)
- **rule-engine アーキテクチャ**: [architecture.md](../rule-engine/architecture.md)

## 信頼性レベルサマリー

- 🔵 青信号: 19 件（95%）
- 🟡 黄信号: 1 件（5%）— パフォーマンス（NFR-001 は data-foundation 実装後に実測確認、⑯ A-5）
- 🔴 赤信号: 0 件（0%）

**品質評価**: 高品質
