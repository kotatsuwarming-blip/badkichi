# TASK-0012 要件定義書: useGenerateInvitation + useListInvitations

**機能名**: 招待リンク 一覧表示 (Read) + 発行 (Write RPC) composable
**タスクID**: TASK-0012
**要件名**: auth-onboarding
**出力ファイル**: `docs/implements/auth-onboarding/TASK-0012/auth-onboarding-requirements.md`
**フェーズ**: Phase 2 - ドメインロジック層
**作成日**: 2026-06-01

---

## 1. 機能の概要（EARS要件定義書・設計文書ベース）

- 🔵 **何をする機能か**: グループの招待リンクを「一覧表示する」(Read) `useListInvitations` と、「新規発行する」(Write RPC) `useGenerateInvitation` の 2 本の composable を提供する。前者は `group_invitations` テーブルを論理削除除外で SELECT し、後者は RPC `generate_invitation_code` を呼んで成功時に一覧を自動更新する。
- 🔵 **どのような問題を解決するか**: グループ管理者が、新規メンバーを招くための招待リンク (8 hex コード) を発行・確認できるようにする。発行直後に一覧へ即時反映 (同一キー refresh) させることで、UI が手動再読込なしに最新状態を表示できる。
- 🔵 **想定されるユーザー**: グループに所属するメンバー (REQ-110 によりメンバーでないユーザーは発行不可)。実際の利用画面はグループ設定ページ (`/groups/[id]/settings.vue`, TASK-0019)。
- 🔵 **システム内での位置づけ**: ドメインロジック層 (composable)。UI 層 (page/component) から Supabase 呼び出しを分離する。本単位は新規 RLS/RPC を作らず、`generate_invitation_code` RPC 本体 (8 hex CSPRNG 生成・`not_a_member`・`invitation_code_collision_after_retry` 発火) は data-foundation で実装・検証済みのため、UI 層からの消費のみを担う (ADR-012 D2)。
- **参照したEARS要件**: REQ-006 (一覧表示), REQ-007 (発行), REQ-110 (非メンバー拒否), EDGE-008 (コード衝突)
- **参照した設計文書**:
  - `docs/design/auth-onboarding/architecture.md` §既存 API マッピング
  - `docs/design/auth-onboarding/dataflow.md` §5 (招待リンク発行フロー)
  - `docs/design/auth-onboarding/interfaces.ts` `Invitation` / `UseGenerateInvitationReturn` / `UseListInvitationsReturn`

---

## 2. 入力・出力の仕様（EARS機能要件・TypeScript型定義ベース）

### 2.1 useListInvitations (Read)

- 🔵 **入力パラメータ**:
  - `groupId: string` — 一覧を取得する対象グループの ID。
- 🔵 **出力値**: `UseListInvitationsReturn = AsyncState<Invitation[]>`
  - `data: Ref<Invitation[] | null>` — 招待リンク一覧 (空配列の場合あり)
  - `pending: Ref<boolean>` — ローディング状態
  - `error: Ref<Error | null>` — クエリエラー (throw → `error.vue` グローバルフォールバック)
  - `refresh: () => Promise<void>` — 手動更新 (D5-4 で `useGenerateInvitation` から呼ばれる)
- 🔵 **`Invitation` 型** (`interfaces.ts`):
  ```ts
  type Invitation = Pick<
    Database['public']['Tables']['group_invitations']['Row'],
    'id' | 'code' | 'created_at' | 'expires_at'
  >
  ```
  - SELECT 対象列は `id, code, created_at, expires_at` のみ。
  - ⚠️ `status` 列は存在しない。有効/期限切れは `expires_at < now()` で **UI 側が派生算出** する (DB 列を探さない)。
- 🔵 **クエリ仕様**:
  - `from('group_invitations').select('id, code, created_at, expires_at').eq('group_id', groupId).is('deleted_at', null)`
  - `useAsyncData` のキー: `'invitations-list:' + groupId` (グループ別固定キー、文字列連結で明示)
  - MVP に無効化機能はないため `deleted_at is null` は全件取得と等価だが、ソフトデリート前提で明示的に書く。

