# data-foundation ユーザストーリー

**作成日**: 2026-04-17
**関連要件定義**: [requirements.md](requirements.md)
**ヒアリング記録**: [interview-record.md](interview-record.md)

**【信頼性レベル凡例】**:
- 🔵 **青信号**: PRD・ADR・ヒアリングで確実
- 🟡 **黄信号**: 妥当な推測
- 🔴 **赤信号**: 推測

---

**注**: data-foundation は「アプリのユーザー」が直接触る画面を持たない基盤単位。そのため
「開発者」「運用者」をユーザとしたストーリーが中心。後続の auth-onboarding 以降で
エンドユーザー向けストーリーが展開される。

---

## エピック1: Supabase 基盤の立ち上げ

### ストーリー 1.1: dev/prod プロジェクトを分離する 🔵

**信頼性**: 🔵 *ヒアリング 2026-04-16 Q1*

**私は** 開発者 **として**
**Supabase Cloud 上に dev プロジェクトと prod プロジェクトを別々に持ちたい**
**そうすることで** 開発中の破壊的変更が本番ユーザーに影響しないようにできる

**関連要件**: REQ-001, REQ-403

**詳細シナリオ**:
1. Supabase Cloud にサインインする
2. `badkichi-dev` プロジェクトを作成する
3. `badkichi-prod` プロジェクトを作成する
4. 各プロジェクトの接続情報（URL / anon key / service_role key）を `.env.*` に保存する
5. dev/prod それぞれに対して `supabase link --project-ref xxxxx` でリンクする

**前提条件**:
- Supabase のアカウントが存在すること（prep.md の必須タスク）

**優先度**: Must Have

---

### ストーリー 1.2: Supabase Auth の Google プロバイダを有効化する 🔵

**信頼性**: 🔵 *ヒアリング 2026-04-16 Q2*

**私は** 開発者 **として**
**両プロジェクト（dev/prod）で Supabase Auth の Google OAuth を有効化したい**
**そうすることで** ユーザーが Google アカウントでログインできるようになる

**関連要件**: REQ-002

**詳細シナリオ**:
1. Google Cloud Console で OAuth クライアント ID / Secret を取得する
2. Supabase Dashboard の Auth → Providers → Google で有効化し、クライアント情報を設定する
3. リダイレクト URL を設定する（dev: `http://localhost:3000/...`、prod: 実ドメイン）

**前提条件**:
- Google Cloud Console で OAuth アプリが作成されていること（prep.md の必須タスク）

**優先度**: Must Have

---

## エピック2: スキーマとマルチテナント基盤

### ストーリー 2.1: 全テーブルを定義しマイグレーションで管理する 🔵

**信頼性**: 🔵 *PRD §5.2 + ヒアリング 2026-04-16 Q4*

**私は** 開発者 **として**
**PRD §5.2 で定義された全テーブル（groups, group_members, group_invitations, players,
matches, sets, set_player_positions, rallies, shots, position_overrides）を
Supabase CLI のマイグレーションとして管理したい**
**そうすることで** スキーマ変更の履歴が git に残り、dev→prod への適用が再現可能になる

**関連要件**: REQ-003, REQ-004, NFR-302

**詳細シナリオ**:
1. `supabase migration new initial_schema` で初回マイグレーションを作成する
2. PRD §5.2 のデータモデルに従って CREATE TABLE を書く
3. `supabase db push` で dev に適用する
4. 後続のスキーマ変更は常に新しいマイグレーションファイルを追加する（既存は改変しない）

**前提条件**:
- ストーリー 1.1 完了（dev プロジェクトリンク済み）

**優先度**: Must Have

---

### ストーリー 2.2: Group ベースの RLS ポリシーを設定する 🔵

**信頼性**: 🔵 *PRD §1 マルチテナント設計*

**私は** 開発者 **として**
**全テーブルで RLS を有効化し「自分の所属 Group のデータのみアクセス可能」というポリシーを
設定したい**
**そうすることで** クライアントからのクエリが自動的に Group スコープに制限され、
他 Group のデータが漏洩しない

**関連要件**: REQ-101, REQ-201, REQ-401, NFR-104

**詳細シナリオ**:
1. 各テーブルに `ENABLE ROW LEVEL SECURITY` を設定する
2. authenticated ロールに対して「自分が group_members に存在する group_id のみ SELECT/INSERT/UPDATE 可能」のポリシーを定義する
3. anon ロールはデフォルトで全拒否
4. dev 環境で 2 つのテストユーザー（別 Group 所属）でクロスアクセスできないことを確認する

**前提条件**:
- ストーリー 2.1 完了

**優先度**: Must Have

---

### ストーリー 2.3: 招待コードで Group に参加できるようにする 🔵

**信頼性**: 🔵 *ヒアリング 2026-04-16 Q3, Q7*

