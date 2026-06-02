# TDD要件定義書: グループ設定画面 (`/groups/[id]/settings`)

- **機能名**: グループ設定画面 (group-settings-page)
- **タスクID**: TASK-0019
- **要件名**: auth-onboarding
- **出力ファイル**: `docs/implements/auth-onboarding/TASK-0019/group-settings-page-requirements.md`
- **作成日**: 2026-06-01

---

## 0. 本タスクの TDD スコープ宣言 (最重要)

本タスクは **UI 結線 (page) タスク**であり、テスト方針は「最小の境界値 + 分岐網羅のみ」(`feedback_test_coverage.md`)、かつ **UI 見た目テストは書かない** (NFR-301)。
vitest は **mock-unit 限定** (integration は本タスク対象外、`feedback_test_layer_separation.md`)。

**page 固有で未検証のロジック = テスト候補**は以下の 1 点のみ:

- 🔵 **招待状態の派生算出 (`expires_at < now()`)** … DB に status 列が無いため page 側が「有効 / 期限切れ」を算出する純粋ロジック。**純関数に切り出して mock-unit テスト候補**とする (有効 / 期限切れ / 境界 `expires_at == now()` = EDGE-107)。

**逆に、テストを書かない (= 依存層で検証済 or 見た目)**:

- 🔵 招待一覧表示 (`useListInvitations`) … TASK-0012 のテストで検証済 → page は**結線のみ**。
- 🔵 招待コード生成 (`useGenerateInvitation.generate` の成功 / `not_a_member` / `invitation_code_collision_after_retry` 分岐、内部 `refresh()` 呼び出し) … TASK-0012 のテストで検証済 → page は**結線のみ**。
- 🟡 メンバー一覧 SELECT … 取得は composable へ委譲。クエリ自体の検証は composable 側 / RLS は data-foundation integration test (ADR-012) で済。page では見た目テストを書かない。
- 🔵 URL 組立・コピー toast・ローディング・モバイル表示 … 見た目 / ブラウザ API 結線のため NFR-301 によりテストを書かない (検証配置は §3, §4 参照)。

---

## 1. 機能の概要（EARS要件定義書・設計文書ベース）

- 🔵 **何をする機能か**: 自分が所属するグループの設定画面。(a) 招待リンク一覧の表示、(b) 招待リンクの新規発行 + 共有 URL のコピー、(c) メンバー一覧の閲覧 (read only) を 1 画面で提供する。
- 🔵 **解決する問題**: グループ管理者/メンバーが、新しいメンバーを招待するためのリンクを発行・共有でき、既存メンバーと既発行リンクの状態を一望できる。
- 🔵 **想定ユーザー**: 該当グループに所属する認証済ユーザー (未認証は `/login`、未所属は `/onboarding` へ middleware がリダイレクト)。
- 🔵 **システム内での位置づけ**: Phase 3 UI 層の page。ドメインロジックは composable 層 (TASK-0012) に委譲し、page は **結線 + page 固有の表示派生 (状態算出 / URL 組立) のみ**を担う (ADR-005 D1 / REQ-406)。layout は無指定で `default.vue` を継承 (ADR-011 D1)。
- **参照したEARS要件**: REQ-006 (メンバー一覧 read only), REQ-007 (招待リンク発行/共有), REQ-110 (not_a_member 通知), REQ-408 (URL 組立)
- **参照した設計文書**: `docs/design/auth-onboarding/architecture.md` §フロントエンド / §既存 API の利用マッピング、`docs/design/auth-onboarding/dataflow.md` §5

---

## 2. 入力・出力の仕様（EARS機能要件・TypeScript型定義ベース）

### 入力

- 🔵 **route params `id`** (string, グループ UUID): `useRoute().params.id`。一覧取得・発行・メンバー取得のキーに使用。
- 🔵 **発行ボタン押下** (ユーザ操作): 引数なしトリガー → `useGenerateInvitation().generate(id)`。
- 🔵 **コピーボタン押下** (ユーザ操作): 対象行の組立済 URL を引数にクリップボードへ書き込み。