### 2.2 useGenerateInvitation (Write RPC)

- 🔵 **入力パラメータ**:
  - `generate(targetGroupId: string)` — 招待コードを発行する対象グループ ID。
- 🔵 **出力値**: `UseGenerateInvitationReturn`
  ```ts
  interface UseGenerateInvitationReturn {
    generate: (targetGroupId: string) => Promise<ActionResult<string>>
    pending: Ref<boolean>
  }
  ```
  - `generate` の戻り: `ActionResult<string> = { data: string | null, error: unknown }` (Supabase native)。`data` は発行された 8 hex コード文字列。
  - `pending: Ref<boolean>` — 二重送信防止 (EDGE-003)。発行ボタン disabled 用に expose。
- 🔵 **RPC 仕様**:
  - `rpc('generate_invitation_code', { target_group_id: targetGroupId })` → `Returns: string` (8 hex code)
  - 引数名は snake_case の `target_group_id` (composable も同名で渡す)。

### 2.3 入出力の関係性・データフロー

- 🔵 `useGenerateInvitation.generate(targetGroupId)` が成功すると、内部で `useListInvitations(targetGroupId).refresh()` を呼ぶ。両者は同一 `useAsyncData` キー `'invitations-list:{groupId}'` を共有するため、cache 無効化 → 再フェッチ → 一覧 UI が自動更新される (D5-4)。
- 🔵 **データフロー (dataflow.md §5)**:
  1. page が `generate(groupId)` 呼び出し
  2. RPC `generate_invitation_code({ target_group_id })` → code string or error
  3. 成功: `useListInvitations(groupId).refresh()` → 一覧キャッシュ更新
  4. 成功: 成功 toast (NFR-204: 文言は i18n キーから引く)
  5. エラー (`not_a_member` / `invitation_code_collision_after_retry`): `showError(error)` → 一過性 toast
- **参照したEARS要件**: REQ-006, REQ-007, REQ-110, EDGE-003, EDGE-008
- **参照した設計文書**: `interfaces.ts` (`Invitation`/`AsyncState`/`ActionResult`/`UseGenerateInvitationReturn`/`UseListInvitationsReturn`), `dataflow.md` §5

---

## 3. 制約条件（EARS非機能要件・アーキテクチャ設計ベース）

