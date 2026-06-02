# TASK-0012 テストケース定義書: useGenerateInvitation + useListInvitations

**機能名**: 招待リンク 一覧表示 (Read) + 発行 (Write RPC) composable
**タスクID**: TASK-0012
**要件名**: auth-onboarding
**出力ファイル**: `docs/implements/auth-onboarding/TASK-0012/auth-onboarding-testcases.md`
**フェーズ**: Phase 2 - ドメインロジック層 / TDD testcases
**作成日**: 2026-06-01

---

## 0. テストケース方針（最小カバレッジ）

`feedback_test_coverage` / note.md §5・TASK-0012.md §単体テスト要件に準拠し、**最小 3 ケース**（境界値・分岐網羅のみ、冗長ケースを足さない）で構成する。

| 区分 | TC | 概要 | テストファイル |
|---|---|---|---|
| 正常系 | TC1 | `useListInvitations` が一覧を返す（`eq` / `is` 呼び出し検証 + `data.value` が `Invitation[]`） | `tests/unit/composables/useListInvitations.test.ts` |
| 正常系 | TC2 | `useGenerateInvitation` 成功 → RPC 引数検証 + `refresh` 呼出 + 成功 toast | `tests/unit/composables/useGenerateInvitation.test.ts` |
| 異常系 | TC3 | `not_a_member` → `showError(error)` / `refresh` と成功 toast は呼ばれない | `tests/unit/composables/useGenerateInvitation.test.ts` |

- 区分別件数: **正常系 2 件 / 異常系 1 件 / 境界値 0 件**（境界値は本単位では該当なし。後述 §3 参照）
- 信頼性レベル: 🔵 3 件 / 🟡 0 件 / 🔴 0 件

> 本単位はテストレイヤー分離 (ADR-012 D2) により **mock unit のみ**。integration は data-foundation 側で検証済 (`generate_invitation_code` 本体 / `not_a_member` / `invitation_code_collision_after_retry` 発火 / RLS)。

---

## 1. 正常系テストケース

### TC1: useListInvitations が一覧を返す（クエリ絞り込み検証）

- **テスト名**: useListInvitations が `group_id` + `deleted_at is null` で絞り込み、`Invitation[]` を `data.value` に返す
  - **何をテストするか**: `useListInvitations('g1')` の `useAsyncData` handler が `from('group_invitations').select('id, code, created_at, expires_at').eq('group_id','g1').is('deleted_at', null)` を実行し、その結果を `data.value` に格納すること
  - **期待される動作**: handler が PostgREST SELECT を 1 回実行し、`eq('group_id','g1')` と `is('deleted_at', null)` で絞り込んだ上で、返ってきた 1 件の行が `Invitation[]` として `data.value` に反映される
- **入力値**:
  - `groupId = 'g1'`
  - mock: `select(...).eq('group_id','g1').is('deleted_at', null)` チェーンが `{ data: [{ id: 'inv1', code: 'a1b2c3d4', created_at: '2026-06-01T00:00:00Z', expires_at: '2026-06-08T00:00:00Z' }], error: null }` を返す
  - **入力データの意味**: `'g1'` は対象グループ ID の代表値。1 件配列は「招待リンクが存在するグループ」の最小代表ケース。`Invitation` の Pick 列 (`id, code, created_at, expires_at`) のみを持つ行で型契約を表現する
- **期待される結果**:
  - `data.value` が `[{ id: 'inv1', code: 'a1b2c3d4', created_at, expires_at }]`（1 件の `Invitation[]`）
  - `eqMock` が `('group_id', 'g1')` で呼ばれている
  - `isMock` が `('deleted_at', null)` で呼ばれている
  - `error.value` が `null`（throw されない）
  - **期待結果の理由**: REQ-006 と interfaces.ts `Invitation` 注より、SELECT 列は 4 列のみで、`deleted_at is null` を明示してソフトデリート行を除外する。handler は `data ?? []` をそのまま返す薄いラッパであり、SELECT 結果が素通しで `data.value` に返るのが正しい
- **テストの目的**: 一覧 Read の「クエリ絞り込み条件」と「戻り値の型契約」を一括検証する
  - **確認ポイント**: (1) `group_id` 絞り込み引数名と値、(2) `deleted_at is null` フィルタの明示呼び出し、(3) `data.value` が `Invitation[]` で素通しされること
- 🔵 **信頼性**: 🔵（TASK-0012.md §テストケース1 / note.md TC1 / requirements.md §2.1・§5 完了条件 / interfaces.ts `Invitation`）

---

