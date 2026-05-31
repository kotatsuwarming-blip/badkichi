# data-foundation 受け入れ基準

**作成日**: 2026-04-17
**関連要件定義**: [requirements.md](requirements.md)
**関連ユーザストーリー**: [user-stories.md](user-stories.md)
**ヒアリング記録**: [interview-record.md](interview-record.md)

**【信頼性レベル凡例】**:
- 🔵 **青信号**: PRD・ADR・ヒアリングで確実
- 🟡 **黄信号**: 妥当な推測
- 🔴 **赤信号**: 推測

---

## REQ-001 / REQ-403: dev/prd プロジェクト分離 🔵

**信頼性**: 🔵 *ヒアリング 2026-04-16 Q1*

### Given
- Supabase アカウントが存在する

### When
- `badkichi-dev`, `badkichi-prd` の 2 プロジェクトを作成し、`supabase link` を dev 側で実施

### Then
- `supabase projects list` に両プロジェクトが表示される
- ローカル Supabase（Docker）は起動していない
- リポジトリに Docker Compose や `supabase start` を前提とするスクリプトが存在しない

### テストケース

- [ ] **TC-001-01**: dev/prd 両プロジェクトが Supabase Dashboard に存在する 🔵
- [ ] **TC-001-02**: `.env.development` の `NUXT_PUBLIC_SUPABASE_URL` が dev プロジェクト URL と一致する 🔵
- [ ] **TC-001-03**: `.env.production` の `NUXT_PUBLIC_SUPABASE_URL` が prd プロジェクト URL と一致する 🔵

---

## REQ-002: Google OAuth 有効化 🔵

**信頼性**: 🔵 *ヒアリング 2026-04-16 Q2*

### Given
- Google Cloud Console で OAuth クライアントが作成済み

### When
- dev/prd 両プロジェクトの Supabase Auth → Providers → Google を有効化

### Then
- Dashboard 上で Google プロバイダが `enabled` 状態
- リダイレクト URL が正しく設定されている

### テストケース

- [ ] **TC-002-01**: Supabase Dashboard の Google プロバイダが enabled 🔵
- [ ] **TC-002-02**: dev プロジェクトの redirect URL に `http://localhost:3000/**` が含まれる 🔵
- [ ] **TC-002-03**: prd プロジェクトの redirect URL に prd ドメインが含まれる 🔵
- [ ] **TC-002-E01**: Email/Password プロバイダが Supabase Dashboard で disabled になっている 🔵 *ヒアリング 2026-04-17 確認済み*

---

## REQ-003 / REQ-004 / NFR-302: スキーマ定義とマイグレーション 🔵

**信頼性**: 🔵 *PRD §5.2 + ヒアリング 2026-04-16 Q4*

### Given
- `supabase link` 済みの dev プロジェクト

### When
- `supabase/migrations/` 配下に連番 SQL を配置し、`supabase db push` を実行

### Then
- PRD §5.2 の全テーブルが dev に作成される
- 各テーブルが期待される列を持つ
- マイグレーションファイルは追記のみで既存ファイルが改変されていない

### テストケース

- [ ] **TC-003-01**: groups テーブルが存在し、id (uuid), name (text), created_at (timestamptz) を持つ 🔵
- [ ] **TC-003-02**: group_members テーブルが存在し、(group_id, user_id) のユニーク制約を持つ 🔵
- [ ] **TC-003-03**: group_invitations テーブルが存在し、code (text), expires_at (timestamptz), used_count (int) を持つ 🔵
- [ ] **TC-003-04**: players, matches, sets, set_player_positions, rallies, shots, position_overrides の全テーブルが存在 🔵
- [ ] **TC-003-05**: 全テーブルに group_id（直接 or 間接 FK 経由）で Group にたどれる経路がある 🔵
- [ ] **TC-003-06**: 全主要テーブルに `deleted_at timestamptz NULL` カラムが存在する 🔵 *REQ-405*
- [ ] **TC-003-07**: MVP 完了時点で全行の `deleted_at` が NULL である（削除されたデータがない） 🔵 *REQ-402, REQ-405*
- [ ] **TC-003-E01**: 既存マイグレーションファイルを変更してコミットしようとすると、CI または pre-commit フックがエラーを出す 🔵 *REQ-011, ヒアリング 2026-04-17*

---

## REQ-005 / NFR-101 / NFR-102: Nuxt Supabase クライアント 🔵

**信頼性**: 🔵 *PRD §5.1*

