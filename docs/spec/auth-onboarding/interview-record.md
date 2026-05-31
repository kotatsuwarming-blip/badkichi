# auth-onboarding ヒアリング記録

**作成日**: 2026-05-24
**ヒアリング方式**: step4 既存情報ベースの差分ヒアリング（PRD + ADR + data-foundation 設計文書 + note.md を起点）

## ヒアリング目的

`docs/spec/auth-onboarding/note.md` で抽出された未確定論点 14 個（A〜E カテゴリ）について、
data-foundation の確定事項と PRD の整合を取りつつ、auth-onboarding 単位の要件を明確化する。
重要決定 (UX / セキュリティ / アーキテクチャ波及) はユーザに確認し、それ以外は Claude 主導で
pros/cons を提示しつつ要件定義書に仮決定として記載する方針 (memory: `feedback_claude_lead_with_pros_cons`)。

---

## 質問と回答

### Q1: 作業規模 🔵

**質問日時**: 2026-05-24
**カテゴリ**: 全体スコープ
**背景**: kairo-requirements の出力範囲を決定するため

**質問**: auth-onboarding 要件定義の作業規模はどちらにするか
**選択肢**:
- フル機能開発（推奨）: EARS 記法、ユーザストーリー、受け入れ基準、非機能要件・エッジケース網羅
- 軽量開発: 主要機能要件 3-5 項目と基本受け入れ基準のみ
- カスタム

**回答**: フル機能開発（推奨）

**信頼性への影響**: 出力ファイル群 (requirements / user-stories / acceptance-criteria / interview-record / prep) の完成度を全面 🔵 で揃える方針が確定

---

### Q2: 複数 Group 所属時の active Group 保持方式 🔵