### TC2: useGenerateInvitation 成功 → RPC 引数検証 + refresh 呼出 + 成功 toast

- **テスト名**: `generate('g1')` 成功時に RPC を正しい引数で呼び、同一キーの `useListInvitations('g1').refresh` を呼び、成功 toast を出す
  - **何をテストするか**: `generate('g1')` が `rpc('generate_invitation_code', { target_group_id: 'g1' })` を呼び、成功 (`{ data:'a1b2c3d4', error:null }`) 後に `useListInvitations('g1').refresh()` と `toast.add(...)`（成功 toast）を呼ぶこと
  - **期待される動作**: RPC 成功 → `refresh()` で一覧キャッシュ更新 (D5-4) → 成功 toast 表示。`showError` は呼ばれない
- **入力値**:
  - `generate('g1')`
  - mock: `rpcMock` が `{ data: 'a1b2c3d4', error: null }` を返す
  - **入力データの意味**: `'g1'` は対象グループ ID、`'a1b2c3d4'` は RPC が返す 8 hex 招待コードの代表値（data-foundation の CSPRNG 出力形式に合わせた 8 桁 hex）
- **期待される結果**:
  - `rpcMock` が `('generate_invitation_code', { target_group_id: 'g1' })` で呼ばれている（引数名 snake_case `target_group_id`）
  - `refreshMock`（`useListInvitations('g1').refresh`）が 1 回呼ばれている
  - `toastAddMock`（成功 toast）が呼ばれ、`title` が i18n キー由来（`t('groups.settings.invitationGenerated')`、`t` は mock でキー透過 → `title: 'groups.settings.invitationGenerated'`）であること
  - `showErrorMock` は呼ばれていない
  - 戻り値が `{ data: 'a1b2c3d4', error: null }`（`ActionResult<string>`）
  - **期待結果の理由**: dataflow.md §5 D5-4 より、発行成功時は同一 `useAsyncData` キー `'invitations-list:g1'` を共有する `useListInvitations` の `refresh()` で一覧を即時更新し、成功 toast を出す。NFR-204 より成功文言はリテラル直書きではなく i18n キー経由で渡す
- **テストの目的**: 発行成功パスの 4 契約（RPC 引数名 / refresh 呼出 / 成功 toast / 戻り値形状）を一括検証する
  - **確認ポイント**: (1) RPC 引数名が `target_group_id`（`p_*` 等の誤記でない）、(2) `refresh` が同一 groupId 経由で呼ばれる、(3) 成功 toast の `title` が **i18n キー** であること（リテラル「招待リンクを発行しました」直書きでないこと = NFR-204 担保）
- 🔵 **信頼性**: 🔵（TASK-0012.md §テストケース2 / note.md TC2 / requirements.md §2.2・§2.3・§6.4 / dataflow.md §5 D5-4）

---

## 2. 異常系テストケース

### TC3: not_a_member → showError(error) / refresh と成功 toast は呼ばれない

- **テスト名**: `generate('g1')` が `not_a_member` エラー時に `showError(error)` で一過性 toast に流し、`refresh` と成功 toast を呼ばない
  - **エラーケースの概要**: 非メンバーのユーザーが招待コード発行を試みた場合（REQ-110）。RPC が `{ data: null, error: { message: 'not_a_member' } }` を返す
  - **エラー処理の重要性**: 権限のないユーザーへ適切に拒否フィードバック（`errors.not_a_member` 一過性 toast）を返し、かつ「一覧更新」「成功表示」という成功パス副作用を一切実行しないことが、UI の整合性とセキュリティ表現の正しさを担保する
- **入力値**:
  - `generate('g1')`
  - mock: `rpcMock` が `{ data: null, error: { message: 'not_a_member' } }` を返す
  - **不正な理由**: `target_group_id='g1'` のグループに対し、呼び出しユーザーが `group_members` に存在しない（RLS / RPC 内権限チェックで拒否）。`error.message` が識別子 `not_a_member`
  - **実際の発生シナリオ**: 他グループのメンバー、または所属解除直後のユーザーが、キャッシュ古い settings ページから発行ボタンを押下したケース
- **期待される結果**:
  - `showErrorMock` が `error`（= `{ message: 'not_a_member' }`）を引数に呼ばれている
  - `refreshMock`（`useListInvitations.refresh`）は呼ばれていない（否定アサーション）
  - `toastAddMock`（成功 toast）は呼ばれていない（否定アサーション）
  - 戻り値が `{ data: null, error: { message: 'not_a_member' } }`（`ActionResult<string>`）
  - **エラーメッセージの内容**: composable は文言変換せず `error` をそのまま `showError` へ渡す（文言変換は `useToastErrors` → `useErrorMessage` → `errors.not_a_member` の責務、責務分離）
  - **システムの安全性**: エラー時は一覧キャッシュを更新せず（誤った成功表現を防止）、成功 toast も出さない。`pending` は try/finally で false へ戻る（RPC エラー戻りでもリセット）