### Given
- Supabase の URL と publishable key が取得可能

### When
- Nuxt アプリを `pnpm dev` で起動し、Supabase client を import する

### Then
- クライアント側コードで publishable key が利用できる
- クライアント側バンドルに secret key が含まれていない

### テストケース

- [ ] **TC-005-01**: `nuxt.config.ts` の modules に `@nuxtjs/supabase` が登録されている 🔵
- [ ] **TC-005-02**: `runtimeConfig.public` に `NUXT_PUBLIC_SUPABASE_URL` と publishable key が設定されている 🔵
- [ ] **TC-005-03**: ブラウザでビルド成果物を検索して `service_role` 文字列が出現しない 🔵 (セキュリティ境界値)
- [ ] **TC-005-04**: `useSupabaseClient()` が正常に client を返す 🔵

---

## REQ-006 / NFR-301: TypeScript 型自動生成 🔵

**信頼性**: 🔵 *ヒアリング 2026-04-16 Q6*

### Given
- dev プロジェクトにマイグレーションが適用済み

### When
- `pnpm db:types` を実行

### Then
- `types/supabase.ts` が最新スキーマで生成される
- 型定義 `Database['public']['Tables']` に全テーブルが含まれる
- `pnpm typecheck` が通る

### テストケース

- [ ] **TC-006-01**: `pnpm db:types` 成功、`types/supabase.ts` が生成される 🔵
- [ ] **TC-006-02**: 生成された型に `groups`, `players`, `rallies` 等が含まれる 🔵
- [ ] **TC-006-03**: `pnpm typecheck` が警告なしで通る 🔵

---

## REQ-007: Zod 導入 🔵

**信頼性**: 🔵 *ヒアリング 2026-04-16 Q6*

### Given
- プロジェクトルートで `pnpm install` 済み

### When
- Zod をインポートしてスキーマを定義する

### Then
- `z.object({...}).parse(...)` が期待通り動作する

### テストケース

- [ ] **TC-007-01**: `package.json` に `zod` が依存として記載されている 🔵
- [ ] **TC-007-02**: テストファイルで `z.string().parse('foo')` が成功する 🔵

---

## REQ-008 / NFR-201: seed.sql と db:reset 🔵

**信頼性**: 🔵 *ヒアリング 2026-04-17 Q9*

### Given
- dev プロジェクトがリンク済み

### When
- `pnpm db:reset` を実行

### Then
- dev DB が drop → migrations 再適用 → seed.sql 投入された状態になる
- `supabase/seed.sql` ファイルが存在する（中身は空または最小でも可）

### テストケース

- [ ] **TC-008-01**: `supabase/seed.sql` ファイルが存在する 🔵
- [ ] **TC-008-02**: `package.json` に `db:reset` スクリプトが記載されている 🔵
- [ ] **TC-008-03**: `pnpm db:reset` 実行成功、終了コード 0 🔵
- [ ] **TC-008-E01**: prd プロジェクトにリンクされた状態で `pnpm db:reset` を実行すると exit 1 でエラー終了する 🔵 *REQ-009, ヒアリング 2026-04-17*
- [ ] **TC-008-E02**: dev プロジェクトにリンクされた状態でのみ db:reset が成功する 🔵 *REQ-009*

---

## REQ-101 / REQ-201 / REQ-401 / NFR-104: RLS ポリシー 🔵

**信頼性**: 🔵 *PRD §1 マルチテナント*

### Given
- dev に全テーブル + テストユーザー 2 名（Group A 所属・Group B 所属）

### When
- 各ユーザーの JWT で他 Group のデータに SELECT / INSERT / UPDATE する

### Then
- 他 Group のデータは SELECT で空集合、INSERT / UPDATE は拒否される

### テストケース

- [ ] **TC-RLS-01**: Group A ユーザーが Group A の players を SELECT → 取得可能 🔵
- [ ] **TC-RLS-02**: Group A ユーザーが Group B の players を SELECT → 空集合 🔵
- [ ] **TC-RLS-03**: Group A ユーザーが Group B の players に INSERT → 失敗 🔵
- [ ] **TC-RLS-04**: anon ロールでの全テーブル SELECT → 失敗 or 空集合 🔵
- [ ] **TC-RLS-B01**: ユーザーが複数 Group に所属している場合、いずれの Group のデータも取得可能 🔵 (境界値)

---

## REQ-102 / REQ-103 / EDGE-001 / EDGE-101 / NFR-103: 招待コード 🔵