- 🔵 **i18n / 文言外部化制約 (NFR-204)**: 成功 toast 文言「招待リンクを発行しました」を composable 内にリテラル直書きしてはならない。`i18n/locales/ja.json` のキーから `useI18n().t(...)` (または `$t`) で引く。詳細なキー方針は §6 を参照。
- 🔵 **エラーチャネル制約 (error-handling.md §6.5 代表例 #5)**: 発行成功・発行エラー (`not_a_member` / `invitation_code_collision_after_retry`) はいずれも **一過性 toast** チャネル (`useToast` / `useToastErrors().showError`) を使う。`<UAlert>` (永続通知) でも `<UFormField>` inline (フィールド検証) でもない。
- 🔵 **二重送信防止 (EDGE-003)**: Write composable は `pending` を必須で expose し、発行処理中はボタンを disabled にできるようにする。`pending` は try/finally で確実に false へ戻す (RPC 例外時もリセット)。
- 🔵 **キャッシング (NFR-002)**: `useAsyncData('invitations-list:{groupId}')` により composable 間で cache を共有。1 ナビゲーション 1 クエリを保証し、`refresh` を明示的に呼んだときのみ再フェッチする。
- 🔵 **useAsyncData キー一致制約**: `useListInvitations` と `useGenerateInvitation` は同一キー `'invitations-list:{groupId}'` を共有する。キー不一致だと refresh が一覧に反映されないため、実装時に両 composable のキー文字列一致を確認する。
- 🔵 **アーキテクチャ制約 (ADR-007)**: composable は業務ロジック層。UI 層から Supabase を直接呼ばない。Write 系は「チャネル state + pending」を expose し、生 error / AppErrorCode ref は expose しない (`generate` の戻り `ActionResult.error` は page が成功/失敗の分岐にのみ使う)。
- 🔵 **データベース制約 (supabase.ts)**:
  - `group_invitations` 列: `id, code, group_id, created_at, created_by, expires_at, deleted_at, updated_at`。`status` 列なし。
  - RPC `generate_invitation_code`: `Args: { target_group_id: string }`, `Returns: string`。
  - RPC 本体・RLS・権限チェックは data-foundation で実装/検証済 (本単位では新規作成なし)。
- 🔵 **テスト制約 (ADR-012)**: 本単位は mock unit テストのみ (integration は data-foundation 側で検証済)。`vi.mock('#imports')` で `useSupabaseClient` / `useAsyncData` / `useToast` / `useToastErrors` / `useListInvitations` を差し替えてスパイ検証する。
- **参照したEARS要件**: NFR-002, NFR-203, NFR-204, EDGE-003
- **参照した設計文書**: `architecture.md` §既存 API マッピング, `error-handling.md` §6.5, `interfaces.ts`, `app/types/supabase.ts`

---

## 4. 想定される使用例（EARS Edgeケース・データフローベース）

### 4.1 基本的な使用パターン

- 🔵 **一覧表示 (REQ-006)**: グループ設定ページ初期表示時に `const { data, refresh } = useListInvitations(groupId)` を呼び、`data.value` の各 `Invitation` を表示。有効/期限切れは `expires_at < now()` で UI が算出。
- 🔵 **発行 (REQ-007)**: 「招待リンクを発行」ボタンで `const { data: code, error } = await generate(groupId)` を実行。成功時は一覧が自動更新 (refresh) され、成功 toast が表示される。

### 4.2 データフロー (dataflow.md §5)

- 🔵 発行成功フロー: `generate` → RPC 成功 → `refresh()` → 成功 toast。
- 🔵 発行失敗フロー: `generate` → RPC エラー → `showError(error)` → 一過性 toast (refresh と成功 toast は出さない)。

### 4.3 エッジケース / エラーケース

- 🔵 **EDGE: 非メンバーの発行 (REQ-110)**: RPC が `{ data: null, error: { message: 'not_a_member' } }` を返した場合、`showError(error)` で `NOT_A_MEMBER` 一過性 toast (`errors.not_a_member`)。`refresh` と成功 toast は呼ばない。
- 🔵 **EDGE-008: コード衝突 (invitation_code_collision_after_retry)**: 生成リトライ後も衝突した場合、`showError(error)` で `errors.invitation_code_collision_after_retry` 一過性 toast。`refresh` と成功 toast は呼ばない。
- 🔵 **EDGE-003: 二重送信**: 発行処理中は `pending=true` で再実行を抑止 (UI 側でボタン disabled)。
- 🟡 **一覧クエリエラー**: `useListInvitations` の SELECT がエラーを返した場合は throw し、`error.vue` のグローバルフォールバックで表示 (一覧 Read のエラーは toast チャネルではなく throw、note.md/実装詳細より)。
- 🟡 **空一覧**: 招待リンクが 0 件の場合 `data.value` は空配列 (`data ?? []`)。エラーではない。
- **参照したEARS要件**: REQ-110, EDGE-003, EDGE-008
- **参照した設計文書**: `dataflow.md` §5, `error-handling.md` §6.5 代表例 #5

---

## 5. EARS要件・設計文書との対応関係

- **参照したユーザストーリー**: グループ管理者がメンバーを招くための招待リンクを発行・一覧確認する
- **参照した機能要件**: REQ-006 (一覧表示), REQ-007 (発行)
- **参照した非機能要件**: NFR-002 (キャッシング), NFR-203 (一過性 toast), NFR-204 (文言の i18n 外部化)
- **参照したEdgeケース**: REQ-110 / EDGE (非メンバー拒否), EDGE-003 (二重送信防止), EDGE-008 (コード衝突)
- **参照した受け入れ基準** (TASK-0012 完了条件):
  - `useListInvitations(groupId)` が `select('id, code, created_at, expires_at').eq('group_id', groupId).is('deleted_at', null)` をクエリし `AsyncState<Invitation[]>` を返す
  - `useAsyncData` キーが `'invitations-list:{groupId}'`
  - `generate(targetGroupId)` が `rpc('generate_invitation_code', { target_group_id })` を呼ぶ
  - 成功時に `useListInvitations.refresh()` + 成功 toast (D5-4)
  - `not_a_member` → `NOT_A_MEMBER` toast / `invitation_code_collision_after_retry` → toast
  - `pending` を持ち、戻りが `UseGenerateInvitationReturn` と一致
- **参照した設計文書**:
  - **アーキテクチャ**: `architecture.md` §既存 API マッピング (ADR-007 / ADR-008 / ADR-012)
  - **データフロー**: `dataflow.md` §5 (招待リンク発行 sequence, D5-4 同一キー refresh)
  - **型定義**: `interfaces.ts` `Invitation` / `AsyncState` / `ActionResult` / `UseGenerateInvitationReturn` / `UseListInvitationsReturn`
  - **データベース**: `app/types/supabase.ts` `group_invitations` テーブル / `generate_invitation_code` RPC
  - **エラー処理**: `docs/design/cross-cutting/error-handling.md` §6.5 代表例 #5

---

## 6. i18n 成功文言キーの方針（NFR-204）⚠️ 重要

### 6.1 現状の `i18n/locales/ja.json` キー構造

```
errors.*                  … エラー文言 (not_a_member, invitation_code_collision_after_retry 等は既存)
app.name
common.backToHome
login.*
confirm.processing
onboarding.*
groups.new.*
groups.settings.{title, membersTitle, invitationsTitle, generateInvitation}   ← 招待発行ボタン文言がここに既存
join.*
```

### 6.2 既存キー (流用、追加不要) 🔵

| 用途 | キー | 文言 |
|---|---|---|
| 非メンバーエラー | `errors.not_a_member` | このグループのメンバーではありません |
| コード衝突エラー | `errors.invitation_code_collision_after_retry` | 招待コードの生成に失敗しました。再度お試しください |

> エラー文言は `useToastErrors().showError()` → `useErrorMessage` (APP_ERROR_CODES → `errors.*`) 経由で引かれるため、composable 内でリテラルを書かない。

### 6.3 新規追加が必要な成功文言キー 🟡

成功 toast「招待リンクを発行しました」のキーは ja.json に未定義のため新規追加する。配置方針は以下 2 案。**推奨は案 A**。

- **案 A (推奨)**: `groups.settings.invitationGenerated` に追加。
  - 根拠: 既存の招待 UI 文言 (`groups.settings.generateInvitation` = 「招待リンクを発行」ボタン) と同じ機能ネームスペースに置くことで凝集度が高い。ja.json は機能別ネームスペース (login / onboarding / groups / join) を採用しており既存規約と一貫する。キー命名は camelCase (既存 `membersTitle` / `generateInvitation` に揃える)。
  - 追加例:
    ```json
    "groups": {
      "settings": {
        "title": "グループ設定",
        "membersTitle": "メンバー",
        "invitationsTitle": "招待リンク",
        "generateInvitation": "招待リンクを発行",
        "invitationGenerated": "招待リンクを発行しました"
      }
    }
    ```
- **案 B (代替)**: タスクノートのヒント `messages.invitation_generated` に倣い、新規トップレベル `messages` ネームスペースを設ける。
  - 根拠: 「成功 toast 文言」を機能横断の共通カテゴリとして集約したい場合に有効。ただし現 ja.json に `messages` セクションは存在せず、命名規約 (snake_case) も既存 (camelCase) と不一致になる。共通メッセージ層を新設する明確な方針が固まるまでは案 A を優先。
  - 追加例:
    ```json
    "messages": {
      "invitation_generated": "招待リンクを発行しました"
    }
    ```

### 6.4 composable からの参照方法 🟡

- 成功 toast は `const { t } = useI18n()` (auto-import) を取得し、`toast.add({ title: t('groups.settings.invitationGenerated') })` のように i18n キー経由で文言を渡す。
- ⚠️ i18n キー値に `@` を含む場合は ja.json 内で `{'@'}` 形式でエスケープする (TASK-0004 実装済規約)。本件の成功文言には `@` を含まないためエスケープ不要。
- **testcases フェーズへの申し送り**: 成功 toast の検証は文言リテラルではなく i18n キー (`t` 呼び出し or キー文字列) でアサートする (NFR-204 準拠を担保するため)。

---

## 7. 品質判定

```
✅ 高品質:
- 要件の曖昧さ: なし (完了条件・型・クエリ・キー形式・エラー分岐すべて確定)
- 入出力定義: 完全 (interfaces.ts の型・supabase.ts の RPC 引数で確定)
- 制約条件: 明確 (NFR-002/203/204・EDGE-003/008・REQ-110・キー一致制約を明記)
- 実装可能性: 確実 (data-foundation で RPC 検証済、参考実装 useCreateGroup あり)
- 信頼性レベル: 🔵 が多数 (機能/入出力/制約/エラーは大半 🔵、空一覧・i18n 配置案の一部のみ 🟡)
```

**信頼性レベル分布**:
- 🔵 青信号: 機能概要・入出力仕様・主要制約・主要エラーケース・既存 i18n キー (大多数)
- 🟡 黄信号: 一覧クエリエラー時の挙動・空一覧・新規 i18n キー配置案 (A/B) と参照方法
- 🔴 赤信号: なし

**総合品質**: 高品質

---

## 8. testcases フェーズへの注意点

1. **最小カバレッジ 3 ケース** (note.md/feedback_test_coverage に準拠、冗長ケースを足さない):
   - TC1: `useListInvitations` が一覧を返す (`eq('group_id', 'g1')` + `is('deleted_at', null)` 呼び出し検証 / `data.value` が `Invitation[]` 1 件)
   - TC2: `useGenerateInvitation` 成功 → `rpc('generate_invitation_code', { target_group_id: 'g1' })` + `refresh` 呼出 + 成功 toast
   - TC3: `not_a_member` → `showError(error)` 呼出 / `refresh` と成功 toast は呼ばれない
2. **mock 戦略**: `vi.hoisted()` で mock 変数を先に定義し `vi.mock('#imports')` で auto-import を差し替え。`select/eq/is` チェーン・`rpc`・`refresh`・`toast.add`・`showError` をスパイ (note.md §5 テンプレート参照、useCreateGroup.test.ts がひな型)。
3. **同一キー refresh の検証**: TC2 で `useListInvitations('g1').refresh` がスパイされ呼ばれることを確認 (キー一致が機能的に効いているかは mock では直接見えないため、`generate` が同じ groupId で `useListInvitations` を呼ぶことをアサートする)。
4. **i18n 成功文言 (NFR-204)**: TC2 の成功 toast 検証はリテラル「招待リンクを発行しました」直書きでなく i18n キー (`t('groups.settings.invitationGenerated')` 等) でアサートする。`t` を mock する場合はキー文字列を返すスタブにし、`toast.add` に渡された値がキー由来であることを確認。
5. **整合性**: i18n キー配置 (案 A `groups.settings.invitationGenerated` 推奨) は red フェーズ実装前にユーザー承認 or 確定を取る (新規 ja.json 追記が発生するため)。testcases では文言値に依存しないアサートにしておく。