- **テストの目的**: 発行失敗パスのエラーチャネル分岐（`showError` 呼出 + 成功パス副作用の非実行）を検証する
  - **品質保証の観点**: 「エラー時に成功 toast が誤って出る」「不要な refresh が走る」という回帰を防ぎ、error-handling.md §6.5 代表例 #5（一過性 toast チャネル）の契約を保証する
- 🔵 **信頼性**: 🔵（TASK-0012.md §テストケース3 / note.md TC3 / requirements.md §4.3 / REQ-110 / error-handling.md §6.5 代表例 #5）

> **EDGE-008（`invitation_code_collision_after_retry`）の扱い**: TC3 と分岐構造が完全に同型（`error` 非 null → `showError` → 成功副作用なし）であり、`error.message` 値が異なるだけ。冗長ケースを足さない方針（feedback_test_coverage）に従い独立 TC 化せず、TC3 が代表する `error` 非 null 分岐に集約する。

---

## 3. 境界値テストケース

本単位（mock unit / UI 層消費 composable）では、独立した境界値テストは**該当なし**。理由は以下。

- 🟡 **空一覧（0 件）**: `useListInvitations` が `data ?? []` で空配列を返すケースは requirements.md §4.3 で「エラーではない正常値」と定義されるが、TC1（1 件）と同一の素通しロジックを通るだけで分岐が増えない（境界値として独立検証する実装上の意味が薄い）。冗長ケース禁止方針により独立 TC 化しない。
- 🟡 **一覧クエリエラー（throw）**: `useListInvitations` の SELECT エラーは `throw` → `error.vue` グローバルフォールバック (requirements.md §4.3)。これは `useCurrentGroup` と同型のグローバル例外経路であり、composable 固有ロジックではないため本単位の最小カバレッジ対象外。
- 🔵 **`pending` 境界（EDGE-003 二重送信防止）**: `pending` の true→false 遷移は try/finally の実装契約だが、最小 3 ケースの TC2/TC3 が成功・失敗それぞれで処理完了後の状態（`pending=false`）を間接的に保証する。独立した境界 TC は足さない。

> 境界値 0 件は「網羅漏れ」ではなく、本 composable の入力空間（groupId 文字列 + RPC mock 戻り）に対し分岐を増やす境界が存在しないことによる意図的な判断。

---

## 4. 開発言語・フレームワーク

- **プログラミング言語**: TypeScript (strict mode)
  - **言語選択の理由**: プロジェクト全体が Nuxt 4 + TypeScript strict（CLAUDE.md）。composable の型契約（`Invitation` Pick 型 / `ActionResult<string>` / `AsyncState<T>`）を型レベルで検証できる
  - **テストに適した機能**: 型推論による mock 戻り値の整合チェック、`Database` 型付き `useSupabaseClient<Database>()` の RPC 引数名補完
- **テストフレームワーク**: Vitest + @nuxt/test-utils
  - **フレームワーク選択の理由**: ADR-012 D5 / note.md §5。Nuxt 公式の mock unit テスト基盤。`vi.hoisted()` + `vi.mock('#imports')` で auto-import を差し替え、`#supabase-client` / `#async-data` 安定エイリアス（vitest.config.ts 定義済）で Nuxt Vite transform に対応
  - **テスト実行環境**: `tests/unit/**/*.test.ts`（pre-commit + CI）。`*.integration.test.ts` は除外。本単位は mock unit のみで integration なし
- 🔵 **信頼性**: 🔵（note.md §1・§5 / vitest.config.ts / CLAUDE.md / ADR-012）

---

## 5. テストケース実装時の mock 戦略・日本語コメント指針

### 5.1 mock 戦略（note.md §5 / useCreateGroup.test.ts・useCurrentGroup.test.ts 踏襲）

#### useListInvitations.test.ts（TC1）

