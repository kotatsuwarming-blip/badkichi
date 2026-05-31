# auth-onboarding 受け入れ基準

**作成日**: 2026-05-24
**関連要件定義**: [requirements.md](requirements.md)
**関連ユーザストーリー**: [user-stories.md](user-stories.md)
**ヒアリング記録**: [interview-record.md](interview-record.md)

**【信頼性レベル凡例】**:
- 🔵 **青信号**: PRD・ADR・data-foundation 設計文書・本セッションヒアリングを参考にした確実な基準
- 🟡 **黄信号**: 上記資料から妥当な推測
- 🔴 **赤信号**: 上記資料にない推測

**テストケース方針** (memory `feedback_test_coverage`): 最小境界値 + 分岐カバレッジのみ、冗長な正常系を増やさない。

---

## REQ-001 / REQ-002: Google OAuth ログイン + コールバック処理 🔵

**信頼性**: 🔵 *data-foundation/architecture.md §Auth フロー*

### Given (前提条件)
- Supabase Auth で Google プロバイダが有効化済
- ユーザは未認証状態 (`useSupabaseUser()` が null)

### When (実行条件)
- `/login` ページの「Google でログイン」ボタンを押す

### Then (期待結果)
- `supabase.auth.signInWithOAuth({ provider: 'google', options.redirectTo: '/confirm' })` が呼ばれる
- ブラウザが Google OAuth 承認画面に遷移する
- 承認後 `/confirm` に戻り、セッション確立完了後に Group 所属判定に基づいて遷移する

### テストケース

#### 正常系
- [ ] **TC-001-01**: 未認証 → ボタン押下 → `signInWithOAuth` が `provider: 'google'` で呼ばれる (単体テスト + mock) 🔵
- [ ] **TC-002-01**: `/confirm` 到達時、`useSupabaseUser()` が non-null + Group 未所属 → `/onboarding` 遷移 (Playwright E2E + Admin API) 🟡
- [ ] **TC-002-02**: `/confirm` 到達時、`useSupabaseUser()` が non-null + Group 所属 → `/` 遷移 (Playwright E2E) 🟡

#### 異常系
- [ ] **TC-002-E01**: `/confirm` 到達時セッション確立失敗 → `<UAlert>` 「ログインに失敗しました」 + 「再ログイン」ボタン (単体テスト) 🟡

---

## REQ-003 / REQ-004 / REQ-109: Group 作成 🔵

**信頼性**: 🔵 *data-foundation/api-endpoints.md §create_group_with_owner*

### Given
- ユーザはログイン済 + Group 未所属
- `/groups/new` ページを開いている

### When
- Group 名「○○バドミントンクラブ」を入力 → 「作成」ボタン押下

### Then
- `create_group_with_owner(p_group_name: 'oo Badminton Club')` RPC が呼ばれる
- 成功で `/` に遷移する
- `group_members` に user_id + 新規 group_id が INSERT 済

### テストケース

#### 正常系
- [ ] **TC-003-01**: Group 名 1 文字「A」→ RPC 呼出 + 成功遷移 (境界値、単体 + E2E) 🔵
- [ ] **TC-003-02**: Group 名 50 文字 (max) → RPC 呼出 + 成功遷移 (境界値、単体 + E2E) 🔵
- [ ] **TC-003-03**: Group 名 前後空白付き「  ABC  」→ trim 後 'ABC' で RPC 呼出 → 成功 (Zod transform 検証、単体) 🔵

#### 異常系
- [ ] **TC-003-E01**: Group 名 0 文字 → Zod バリデーションエラー、submit 不可、`<UFormField>` inline error (単体) 🔵
- [ ] **TC-003-E02**: Group 名 51 文字 → Zod バリデーションエラー、submit 不可 (境界値、単体) 🔵
- [ ] **TC-003-E03**: Group 名 空白のみ「   」→ Zod トリム後 0 文字判定でエラー (単体) 🔵
- [ ] **TC-003-E04**: クライアント側 Zod を bypass しても RPC 側で `invalid_group_name` 返り → `<UFormField>` inline error 表示 (REQ-109、単体 + integration) 🔵

---

## REQ-005 / REQ-106 / REQ-107 / REQ-105: 招待リンク Group 参加 🔵