**質問日時**: 2026-05-24
**カテゴリ**: アーキテクチャ波及 (note.md 論点 #5、PRD §1 マルチテナント設計に関連)
**背景**: note.md #5 は active Group の保持方式 (URL parameter / Cookie / Pinia+localStorage) を問う論点。
全画面のルーティングと API 呼び出しに影響、後続 UI 単位 (player-management 以降) にも波及する重要決定。
Claude は URL parameter (`/g/[group_id]/...` 配下) パターンを推奨として pros/cons を提示。

**回答**: **「1 ユーザー = 1 Group」方針に転換**したい。複数 Group 所属は MVP では認めない。

**信頼性への影響 (重大)**:
- PRD §1「1ユーザーは複数のグループに所属可能」を上書きする方針転換 → ADR-006 起票推奨
- note.md 論点 #4 (Group 切替 UI の場所) **削除** (機能自体が不要化)
- note.md 論点 #5 (active Group の保持方式) **削除** (`group_members` から user の唯一の Group を引けばよい)
- URL 構造は `/g/[group_id]/...` 配下にする必要なし、`/players` `/matches/[id]` 等クリーンに保てる
- 認証 middleware は「Group 未所属 → /onboarding」のみで完結 (切替分岐なし)
- `join_group_with_code` RPC に「すでに Group 所属」エラー (`ALREADY_IN_GROUP`) 追加が必要
- data-foundation の `group_members` スキーマに `UNIQUE (user_id)` 追加が必要 (別セッション TASK-0014 と要協調)

要件側で **REQ-401 (1 ユーザー = 1 Group 制約)** として明示し、影響範囲を全要件に波及させる。

---

### Q2a: 制約強制方式（Q2 のフォローアップ）🔵

**質問日時**: 2026-05-24
**カテゴリ**: アーキテクチャ波及
**背景**: 「1 ユーザー = 1 Group」を DB 制約で強制するか、アプリ層 (RPC + UI) でのみガードするか

**選択肢**:
- DB 制約 + RPC で二重ガード (推奨): `group_members UNIQUE(user_id)` + RPC `already_in_group` 例外
- App 層のみ: RPC チェック + UI 表示のみ、`UNIQUE` は加えない (将来複数 Group 対応への拡張容易)

**回答**: DB 制約 + RPC で二重ガード

**信頼性への影響**:
- data-foundation 修正範囲確定:
  - TASK-0005 migration: `group_members` に `UNIQUE (user_id)` 制約追加
  - TASK-0007 RPC `join_group_with_code`: `already_in_group` 例外を追加
  - 型再生成 (`pnpm db:types`)
- `app/types/error-codes.ts` に `ALREADY_IN_GROUP: 'already_in_group'` 追加
- `locales/ja.json` に `errors.already_in_group` 追加
- 既存 dev DB へのリセット必要 (`pnpm db:reset`)
- 別セッション進行中の TASK-0014 (RLS 統合テスト) に「ALREADY_IN_GROUP テスト」を追加する協調が必要

---

### Q3: 招待リンクの方式（multi-use / single-use）🔵

**質問日時**: 2026-05-24
**カテゴリ**: 設計の根幹 (note.md 論点 #8 (招待リンク無効化) の前提として確認すべき論点であり、本来 #8 より先行すべき)
**背景**: data-foundation の `join_group_with_code` RPC は「期限内なら何人でも参加可能」の multi-use 方式で実装済。
ユーザの「招待をどこまでコントロールできるか」「同じリンクで何人も加入するか、1 回ごとの使い捨てか」という
問いを受け、招待リンクの基本方式を確認。

**選択肢**:
- 共有リンク (multi-use, 推奨): 1 リンクで期限内複数人参加可、Slack/Notion 標準パターン
- 1 回使い捨て (single-use): 1 リンク = 1 人、GitHub Org 招待型
- 両対応 (発行時選択)

**回答**: 共有リンク (multi-use, 推奨)。**削除 (無効化) は Phase 2** に回す。

**信頼性への影響**:
- data-foundation 既存実装と完全整合、変更コストゼロ
- note.md 論点 #8 (招待リンク無効化) **Phase 2 確定** → MVP では Group 設定画面に無効化ボタンなし
- note.md 論点 #9 (招待リンクの有効期限) **固定 7 日確定** (data-foundation 設計通り、UI 選択不可)
- note.md 論点 #6 (招待リンク UI) **URL コピーボタンのみ** に絞れる (QR コードも Phase 2)
- Group 設定画面の MVP スコープ確定:
  - 招待リンク発行ボタン
  - 既存招待リンク一覧表示 (発行日 / 期限 / 状態)
  - URL コピーボタン
  - メンバー一覧表示 (read only)
- 漏洩時の対応指針 (UI 文言): 「招待リンクは 7 日間有効です。漏洩時は期限切れまでお待ちください」を明記

---

## Claude 主導の仮決定 (ユーザ確認スキップ、要件定義書に反映)

memory `feedback_claude_lead_with_pros_cons` に従い、影響範囲が auth-onboarding 内に閉じ
かつ業界標準パターンが明確な論点は Claude 仮決定で進める。

### A. 動線・遷移系

#### A1: `/onboarding` 強制リダイレクトの実装方式 🟡
- **仮決定**: 単一 auth middleware で兼用
- **理由**: 認証ロジックを 1 箇所に集約、middleware の競合・実行順問題を回避
- **実装**: `app/middleware/auth.global.ts` で「未ログイン → /login」「ログイン済+Group未所属 → /onboarding」「ログイン済+Group所属 → 通常表示」を 1 つで判断
- **再検討余地**: 認証 middleware が複雑化する場合、kairo-design で `groupRequired.ts` に分割可

#### A2: OAuth リダイレクト戻り先制御 🟡
- **仮決定**: `redirect` クエリパラメータを `/login` → `/confirm` まで運ぶ
- **理由**: ステートレス、新規タブ対応、リフレッシュ耐性、localStorage 経由より single source of truth
- **実装**: `/login?redirect=/join/abc123` → Supabase signInWithOAuth の `options.redirectTo` に
  `/confirm?redirect=/join/abc123` を渡し、`/confirm` で `route.query.redirect` を読んで遷移

#### A3: 初回ログイン判定 🔵
- **仮決定**: `group_members` の有無のみで判定
- **理由**: Supabase Auth の `last_sign_in_at` に依存しない、シンプル
- **実装**: middleware で `useSupabaseClient().from('group_members').select('group_id').eq('user_id', user.id).maybeSingle()` → 行なし = /onboarding

### B. UI 構造系

#### B1: Group 切替 UI 🔵 (Q2 で消滅)
- **仮決定**: **不要** (1 ユーザー = 1 Group 制約)

#### B2: active Group 保持方式 🔵 (Q2 で消滅)
- **仮決定**: **不要** (`group_members` から user の唯一の Group を引く composable `useCurrentGroup()` を 1 つ用意)

#### B3: 招待リンク UI 🔵 (Q3 で確定)
- **仮決定**: URL コピーボタンのみ。QR コードは Phase 2

### C. Group 設定の MVP 範囲

#### C1: 自分の退会機能 🔵
- **仮決定**: MVP 外 (PRD §3.2「削除機能は将来」+ memory `project_mvp_revised_scope`)

#### C2: 招待リンク無効化 🔵 (Q3 で確定)
- **仮決定**: Phase 2

#### C3: 招待リンク有効期限 🔵 (Q3 で確定)
- **仮決定**: 固定 7 日 (data-foundation 設計通り、UI 選択不可)

### D. テスト戦略

#### D1: コンポーネント単体テスト範囲 🔵
- **仮決定**: フォームバリデーション + 主要遷移のみ
- **理由**: memory `feedback_test_coverage` 「最小境界値 + 分岐カバレッジ、冗長なし」
- **対象**: Zod スキーマ (Group 名 1-50 文字)、middleware 分岐、composable のエラー処理

#### D2: E2E テスト戦略 🟡
- **仮決定**: Supabase Admin API でテストユーザ作成 + Playwright で **ログイン後** の画面遷移を検証。Google OAuth フロー自体は単体テストで `signInWithOAuth` 呼び出し検証のみ
- **理由**: Google OAuth の実環境テストは CI ボット規制リスクあり、メンテコスト過大。data-foundation TASK-0013 で Admin API 経由のテストユーザ作成スクリプトが既に存在
- **再検討余地**: kairo-design で E2E シナリオを詳細化する際に確認

#### D3: i18n キー整合性チェック 🔵
- **仮決定**: 自動化 (簡易スクリプト + CI 組込)
- **理由**: `ja.json` / `en.json` のキー構造ずれを早期検出、memory `feedback_dedicated_linter_cli` に沿って専用スクリプトで実装

### E. 細部

#### E1: Sentry 報告粒度 🔵
- **仮決定**: ユーザ操作起因の想定エラー (`INVITATION_NOT_FOUND_BY_LINK` / `INVITATION_EXPIRED` / `NOT_A_MEMBER` / `ALREADY_IN_GROUP`) は Sentry に送らない。`unmapped_error_code` の fallthrough と `error.vue` のみ送る
- **理由**: ADR-005 §D6 + cross-cutting/error-handling §8 で確定済の方針 (誤検知ノイズ排除)

#### E2: ローディング表示 🟡
- **仮決定**: Nuxt UI `<USkeleton>` / `<UIcon name="i-heroicons-arrow-path" class="animate-spin"/>` で共通化
- **理由**: Nuxt UI v4 標準パターン、独自 CSS 実装の防止
- **対象**: `/confirm` 中のセッション確立中、Group 作成中、招待参加処理中

---

## ヒアリング結果サマリー

### 確認できた事項
1. 作業規模: フル機能開発
2. **1 ユーザー = 1 Group 制約** (PRD §1 上書き、ADR-006 候補)
3. 制約強制方式: DB UNIQUE + RPC 二重ガード
4. 招待リンク: multi-use 共有リンク
5. 削除機能 (退会・無効化) は Phase 2
6. 招待リンク有効期限: 固定 7 日
7. Group 切替 UI / active Group 保持方式: 不要化
8. middleware 方式: 単一 auth middleware で兼用
9. OAuth リダイレクト戻り先: `redirect` クエリパラメータ方式
10. E2E テスト: Supabase Admin API + Playwright (Google OAuth は単体テスト mock)

### 追加 / 変更要件
- REQ-401 (新規): 1 ユーザーは 1 Group のみ所属可能
- REQ-105 (新規): 既に Group 所属ユーザが招待リンクで参加しようとした場合 ALREADY_IN_GROUP エラー
- `app/types/error-codes.ts` に `ALREADY_IN_GROUP` 識別子追加
- data-foundation 修正: TASK-0005 (migration UNIQUE) + TASK-0007 (RPC `already_in_group`)
- ADR-006 (1 ユーザー = 1 Group MVP) 起票推奨

### 残課題
- ADR-006 (1 ユーザー = 1 Group MVP) を auth-onboarding 着手前に書く必要あり
- data-foundation 別セッション TASK-0014 と「ALREADY_IN_GROUP 制約テスト」追加の協調
- 本番ドメイン取得タイミング (data-foundation prep §7 と重複、招待リンク URL 確定に必要)
- Sentry プロジェクト作成 / DSN 取得 → auth-onboarding 固有 prep に記載

### 信頼性レベル分布

**ヒアリング前 (note.md 時点)**:
- 🔵 青信号: 0 (note.md は未確定論点リストで信頼性レベル未付与)
- 🟡 黄信号: 14 (未確定論点)
- 🔴 赤信号: 0

**ヒアリング後 (本セッション)**:
- 🔵 青信号: 11 (Q1/Q2/Q2a/Q3 + Claude 仮決定のうち根拠明確な 7 件)
- 🟡 黄信号: 4 (実装方式・E2E 詳細・ローディング UI 等の実装フェーズ確認余地あり)
- 🔴 赤信号: 0

**品質評価**: 高品質 (重要決定は全てユーザ合意またはエコシステム標準準拠で根拠あり)

## 関連文書

- **要件定義書**: [requirements.md](requirements.md)
- **ユーザストーリー**: [user-stories.md](user-stories.md)
- **受け入れ基準**: [acceptance-criteria.md](acceptance-criteria.md)
- **コンテキストノート**: [note.md](note.md)
- **準備タスク**: [prep.md](prep.md)
- **PRD**: [.dcs/20260328153038_badminton_analytics/prd.md](../../../.dcs/20260328153038_badminton_analytics/prd.md)
- **ADR-004 auth-onboarding 単位の追加**: [../../decisions/004-add-auth-onboarding-unit.md](../../decisions/004-add-auth-onboarding-unit.md)
- **ADR-005 エラーハンドリング戦略**: [../../decisions/005-error-handling-strategy.md](../../decisions/005-error-handling-strategy.md)
- **ADR-006 (予定) 1 ユーザー = 1 Group MVP**: 未起票
- **エラーハンドリング実装規約**: [../../design/cross-cutting/error-handling.md](../../design/cross-cutting/error-handling.md)
- **data-foundation API endpoints**: [../../design/data-foundation/api-endpoints.md](../../design/data-foundation/api-endpoints.md)