- `vi.hoisted()` で `selectMock` / `eqMock` / `isMock` / `useAsyncDataMock` を先に定義（TDZ 回避）
- チェーン構造: `selectMock.mockReturnValue({ eq: eqMock })` → `eqMock.mockReturnValue({ is: isMock })` → `isMock.mockResolvedValue({ data, error })`
- `useAsyncDataMock` は **handler 即時実行スタブ**（useCurrentGroup.test.ts §useAsyncData mock 解決方式を踏襲）。`handler()` を即時 await し `{ data: ref(result), pending: ref(false), error: errorRef, refresh: vi.fn() }` を返す。これを忘れると `data.value` が常に null になり TC1 が落ちる
- `vi.mock('#imports')`: `ref`（vue 実物）/ `useSupabaseClient: () => ({ from: () => ({ select: selectMock }) })` / `useAsyncData: useAsyncDataMock`
- `vi.mock('#supabase-client')` / `vi.mock('#async-data')`: 安定エイリアス経由で `useSupabaseClient` / `useAsyncData` を差し替え（Nuxt Vite transform 保険）
- `beforeEach`: `vi.clearAllMocks()` + `isMock.mockResolvedValue(...)` 再設定（clearAllMocks で消えるため）

#### useGenerateInvitation.test.ts（TC2 / TC3）

- `vi.hoisted()` で `rpcMock` / `refreshMock` / `showErrorMock` / `toastAddMock` を先に定義
- `vi.mock('#imports')`:
  - `ref`（vue 実物）
  - `useSupabaseClient: () => ({ rpc: rpcMock })`
  - `useToastErrors: () => ({ showError: showErrorMock })`
  - `useToast: () => ({ add: toastAddMock })`
  - `useI18n: () => ({ t: (key: string) => key })`（**t はキー透過スタブ** → 成功 toast の title がキー文字列になり NFR-204 をキーでアサート可能）
- `useListInvitations` は `~/composables/useListInvitations` を直接 mock（`vi.mock('~/composables/useListInvitations', () => ({ useListInvitations: () => ({ refresh: refreshMock }) }))`）+ `#imports` 側でも `useListInvitations: () => ({ refresh: refreshMock })` を差し替え（Nuxt Vite transform 両対応、useCreateGroup.test.ts の useCurrentGroup 直接 mock と同型）
- `vi.mock('#supabase-client')`: `useSupabaseClient: () => ({ rpc: rpcMock })`（保険）
- `beforeEach`: `vi.clearAllMocks()` + `refreshMock.mockResolvedValue(undefined)` 再設定

### 5.2 日本語コメント指針

各テストに以下を必ず含める（useCreateGroup.test.ts / useCurrentGroup.test.ts と同水準）:

```ts
// 【テスト目的】: [このテストで何を確認するか]
// 【テスト内容】: [具体的にどの処理をテストするか]
// 【期待される動作】: [正常時の結果]
// 🔵 [信頼性レベルと参照元]
```

- Given: `// 【テストデータ準備】` / `// 【初期条件設定】`（mock 戻り値の固定理由）
- When: `// 【実際の処理実行】` / `// 【処理内容】`（呼び出す composable / メソッド）
- Then: `// 【結果検証】` / `// 【期待値確認】`、各 `expect` に `// 【確認内容】: ...` 🔵
- `beforeEach`: `// 【テスト前準備】` / `// 【環境初期化】`（clearAllMocks + mockResolvedValue 再設定理由）

### 5.3 スパイ検証パターン例

```ts
// TC1
expect(eqMock).toHaveBeenCalledWith('group_id', 'g1') // 【確認内容】: group_id 絞り込み 🔵
expect(isMock).toHaveBeenCalledWith('deleted_at', null) // 【確認内容】: deleted_at is null フィルタ明示 🔵
expect(data.value).toEqual([{ id: 'inv1', code: 'a1b2c3d4', created_at: '...', expires_at: '...' }]) // 【確認内容】: Invitation[] 素通し 🔵

// TC2
expect(rpcMock).toHaveBeenCalledWith('generate_invitation_code', { target_group_id: 'g1' }) // 【確認内容】: RPC 引数名 target_group_id 🔵
expect(refreshMock).toHaveBeenCalledTimes(1) // 【確認内容】: 同一キー refresh (D5-4) 🔵
expect(toastAddMock).toHaveBeenCalledWith({ title: 'groups.settings.invitationGenerated' }) // 【確認内容】: 成功 toast が i18n キー由来 (NFR-204) 🔵
expect(showErrorMock).not.toHaveBeenCalled() // 【確認内容】: 成功経路で showError を使わない 🔵

// TC3
expect(showErrorMock).toHaveBeenCalledWith({ message: 'not_a_member' }) // 【確認内容】: error を素通しで showError へ 🔵
expect(refreshMock).not.toHaveBeenCalled() // 【確認内容】: エラー時に refresh を呼ばない 🔵
expect(toastAddMock).not.toHaveBeenCalled() // 【確認内容】: エラー時に成功 toast を出さない 🔵
```