**信頼性**: 🔵 *data-foundation/api-endpoints.md §join_group_with_code + ヒアリング Q2*

### Given
- ユーザはログイン済 + Group 未所属 (REQ-105 ケース除く)
- `/join/abc12345` ページを開く

### When
- ページ表示 (自動で `join_group_with_code` 呼出)

### Then (正常)
- `join_group_with_code(invite_code: 'abc12345')` RPC が呼ばれる
- 成功で `/` に遷移、`group_members` に追加済

### テストケース

#### 正常系
- [ ] **TC-005-01**: 有効な招待リンク + ログイン済 Group 未所属 → 参加成功 → `/` 遷移 (E2E、Admin API でテストユーザ + invitation 作成) 🔵

#### 異常系
- [ ] **TC-106-01**: 期限切れ招待 → `invitation_expired` 例外 → `<UAlert>` 「招待コードの有効期限が切れています」(integration、`expires_at` を過去日で seed) 🔵
- [ ] **TC-107-01**: 存在しない招待コード → `invitation_not_found` → `<UAlert>` 「招待リンクが無効です。発行者にご確認ください」(integration、ランダム code で叩く) 🔵
- [ ] **TC-105-01**: ログイン済 + 既に Group X 所属 + 別 Group Y の招待リンクを開く → `already_in_group` 例外 → `<UAlert>` 「すでに別の Group に所属しています」 (integration、テストユーザに事前 Group 所属) 🔵
- [ ] **TC-005-E01**: 招待コード長 7 文字 / 9 文字 / 特殊文字 → DB 側マッチせず `invitation_not_found` 同等扱い (境界値、EDGE-005/106、integration) 🟡

---

## REQ-006 / REQ-007 / REQ-110: 招待リンク発行 + メンバー一覧 🔵

**信頼性**: 🔵 *note.md F-AO-05 + data-foundation/api-endpoints.md §generate_invitation_code*

### Given
- ユーザはログイン済 + Group X メンバー
- `/groups/[X.id]/settings` を開いている

### When
- 「招待リンクを発行」ボタン押下

### Then
- `generate_invitation_code(target_group_id: X.id)` RPC が呼ばれる
- 返却された 8 hex 文字 code から `${origin}/join/{code}` URL が生成される
- 画面に URL + コピーボタンが表示される
- group_invitations テーブルに新規行 INSERT 済 (`expires_at = now() + 7 days`)

### テストケース

#### 正常系
- [ ] **TC-006-01**: 自 Group の設定画面 → メンバー一覧 + 既存招待リンク一覧 + 発行ボタン表示 (単体 + E2E) 🔵
- [ ] **TC-007-01**: 発行ボタン押下 → RPC 呼出 → URL 表示 (single happy path、E2E) 🔵
- [ ] **TC-007-02**: コピーボタン押下 → `navigator.clipboard.writeText` 呼出 + `<UToast>` 「コピーしました」(単体 + jsdom mock) 🟡

#### 異常系
- [ ] **TC-110-01**: 他 Group の `/groups/[Y.id]/settings` 直アクセス試行 → RPC `not_a_member` → `<UToast>` 「このグループのメンバーではありません」(integration、別 Group のテストユーザで叩く) 🔵
- [ ] **TC-007-E01**: `generate_invitation_code` が `invitation_code_collision_after_retry` 返却 → `<UToast>` + 再試行ボタン (単体 + RPC mock、EDGE-008) 🟡

---

## REQ-101 / REQ-102 / REQ-103 / REQ-104: 認証 middleware 分岐 🔵

**信頼性**: 🔵 *ヒアリング A1 + note.md §未確定論点 A-1*

### Given
- `auth.global.ts` が `/` `/groups/**` `/onboarding` 等の保護ページに適用済

### テストケース (分岐カバレッジ重視、単体テストで全分岐網羅)

#### 分岐 1: 未認証 + 保護ページアクセス
- [ ] **TC-101-01**: `useSupabaseUser()` = null + `/` 訪問 → `navigateTo('/login?redirect=/')` 🔵
- [ ] **TC-101-02**: `useSupabaseUser()` = null + `/groups/abc/settings` 訪問 → `navigateTo('/login?redirect=/groups/abc/settings')` 🔵
- [ ] **TC-108-01**: `useSupabaseUser()` = null + `/join/code123` 訪問 → `navigateTo('/login?redirect=/join/code123')` (REQ-108、EDGE-001) 🔵

