# auth-onboarding 準備タスク（ユーザー作業）

> **仕様**: [requirements.md](requirements.md)
> **生成日**: 2026-05-24
> **データ基盤側 prep との関係**: data-foundation の Google OAuth 設定 / Supabase プロジェクト作成 / `.env.*` 等は [data-foundation/prep.md](../data-foundation/prep.md) で完了済前提。本書には auth-onboarding 着手で **追加で必要になる項目** のみを記載する。

**【信頼性レベル凡例】**:
- 🔵 **青信号**: 要件定義書・設計文書・ユーザヒアリングで明確に必要と判明したタスク
- 🟡 **黄信号**: 要件定義書・設計文書から妥当に推測されるタスク
- 🔴 **赤信号**: 推測による予防的タスク

---

## 必須（実装開始前に完了が必要）

### 1. ADR-006「1 ユーザー = 1 Group MVP」起票 🔵 *ヒアリング Q2*

- [ ] `docs/decisions/006-single-group-per-user-mvp.md` を起票する
- 内容: PRD §1 (1ユーザーは複数のグループに所属可能) を MVP では「1 ユーザー = 1 Group」に上書きする経緯、DB 制約 (UNIQUE) + RPC 二重ガード方式、将来複数 Group 対応への拡張余地
- 関連要件: REQ-401
- 関連 memory: `project_single_group_per_user`

### 2. data-foundation の修正反映 🔵 *ヒアリング Q2a*

別セッションで進行中の data-foundation 修正と協調する必要がある。

- [ ] **TASK-0005 migration**: `group_members` に `UNIQUE (user_id)` 制約追加 (追記 migration ファイル)
- [ ] **TASK-0007 RPC `join_group_with_code`**: `already_in_group` 例外を追加
- [ ] **TASK-0014 RLS 統合テスト**: `ALREADY_IN_GROUP` 制約テスト追加
- [ ] dev DB 再適用 (`pnpm db:push` + `pnpm db:types`)
- 関連要件: REQ-401, REQ-105
- 関連メモリ: `project_mvp_revised_scope` (Phase 1-3 + TASK-0013 完了済の状態)

### 3. Sentry プロジェクト作成 + DSN 取得 🔵 *ADR-005 §D6 + NFR-304*

- [ ] https://sentry.io でアカウント作成 (個人 / 組織)
- [ ] プロジェクト作成 (Platform: `Nuxt`)
- [ ] DSN を控える (Project Settings → Client Keys (DSN))
- [ ] `.env.development` および `.env.production` に追記 (gitignored):
  ```
  NUXT_PUBLIC_SENTRY_DSN=https://xxx@sentry.io/yyy
  NUXT_PUBLIC_ENV=development  # production の場合は production
  ```
- [ ] GitHub Actions Secrets に `SENTRY_AUTH_TOKEN` を登録 (source map upload 用)
- 関連要件: NFR-304
- 関連文書: [cross-cutting/error-handling.md §8.3](../../design/cross-cutting/error-handling.md)

### 4. error-codes.ts に ALREADY_IN_GROUP 追加 🔵 *REQ-105 + REQ-407*

- [ ] `app/types/error-codes.ts` の `APP_ERROR_CODES` に追加:
  ```ts
  ALREADY_IN_GROUP: 'already_in_group',
  ```
- [ ] `locales/ja.json` の `errors.already_in_group` に文言追加:
  ```json
  "already_in_group": "すでに別の Group に所属しています。MVP では 1 ユーザー = 1 Group のみ対応です"
  ```
- [ ] `locales/en.json` に空文字キー追加 (ハコ維持)
- [ ] `useErrorMessage` composable の switch に分岐追加
- 関連要件: REQ-105, REQ-407, NFR-204
- 関連文書: [cross-cutting/error-handling.md §4.2 識別子追加手順](../../design/cross-cutting/error-handling.md)

---

## 推奨（実装中に用意できればOK）

### 5. 本番ドメイン取得 🟡 *data-foundation prep §7 と重複*

- [ ] 本番デプロイ先ドメインを決める (例: Vercel 自動ドメイン or 独自ドメイン)
- [ ] 取得後、Google OAuth の redirect URI と Supabase prd の Site URL に追記 (data-foundation prep §3, §4 で対応)
- [ ] 招待リンク URL は `${useRequestURL().origin}/join/{code}` 形式のため、本番ドメイン確定で URL が確定する
- 必要になるフェーズ: MVP リリース前 (kairo-design の招待 UI 詳細化までは後回し可)
- 関連要件: REQ-408

### 6. i18n キー整合性チェック CI スクリプト 🟡 *NFR-303*

- [ ] `scripts/check-i18n-keys.ts` (or 既存スクリプトに統合) を作成し、`locales/ja.json` と `locales/en.json` のキー構造一致を検証
- [ ] pre-commit + GitHub Actions の両方に組込 (memory `feedback_dedicated_linter_cli`)
- 必要になるフェーズ: kairo-implement の i18n 設定タスクと同時
- 関連要件: NFR-303

---

## 確認事項（判断が必要）

### 7. 既存招待リンク UI に「使用回数表示」を含めるか 🟡 *REQ-301*

- [ ] Group 設定画面の招待リンク一覧で「何人が使用したか」(group_members.created_at から逆引き集計) を表示するか
- 影響: 集計 SQL or RPC 追加、UI 表示行追加
- MVP では除外 (シンプルさ優先) を推奨
- 関連要件: REQ-301

### 8. Sentry の有料プラン移行タイミング 🔴

- [ ] Free プランの制限 (5K events/month) を超える見込みか
- [ ] チームサイズ・利用頻度から判断
- 関連要件: NFR-304

---

## サマリー

| 優先度 | 件数 | 🔵 | 🟡 | 🔴 |
|--------|------|-----|-----|-----|
| 必須 | 4 | 4 | 0 | 0 |
| 推奨 | 2 | 0 | 2 | 0 |
| 確認事項 | 2 | 0 | 1 | 1 |

## 関連文書

- **要件定義書**: [requirements.md](requirements.md)
- **ヒアリング記録**: [interview-record.md](interview-record.md)
- **data-foundation 準備タスク**: [../data-foundation/prep.md](../data-foundation/prep.md) (Google OAuth / Supabase / 環境変数 は本書ではなくこちら)
- **ADR-005 エラーハンドリング戦略**: [../../decisions/005-error-handling-strategy.md](../../decisions/005-error-handling-strategy.md) (Sentry 導入根拠)
- **エラーハンドリング実装規約**: [../../design/cross-cutting/error-handling.md](../../design/cross-cutting/error-handling.md) (Sentry 設定手順 §8)