---

## 6. 要件定義との対応関係

- **参照した機能概要**: requirements.md §1（useListInvitations / useGenerateInvitation の 2 本 composable）
- **参照した入力・出力仕様**: requirements.md §2.1（useListInvitations / `Invitation` Pick 型 / クエリ仕様）, §2.2（useGenerateInvitation / RPC 仕様 / `ActionResult<string>`）, §2.3（同一キー refresh データフロー）
- **参照した制約条件**: requirements.md §3（NFR-002 キャッシング / NFR-204 i18n 外部化 / EDGE-003 pending / error-handling.md §6.5 一過性 toast / ADR-012 mock unit のみ）, §6（i18n 成功文言キー方針: 案 A `groups.settings.invitationGenerated` 推奨）
- **参照した使用例**: requirements.md §4.1（一覧表示 / 発行）, §4.2（発行成功 / 失敗フロー）, §4.3（REQ-110 非メンバー / EDGE-008 衝突 / EDGE-003 二重送信 / 空一覧 / クエリエラー throw）
- **参照したEARS要件**: REQ-006（一覧表示）, REQ-007（発行）, REQ-110（非メンバー拒否）, EDGE-003（二重送信防止）, EDGE-008（コード衝突）, NFR-002 / NFR-203 / NFR-204
- **参照した設計文書**: dataflow.md §5（招待リンク発行 sequence / D5-4 同一キー refresh）, interfaces.ts（`Invitation` / `AsyncState` / `ActionResult` / `UseGenerateInvitationReturn` / `UseListInvitationsReturn`）, app/types/supabase.ts（`group_invitations` / `generate_invitation_code` RPC）, error-handling.md §6.5 代表例 #5

---

## 7. testcases フェーズ申し送り（red フェーズへの注意点）

1. **i18n 成功文言キーの未追記**: 成功 toast キー `groups.settings.invitationGenerated`（案 A 推奨）は `i18n/locales/ja.json` に**未定義**。green フェーズで composable 実装と同時に ja.json 追記が発生する。red/green の前にユーザー承認 or 配置確定を取る（requirements.md §8-5）。**testcases では文言値に依存せず i18n キー文字列でアサート**（`t` をキー透過スタブにし `title: 'groups.settings.invitationGenerated'` を検証）。
2. **handler 即時実行スタブ必須**: TC1 の `useAsyncData` mock は handler を即時 await 実行する形にしないと `data.value` が常に null になり落ちる（useCurrentGroup.test.ts の教訓）。
3. **同一キー refresh の検証限界**: mock では `useAsyncData` キー一致が機能的に効いているかは直接見えない。`generate` が同一 groupId で `useListInvitations('g1')` を呼び、その `refresh` スパイが叩かれることをアサートして代替検証する（note.md §申し送り3）。
4. **clearAllMocks 後の mockResolvedValue 再設定**: `beforeEach` で `vi.clearAllMocks()` を呼ぶと `isMock` / `refreshMock` の `mockResolvedValue` が消えるため、TC 冒頭または beforeEach で再設定する（useCreateGroup.test.ts と同型）。
5. **EDGE-008 は独立 TC 化しない**: `invitation_code_collision_after_retry` は TC3 と同型分岐（`error` 非 null → `showError`）のため冗長回避で集約済み（feedback_test_coverage）。

---

## 8. 品質判定

```
✅ 高品質:
- テストケース分類: 正常系 2 / 異常系 1。境界値は本単位で該当なし（理由を §3 で明示、網羅漏れではない）
- 期待値定義: 各 TC の入力・期待結果・スパイ引数まで具体値で確定
- 技術選択: TypeScript strict + Vitest + @nuxt/test-utils 確定（mock 戦略・エイリアスまで特定）
- 実装可能性: useCreateGroup.test.ts / useCurrentGroup.test.ts の確立済パターンで実現可能
- 信頼性レベル: 🔵 3 / 🟡 0 / 🔴 0（TC は全て元資料に直接対応）
```

**信頼性レベル分布**:
- 🔵 青信号: TC1 / TC2 / TC3（全テストケース、TASK-0012.md・note.md・requirements.md に直接対応）
- 🟡 黄信号: §3 境界値スキップ判断の補足（空一覧・クエリエラー throw の挙動説明部分のみ）
- 🔴 赤信号: なし

**総合品質**: 高品質
</content>
</invoke>