**信頼性**: 🔵 *ヒアリング 2026-04-16 Q3, Q7*

### Given
- 既存 Group A の管理者ユーザー
- 別ユーザー（Group 未所属）

### When
- 管理者が招待コード発行 → 別ユーザーがコードを使って join

### Then
- `group_invitations` に行が挿入され、code は 8 文字以上、expires_at は `now() + 7 days`
- 別ユーザーが valid コードで join 成功（group_members に追加）
- 期限切れコードでの join は失敗

### テストケース

- [ ] **TC-INV-01**: 招待コード発行関数が 8 文字の英数字ランダム文字列を返す 🔵 *NFR-103 確認済み*
- [ ] **TC-INV-02**: expires_at が発行時刻 + 7 日（±1 秒）である 🔵 (境界値)
- [ ] **TC-INV-03**: valid コードで join → group_members に追加成功 🔵
- [ ] **TC-INV-E01**: expired コードで join → エラー（expired） 🔵
- [ ] **TC-INV-E02**: 存在しないコードで join → エラー（not found） 🔵
- [ ] **TC-INV-B01**: 同じコードで複数ユーザーが join 可能（回数制限なし） 🔵 (境界値)
- [ ] **TC-INV-E03**: 既に Group 所属済みユーザーが同じ Group に join → ユニーク制約でエラー 🔵 *EDGE-002 で (group_id, user_id) ユニーク制約を設定するため*

---

## REQ-402: MVP 削除機能なし 🔵

**信頼性**: 🔵 *ヒアリング 2026-04-16 Q5*

### テストケース

- [ ] **TC-402-01**: MVP のマイグレーション・アプリコードに DELETE クエリが含まれていない 🔵

---

## REQ-404: 対戦相手の個人情報を保持しない 🔵

**信頼性**: 🔵 *PRD §1*

### テストケース

- [ ] **TC-404-01**: players テーブルが group_id を FK として持つ（他 Group 選手を登録できない構造） 🔵

---

## 非機能要件テスト

### NFR-001: マイグレーション適用時間 🟡

- [ ] **TC-NFR-001-01**: dev への `supabase db push` が 30 秒以内に完了 🟡
  - 測定条件: 初期マイグレーション適用時

---

## Edge ケーステスト

### EDGE-002: group_members ユニーク制約 🔵

- [ ] **TC-EDGE-002-01**: (group_id, user_id) 重複 INSERT → ユニーク制約違反 🔵 *TC-003-02 でユニーク制約を必須化*

### EDGE-003: 所属外 Group へのアクセス 🔵

- [ ] **TC-EDGE-003-01**: 未所属 Group のデータ SELECT → 空集合（TC-RLS-02 と同等） 🔵

### EDGE-102: 複数 Group 所属 🔵

- [ ] **TC-EDGE-102-01**: 1 user_id が 2 つの group_id を持つケースで両方のデータが見える 🔵

---

## テストケースサマリー

### カテゴリ別件数

| カテゴリ | 正常系 | 異常系 | 境界値 | 合計 |
|---------|--------|--------|--------|------|
| 機能要件 | 25 | 7 | 3 | 35 |
| 非機能要件 | 1 | 0 | 0 | 1 |
| Edge ケース | 1 | 1 | 1 | 3 |
| **合計** | **27** | **8** | **4** | **39** |

### 信頼性レベル分布

- 🔵 青信号: 38 件（97%）
- 🟡 黄信号: 1 件（3%）— NFR-001（マイグレーション適用時間、実測で確認）
- 🔴 赤信号: 0 件（0%）

**品質評価**: 高品質

### 優先度別

- **Must Have**: 34 件（全ケース）
- Should Have / Could Have: 0 件

---

## テスト実施計画

### Phase 1: 基盤セットアップ検証
- REQ-001, REQ-002, REQ-005
- 実施タイミング: prep.md の必須タスク完了後すぐ

### Phase 2: スキーマとマイグレーション検証
- REQ-003, REQ-004, NFR-302
- 実施タイミング: 初回マイグレーション投入後

### Phase 3: RLS と招待コード検証
- REQ-101, REQ-102, REQ-103, NFR-104, 招待コード関連
- 実施タイミング: RLS ポリシー設定後

### Phase 4: 開発者体験検証
- REQ-006, REQ-007, REQ-008, NFR-201, NFR-301
- 実施タイミング: 一通り完了後の仕上げ