#### 分岐 2: ログイン済 + Group 未所属 + 保護ページ
- [ ] **TC-102-01**: user 有 + group_members 行なし + `/` 訪問 → `navigateTo('/onboarding')` 🔵
- [ ] **TC-102-02**: user 有 + group_members 行なし + `/groups/abc/settings` 訪問 → `navigateTo('/onboarding')` 🔵

#### 分岐 3: ログイン済 + Group 所属 + 認証専用ページ
- [ ] **TC-103-01**: user 有 + group_members 行有 + `/login` 訪問 → `navigateTo('/')` 🟡
- [ ] **TC-103-02**: user 有 + group_members 行有 + `/onboarding` 訪問 → `navigateTo('/')` 🟡

#### 分岐 4: OAuth 戻り先 (`redirect` クエリ)
- [ ] **TC-104-01**: `/confirm?redirect=/join/abc` 到達 + Group 未所属 → `navigateTo('/join/abc')` (REQ-104 優先、Group 所属判定はその先で発火) 🔵
- [ ] **TC-104-02**: `/confirm` (redirect なし) 到達 + Group 所属 → `navigateTo('/')` 🔵

---

## REQ-401: 1 ユーザー = 1 Group 制約 🔵

**信頼性**: 🔵 *ヒアリング Q2 + Q2a*

### Given
- DB 制約 `group_members UNIQUE(user_id)` 適用済 (data-foundation TASK-0005 修正後)
- RPC `join_group_with_code` に `already_in_group` ガード追加済 (data-foundation TASK-0007 修正後)

### テストケース

#### 異常系 / Edge ケース
- [ ] **TC-401-01**: 同一ユーザが `/groups/new` で連続 2 回 Group 作成試行 (送信ボタン disabled で防ぐ、UI 単体) 🟡
- [ ] **TC-401-02**: 同一ユーザが「Group 作成」と「招待リンク参加」を別タブで同時試行 → 後発が `already_in_group` で拒否 (EDGE-006、integration) 🔵
- [ ] **TC-401-03**: data-foundation 統合テストで `group_members` への二重 INSERT 直接試行 → DB UNIQUE 制約違反 (`23505`) (data-foundation TASK-0014 RLS 統合テストに追加) 🔵

---

## NFR-301: 単体テスト範囲制限 🔵

**信頼性**: 🔵 *memory `feedback_test_coverage` + ヒアリング D1*

### テストケース (メタ要件、テスト計画レビューで担保)
- [ ] **TC-NFR-301-01**: テスト対象は (a) Zod スキーマ、(b) middleware 分岐、(c) composable のエラー処理 のみ。Vue コンポーネントの見た目テスト (snapshot 等) は書かれていない 🔵
- [ ] **TC-NFR-301-02**: 重複正常系テスト (同じ branch を別データで複数回) なし、境界値 + 異常系のみで分岐網羅 🔵

---

## NFR-302: E2E テスト戦略 🟡

**信頼性**: 🟡 *ヒアリング D2*

### テストケース
- [ ] **TC-NFR-302-01**: Playwright spec 内で Google OAuth 画面に遷移しない (Admin API でテストユーザ + JWT を確立し、cookie set してから保護ページに到達するヘルパーを使用) 🟡
- [ ] **TC-NFR-302-02**: `supabase.auth.signInWithOAuth` 呼び出し検証は Vitest 単体テスト + mock で行う (`/login` ページの「Google でログイン」ボタン押下後、`signInWithOAuth` が `provider: 'google'` で呼ばれることを検証) 🟡
- [ ] **TC-NFR-302-03**: E2E が CI ボット規制で Google OAuth に遮断されない (実 Google アクセスなし) 🟡

---

## NFR-304: Sentry 報告対象 🔵

**信頼性**: 🔵 *ADR-005 §D6 + cross-cutting/error-handling.md §8*