### 出力

- 🔵 **招待リンク一覧**: `Invitation[]` (`useListInvitations`)。各要素は `Pick<group_invitations.Row, 'id' | 'code' | 'created_at' | 'expires_at'>`。
  - 表示列: 発行日 (`created_at`)、期限 (`expires_at`)、**状態** (派生)、共有 URL (派生)。
- 🔵 **招待状態 (派生出力)**: `'active' | 'expired'`。算出規則 `expires_at < now() → 'expired'`、それ以外 `'active'`。境界 `expires_at == now()` は**有効ではなく期限切れに含めない**= `<` 比較なので `==` は `'active'` (EDGE-107 の境界定義を `<` の厳密未満で確定)。
  - ※ EDGE-107 境界の解釈は §4 で厳密化。テストはこの規則を固定する。
- 🔵 **共有 URL (派生出力)**: `${useRequestURL().origin}/join/${code}` (REQ-408)。`code` は RPC 返却の 8 hex。
- 🔵 **発行結果**: `ActionResult<string>` = `{ data: code | null, error }` (composable 返却)。page は `error === null` のとき URL 組立可、エラー時は composable 内 toast に委譲。
- 🟡 **メンバー一覧**: `{ displayName: string; avatarUrl?: string }[]` 相当 (read only)。表示名/avatar の取得元は実装時クエリ確定 (§3 制約参照)。

- **参照したEARS要件**: REQ-006, REQ-007, REQ-408
- **参照した設計文書**: `app/composables/useListInvitations.ts` (Invitation 型 / select 列)、`app/composables/useGenerateInvitation.ts` (ActionResult)、`docs/design/auth-onboarding/dataflow.md` §5

---

## 3. 制約条件（EARS非機能要件・アーキテクチャ設計ベース）

- 🔵 **テスト制約 (最重要)**: page 見た目テストは書かない (NFR-301)。書くのは `expires_at < now()` 派生の純関数の最小テストのみ。vitest mock-unit 限定。
- 🔵 **アーキテクチャ制約**: page から `supabase.from(...)` / `supabase.rpc(...)` を直接呼ばない。**取得・生成・メンバー取得すべて composable 経由** (REQ-406, ADR-005 D1, ADR-007 D2 「1 ユースケース = 1 composable」)。
- 🔵 **状態管理制約**: `useAsyncData` / `useState` のみ (Pinia 不採用, ADR-010 D7)。一覧は `useAsyncData('invitations-list:' + id)` の共有キーで、発行成功時の `refresh()` のみ再フェッチ (NFR-002 / ADR-008 D4)。
- 🔵 **文言制約**: 全 UI 文言は i18n 経由 (`const { t } = useI18n()`、NFR-204)。コード内文字列リテラル禁止。既存キー確認済 (`groups.settings.title/membersTitle/invitationsTitle/generateInvitation/invitationGenerated`、`errors.not_a_member`、`errors.invitation_code_collision_after_retry`)。**不足キー: コピー完了 toast 文言** (例 `groups.settings.urlCopied`) と必要なら状態ラベル (`groups.settings.statusActive/statusExpired`) を実装時に追加。
- 🔵 **SSR 制約 (URL 組立)**: host は `useRequestURL().origin` で取得 (`window.location` 直参照禁止、REQ-408 / architecture.md §既存 API マッピング)。
- 🔵 **コピー完了通知制約**: `useToast().add({...})` で「コピーしました」を **2 秒**表示 (NFR-203)。
- 🔵 **ローディング制約**: `pending=true` 中は `<USkeleton>` 表示・発行ボタン disabled (NFR-202, EDGE-003 二重送信防止)。
- 🔵 **レイアウト制約**: `definePageMeta({ layout })` を指定せず `default.vue` を自動継承 (ADR-011 D1)。
- 🔵 **認可制約**: 該当グループのメンバーのみアクセス可。middleware (未認証→`/login`、未所属→`/onboarding`) + RLS の二重ガード。RLS で他グループの invitations/members は不可視 (data-foundation 実装済)。
- 🔵 **DB 制約**: `group_invitations` に **status 列なし** → 状態は派生算出必須。論理削除前提で `deleted_at is null` フィルタ (composable 側で適用済)。有効期限は固定 7 日 (REQ-405, RPC 設定)。
- 🟡 **メンバー一覧取得制約 (実装時確定)**: `group_members` (user_id / group_id / created_at) を起点に、他メンバーの表示名 (`full_name`/`name`/`email` フォールバック) と avatar (`avatar_url`) を取得する。**他メンバーの identity/metadata をクライアントから取得できるか否かは Supabase の identity 公開範囲と RLS に依存**するため、SELECT/結合方法を実装時に確定する。取得は必ず domain composable 経由 (REQ-406)。要件として満たすべきは「(1) `group_members` で当該グループのメンバー集合を取得、(2) 各メンバーの表示名 + avatar を read only で表示、(3) page から直 supabase を叩かず composable に隠蔽する」の 3 点。