**私は** 開発者 **として**
**招待コード（7 日有効、回数制限なし）を発行・検証する DB 仕組みを整備したい**
**そうすることで** auth-onboarding 単位で UI を作る際に、DB 操作のみで Group 参加が完結する

**関連要件**: REQ-102, REQ-103, EDGE-001, EDGE-101, NFR-103

**詳細シナリオ**:
1. `group_invitations` テーブルを作成する（code, group_id, created_by, expires_at, created_at）
2. 招待コード生成関数（DB 関数 or Edge Function）を定義する
3. 招待コード検証 + group_members 追加の関数を定義する（期限切れは拒否）
4. 関連 RLS ポリシーを設定する

**前提条件**:
- ストーリー 2.1, 2.2 完了

**優先度**: Must Have

---

## エピック3: 開発体験の整備

### ストーリー 3.1: Nuxt から Supabase に接続する 🔵

**信頼性**: 🔵 *PRD §5.1 アーキテクチャ*

**私は** 開発者 **として**
**Nuxt アプリから Supabase client を利用できる状態にしたい**
**そうすることで** 後続単位（auth-onboarding 以降）が DB 操作を書ける

**関連要件**: REQ-005, NFR-101, NFR-102

**詳細シナリオ**:
1. `@nuxtjs/supabase` モジュールを追加する
2. `nuxt.config.ts` で `supabase` モジュールを有効化
3. `.env.development` / `.env.production` に `SUPABASE_URL` / `SUPABASE_KEY`（anon）を設定
4. `runtimeConfig.public` に公開可能な値だけを渡す
5. `service_role` キーはサーバーサイドのみで参照可能な環境変数にする

**前提条件**:
- ストーリー 1.1 完了

**優先度**: Must Have

---

### ストーリー 3.2: TypeScript 型を自動生成する 🔵

**信頼性**: 🔵 *ヒアリング 2026-04-16 Q6*

**私は** 開発者 **として**
**`pnpm db:types` のようなコマンドで DB スキーマから TypeScript 型定義を再生成したい**
**そうすることで** スキーマ変更のたびに型も追従し、コンパイル時にドリフトを検知できる

**関連要件**: REQ-006, NFR-301

**詳細シナリオ**:
1. `package.json` に `db:types` スクリプトを追加（`supabase gen types typescript --linked > types/supabase.ts`）
2. マイグレーション追加後に `pnpm db:types` を実行する運用を確立
3. `tsconfig.json` の include に `types/supabase.ts` を追加

**前提条件**:
- ストーリー 1.1, 2.1 完了

**優先度**: Must Have

---

### ストーリー 3.3: Zod を導入する 🔵

**信頼性**: 🔵 *ヒアリング 2026-04-16 Q6*

**私は** 開発者 **として**
**Zod をプロジェクトに追加したい**
**そうすることで** 後続単位でフォーム入力バリデーションを宣言的に書ける

**関連要件**: REQ-007

**詳細シナリオ**:
1. `pnpm add zod` を実行
2. 単純な動作確認（例: テストファイルで `z.object({...}).parse({...})`）

**前提条件**: なし

**優先度**: Must Have

---

### ストーリー 3.4: seed.sql と db:reset スクリプトを整備する 🔵

**信頼性**: 🔵 *ヒアリング 2026-04-17 Q9*

**私は** 開発者 **として**
**`pnpm db:reset` を叩けば dev 環境が初期状態に戻る仕組みを用意したい**
**そうすることで** 新しい開発者が簡単に dev 環境を立ち上げられ、各単位が検証用データを
seed.sql に追記していける

**関連要件**: REQ-008, NFR-201

**詳細シナリオ**:
1. `supabase/seed.sql` を新規作成（初期はコメントのみでも可）
2. `package.json` に `db:reset` スクリプトを追加（`supabase db reset --linked`）
3. README にセットアップ手順（clone → install → db:reset → dev）を記載

**前提条件**:
- ストーリー 2.1 完了

**優先度**: Must Have

---

## ストーリーマップ

```
エピック1: Supabase 基盤の立ち上げ
├── 1.1 dev/prod プロジェクト分離 (🔵 Must)
└── 1.2 Google OAuth 有効化 (🔵 Must)

エピック2: スキーマとマルチテナント基盤
├── 2.1 全テーブル定義 + マイグレーション (🔵 Must)
├── 2.2 RLS ポリシー (🔵 Must)
└── 2.3 招待コード基盤 (🔵 Must)

エピック3: 開発体験の整備
├── 3.1 Nuxt Supabase 接続 (🔵 Must)
├── 3.2 TypeScript 型自動生成 (🔵 Must)
├── 3.3 Zod 導入 (🔵 Must)
└── 3.4 seed.sql + db:reset (🔵 Must)
```

## 信頼性レベルサマリー

- 🔵 青信号: 9 件（100%）
- 🟡 黄信号: 0 件（0%）
- 🔴 赤信号: 0 件（0%）

**品質評価**: 高品質（全ストーリーが PRD・ADR・ヒアリングに根拠を持つ）