### テストケース (実装レビュー + mock 検証)
- [ ] **TC-NFR-304-01**: `INVITATION_NOT_FOUND_BY_LINK` / `INVITATION_EXPIRED` / `NOT_A_MEMBER` / `ALREADY_IN_GROUP` をスローしても `Sentry.captureException` が呼ばれない (単体、Sentry mock) 🔵
- [ ] **TC-NFR-304-02**: 未マップの SQLSTATE を投げると `useErrorMessage` の fallthrough で `Sentry.captureException` が `tags: { reason: 'unmapped_error_code' }` 付きで呼ばれる (単体、Sentry mock) 🔵
- [ ] **TC-NFR-304-03**: `error.vue` 到達時に `Sentry.captureException(props.error)` が呼ばれる (単体、Sentry mock) 🔵

---

## 境界値テスト (集約) 🔵

**信頼性**: 🔵 *REQ-004 + REQ-405 + data-foundation 仕様*

| ID | 入力 | 期待 | 信頼性 |
|---|---|---|---|
| TC-B-001 | Group 名 1 文字 | 受理 (TC-003-01 と同等) | 🔵 |
| TC-B-002 | Group 名 50 文字 | 受理 (TC-003-02 と同等) | 🔵 |
| TC-B-003 | Group 名 0 文字 (trim 後) | 拒否 (TC-003-E01 と同等) | 🔵 |
| TC-B-004 | Group 名 51 文字 | 拒否 (TC-003-E02 と同等) | 🔵 |
| TC-B-005 | 招待リンク `expires_at == now()` の瞬間 | 受理 (`<` 比較なので `==` は OK、TC-005-01 と同等) | 🟡 |
| TC-B-006 | 招待リンク `expires_at < now()` | 拒否 (TC-106-01 と同等) | 🔵 |
| TC-B-007 | 招待コード 8 hex 文字 | 受理 (TC-005-01) | 🔵 |
| TC-B-008 | 招待コード 7 文字 / 9 文字 | DB unmatch → not_found (TC-005-E01) | 🟡 |

---

## テストケースサマリー

### カテゴリ別件数

| カテゴリ | 正常系 | 異常系 | 境界値 | 合計 |
|---------|--------|--------|--------|------|
| 機能要件 (REQ-001〜007/100s/200s) | 8 | 8 | 4 | 20 |
| 非機能要件 (NFR-301/302/304) | 0 | 0 | 0 | 8 (メタ系) |
| Edge ケース (EDGE-001/006) | (REQ 内に統合) | 2 | 0 | 2 |
| 制約要件 (REQ-401) | 0 | 3 | 0 | 3 |
| **合計** | **8** | **13** | **4** | **33 + 8 メタ = 41** |

### 信頼性レベル分布

- 🔵 青信号: 28 (68%)
- 🟡 黄信号: 13 (32%) — E2E ベースのテストケース、境界値の SQL `==` 比較等で実装フェーズ確認余地
- 🔴 赤信号: 0

**品質評価**: 高品質 (テスト範囲は memory `feedback_test_coverage` に沿って最小化、🔴 ゼロ)

### 優先度別テストケース

- **Must Have** (機能要件のコア / セキュリティ): TC-001-01, TC-003-01〜04, TC-005-01, TC-006-01, TC-007-01, TC-101-01〜02, TC-102-01, TC-401-01〜03, TC-NFR-304-01〜03
- **Should Have** (異常系 / メンバー一覧): TC-002-01〜02, TC-003-E01〜04, TC-106-01, TC-107-01, TC-105-01, TC-110-01, TC-103-01〜02, TC-104-01〜02
- **Could Have** (境界値・低頻度エッジ): TC-005-E01, TC-007-E01, TC-007-02, TC-002-E01, TC-B-005, TC-B-008

---

## テスト実施計画

### Phase 1: middleware + Zod 単体テスト (Vitest)
- REQ-101〜104 分岐網羅
- Zod スキーマ境界値
- 実施タイミング: kairo-implement TASK 着手と同時 (TDD Red → Green)

### Phase 2: composable 単体テスト (Vitest + Supabase mock)
- REQ-105/106/107/109/110 のエラー分岐
- Sentry mock 検証 (NFR-304)
- 実施タイミング: composable 実装と同時 (TDD)

### Phase 3: integration / E2E テスト (Playwright + Supabase Admin API)
- REQ-005 happy path
- REQ-401 並行操作 (data-foundation TASK-0014 と協調)
- 実施タイミング: 全 UI 実装後、CI 専用 (memory `feedback_test_layer_separation`)