- **参照したEARS要件**: NFR-202, NFR-203, NFR-204, NFR-301, REQ-405, REQ-406, REQ-408
- **参照した設計文書**: `docs/design/auth-onboarding/architecture.md` §アーキテクチャパターン、`docs/design/cross-cutting/error-handling.md` §6、ADR-005/007/008/010/011

---

## 4. 想定される使用例（EARS Edgeケース・データフローベース）

### 基本フロー (dataflow.md §5)

1. 🔵 ページ遷移 → `useListInvitations(id)` で一覧取得 (pending 中 Skeleton)。並行してメンバー一覧取得 (🟡)。
2. 🔵 「招待リンクを発行」押下 → `useGenerateInvitation().generate(id)` (pending=true、ボタン disabled)。
3. 🔵 成功 → composable 内で `useListInvitations(id).refresh()` が走り一覧自動更新 + 成功 toast `invitationGenerated`。page は返却 code から `${origin}/join/${code}` を組み立て表示。
4. 🔵 行のコピーボタン → クリップボードへ URL 書込 → toast「コピーしました」2 秒。

### エッジ / エラーケース

- 🔵 **状態派生境界 (EDGE-107)**: 派生関数 `deriveInvitationStatus(expiresAt, now)`。
  - `expires_at > now` → `'active'` (有効)
  - `expires_at < now` → `'expired'` (期限切れ)
  - `expires_at == now` → `<` 比較のため **`'active'`** に分類 (厳密未満で期限切れ判定する確定仕様)。
  - → **これが唯一のテスト候補** (有効 / 期限切れ / 境界 == の 3 ケース最小)。
- 🔵 **not_a_member (REQ-110)**: `generate` が `not_a_member` を返す → composable 内 `useToastErrors.showError()` が一過性 toast 表示 (error-handling.md §6.3 #5)。page は分岐検証不要 (TASK-0012 で検証済)。
- 🔵 **invitation_code_collision_after_retry (EDGE-008)**: composable が toast 表示。page は再試行ボタン (= 再度 `generate` を呼ぶ) を提供。
- 🔵 **空一覧**: `Invitation[]` が空のとき空状態を表示 (見た目、テスト対象外)。
- 🔵 **pending 中の二重発行**: ボタン disabled でガード (EDGE-003、見た目/結線)。

- **参照したEARS要件**: REQ-007, REQ-110, EDGE-008, EDGE-107, EDGE-003
- **参照した設計文書**: `docs/design/auth-onboarding/dataflow.md` §5、`docs/design/cross-cutting/error-handling.md` §6.3

---

## 5. EARS要件・設計文書との対応関係

- **参照したユーザストーリー**: グループ管理者がメンバーを招待リンクで招く / メンバーが所属グループの構成を確認する
- **参照した機能要件**: REQ-006, REQ-007, REQ-110, REQ-405, REQ-406, REQ-408
- **参照した非機能要件**: NFR-002, NFR-202, NFR-203, NFR-204, NFR-301
- **参照したEdgeケース**: EDGE-003 (二重送信), EDGE-008 (コード衝突再試行), EDGE-107 (`expires_at == now()` 境界)
- **参照した受け入れ基準**: TASK-0019 完了条件 (一覧表示 / 発行→URL組立→refresh / コピー toast / メンバー read only / not_a_member toast / locales / default 継承)
- **参照した設計文書**:
  - **アーキテクチャ**: `docs/design/auth-onboarding/architecture.md` §フロントエンド / §既存 API の利用マッピング / §アーキテクチャパターン
  - **データフロー**: `docs/design/auth-onboarding/dataflow.md` §5 (招待リンク発行 D5-4 refresh)
  - **型定義**: `app/composables/useListInvitations.ts` (Invitation 型), `app/composables/useGenerateInvitation.ts` (ActionResult / UseGenerateInvitationReturn)
  - **データベース**: `group_invitations` (status 列なし / `deleted_at` 論理削除), `group_members` (user_id/group_id/created_at)
  - **エラー規約**: `docs/design/cross-cutting/error-handling.md` §6, `app/types/error-codes.ts` (APP_ERROR_CODES)
  - **ADR**: ADR-005 D1/D2, ADR-007 D2, ADR-008 D4, ADR-010 D7, ADR-011 D1, ADR-012 D4

---

## 6. テスト対象範囲のまとめ (tdd-testcases への引き継ぎ)

| 対象 | 検証配置 | 本タスクで mock-unit テストを書くか |
|---|---|---|
| 招待一覧取得 (`useListInvitations`) | TASK-0012 で検証済 | ✕ (結線のみ) |
| 招待生成分岐 (成功 / not_a_member / collision) + 内部 refresh | TASK-0012 で検証済 | ✕ (結線のみ) |
| メンバー一覧 SELECT / RLS | composable 側 + data-foundation integration (ADR-012) | ✕ (page 見た目テスト書かない、NFR-301) |
| **状態派生 `expires_at < now()`** (純関数) | **本 page 固有・未検証** | **○ 有効 / 期限切れ / 境界 `==` の最小 3 ケース (EDGE-107)** |
| URL 組立 (`useRequestURL().origin`) | 見た目/SSR 結線 | ✕ (NFR-301。純関数化するなら任意。基本は書かない) |
| コピー toast / ローディング / モバイル | 見た目 | ✕ (NFR-301) |

**結論**: 本タスクで新規に書く mock-unit テストは **状態派生純関数の最小 3 ケースのみ**。URL 組立は `useRequestURL()` のブラウザ/SSR API 結線が支配的なため純関数化の必然性は低く、原則テストを書かない (組立規則を純関数に切り出した場合に限り任意で 1 ケース)。

---

## 品質判定

```
✅ 高品質:
- 要件の曖昧さ: ほぼなし (メンバー一覧 SELECT のみ 🟡 実装時確定、ただし「満たすべき 3 点」を明確化済)
- 入出力定義: 完全 (Invitation 型 / ActionResult / 派生出力を確定)
- 制約条件: 明確 (テスト方針・composable 経由・SSR URL・locales・RLS)
- 実装可能性: 確実 (依存 composable は TASK-0012 で実装済)
- 信頼性レベル: 🔵 多数 / 🟡 はメンバー一覧 SELECT のみ
```

- **信頼性分布**: 🔵 約 90% / 🟡 約 10% (メンバー一覧取得クエリ) / 🔴 0%
- **判定**: 高品質
