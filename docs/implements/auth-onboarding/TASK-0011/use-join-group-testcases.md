# TDDテストケース定義書: useJoinGroup（RPC composable）

**機能名**: useJoinGroup（招待コードによる Group 参加）
**タスクID**: TASK-0011
**要件名**: auth-onboarding
**作成日**: 2026-06-01
**フェーズ**: Phase 2 - ドメインロジック層
**テストファイル**: `tests/unit/composables/useJoinGroup.test.ts`
**出力ファイル**: `docs/implements/auth-onboarding/TASK-0011/use-join-group-testcases.md`

---

## 0. テスト戦略サマリー（最重要）

### 採用 mock 方式: **方式 A（useNoticeErrors / useErrorMessage は実物、useI18n のみ mock）**

🔵 **青信号**: `tests/unit/composables/useErrorMessage.test.ts`（t/te mock パターン）+ `tests/unit/composables/useCreateGroup.test.ts`（RPC / composable mock パターン）+ TASK-0011.md §単体テスト要件「`useNoticeErrors` は実物 / 内部 `errorToMessage` も実物 or `t` を mock / `notice.value` の結果文言を検証」+ ADR-012 D4

#### 方式 A の構成

| 対象 | 扱い | 理由 |
|---|---|---|
| `useSupabaseClient().rpc` | **mock**（`rpcMock` スパイ） | RPC 戻り値を TC ごとに固定し、引数も検証する（`useCreateGroup.test.ts` 踏襲） |
| `useCurrentGroup().refresh` | **mock**（`refreshMock` スパイ） | 成功時の呼出 / 失敗時の非呼出を検証する |
| `useNoticeErrors`（notice / setNotice / clear） | **実物** | 詰め替え後のエラーが `errorToMessage` を通って `notice.value` に文言解決されることを検証するため |
| `useErrorMessage`（errorToMessage） | **実物** | App 識別子 → flat i18n キー変換の実分岐（`isAppError` includes 判定）を本物で通すため |
| `useI18n`（t / te） | **mock**（`vue-i18n` 経由） | `t = (key) => key`（キー透過）/ `te = () => false`。`notice.value` を `errors.xxx` の **キー文字列**で検証可能にする |
| `@sentry/nuxt`（captureException） | **mock**（スパイ） | TC2 で「詰め替え成功 → Sentry 非報告」を担保（詰め替え失敗時は generic + Sentry になるため、その否定で核心を二重に証明） |
| `ref` | **実物**（vue の ref を importOriginal） | `pending` / `notice` が `Ref<T>` として機能するため（`useCreateGroup.test.ts` 踏襲） |

#### 方式 A を採用する根拠（方式 B を不採用とする理由）

🔵 **EDGE-005 の核心を「確実に」検証できるのは A のみ**:

- **`isAppError` は `message.includes(code)`**（`app/types/error-codes.ts` L30-36）。
  - DB メッセージ `'invitation_not_found'` に対し `'invitation_not_found'.includes('invitation_not_found_by_link')` は **false**（短い文字列は長い文字列を含めない）。
  - したがって **詰め替えをしないと** `errorToMessage` は App 識別子 7 分岐すべてに一致せず、fallthrough して `errors.generic` + `Sentry.captureException` になる。
  - 逆に **詰め替えに成功すると** `message === 'invitation_not_found_by_link'` となり、`INVITATION_NOT_FOUND_BY_LINK` 分岐に一致して `notice.value === 'errors.invitation_not_found_by_link'`（t がキー透過のため）。
- 方式 A は `notice.value` の **実際の解決結果（キー文字列）** を直接 assert できるため、「詰め替えが効いた / 効かなかった」を `errors.invitation_not_found_by_link`（成功）vs `errors.generic`（失敗）で明確に区別できる。これが EDGE-005「素朴 includes では一致しない」を担保する核心。
- **方式 B（useNoticeErrors を mock し setNotice をスパイ）は不採用**: setNotice に渡る引数（`message === 'invitation_not_found_by_link'` のオブジェクト）を検証できても、`errorToMessage` の **実 includes 分岐を通らない**ため「素朴 includes で本当に一致するか」を証明できない。詰め替え後の文字列が App 識別子と一致することは error-codes.ts の実装に依存しており、それを実通過させない B は EDGE-005 の核心を間接的にしか触れない。

🔵 **既存テスト資産との整合**:

- t/te を `vue-i18n` 経由で mock し `notice.value` をキー文字列で検証するのは `useErrorMessage.test.ts` の確立パターンそのもの。
- rpc / refresh を `vi.hoisted` + `vi.mock('#imports')` + `vi.mock('#supabase-client')` + `vi.mock('~/composables/useCurrentGroup')` で差し替えるのは `useCreateGroup.test.ts` の確立パターンそのもの。
- 両資産を組み合わせるだけで本テストが成立し、新規 mock 戦略の発明が不要。

#### mock 設定スケルトン（方式 A）

```ts
// vi.hoisted で先行定義（TDZ 回避）
const { rpcMock, refreshMock, tFn, teFn } = vi.hoisted(() => ({
  rpcMock: vi.fn(),
  refreshMock: vi.fn().mockResolvedValue(undefined),
  tFn: vi.fn((key: string) => key),   // t はキー透過 → notice.value が errors.xxx キーになる
  teFn: vi.fn(() => false)            // te は常に false（App 識別子は te を使わない）
}))

// useI18n を vue-i18n 経由で mock（useErrorMessage.test.ts 踏襲）
vi.mock('vue-i18n', () => ({
  useI18n: () => ({ t: tFn, te: teFn })
}))

// Sentry mock（詰め替え失敗時の generic フォールバック検出用）
vi.mock('@sentry/nuxt', () => ({
  captureException: vi.fn()
}))

// #imports: ref は実物、useSupabaseClient / useCurrentGroup を差し替え
//   useNoticeErrors / useErrorMessage は実物を使うため #imports からは out しない
//   （ただし #imports 経由で実物 composable が解決される場合は spread 等で実装を維持）
vi.mock('#imports', async (importOriginal) => {
  const vue = await importOriginal<typeof import('vue')>()
  return {
    ref: vue.ref,
    useSupabaseClient: () => ({ rpc: rpcMock }),
    useCurrentGroup: () => ({ refresh: refreshMock })
    // useNoticeErrors / useErrorMessage は実物（mock しない）
  }
})

// Nuxt Vite transform 保険（useCreateGroup.test.ts 同型）
vi.mock('#supabase-client', () => ({
  useSupabaseClient: () => ({ rpc: rpcMock })
}))
vi.mock('~/composables/useCurrentGroup', () => ({
  useCurrentGroup: () => ({ refresh: refreshMock })
}))

beforeEach(() => {
  vi.clearAllMocks()
  refreshMock.mockResolvedValue(undefined)
  tFn.mockImplementation((key: string) => key)
  teFn.mockReturnValue(false)
})
```

> **tdd-red への注意**: `useNoticeErrors` / `useErrorMessage` は **mock しない**ことが方式 A の肝。`#imports` mock のオブジェクトに `useNoticeErrors` / `useErrorMessage` を含めると差し替わってしまうため、含めない（または `importOriginal` の実装を維持）。ただし Nuxt Vite transform が `~/composables/useNoticeErrors` を直接解決し、その内部の `ref` / `useI18n` が解決できずに落ちる可能性がある。red 実行時に解決エラーが出た場合は、`useNoticeErrors` / `useErrorMessage` の内部依存（`ref` は `#imports`、`useI18n` は `vue-i18n` mock）が確実に解決されるよう mock の網羅を調整すること（後述 §6 注意点）。

---

## 1. 正常系テストケース（基本的な動作）

### TC1: 成功 → RPC 引数検証 + refresh 呼出 + notice は null のまま

- **テスト名**: `join` 成功時に RPC を正しい引数で呼び、所属状態を refresh し、notice を null に保ち group_id を返す
  - **何をテストするか**: 有効な招待コードで `join('abcd1234')` を呼んだとき、(1) `rpc('join_group_with_code', { invite_code: 'abcd1234' })` が正しい引数で 1 回呼ばれ、(2) `useCurrentGroup().refresh()` が呼ばれ、(3) `notice.value` が `null` のまま（エラーチャネル不使用）で、(4) 戻り値が `{ data: 'g1', error: null }`（ActionResult）であること
  - **期待される動作**: 成功パスの 4 契約（RPC 引数名・refresh 呼出・通知未使用・戻り値形状）を一括検証
- **入力値**: `join('abcd1234')`、`rpcMock` は `{ data: 'g1', error: null }` を返す
  - **入力データの意味**: `'abcd1234'` は有効な招待コードの代表値（8 文字、RPC が成功を返すケース）。RPC 戻り `{ data: 'g1', error: null }` は dataflow.md §4 の成功形（ActionResult 成功）
- **期待される結果**:
  - `rpcMock` が `('join_group_with_code', { invite_code: 'abcd1234' })` で呼ばれる（引数名 `invite_code` を厳密検証）
  - `rpcMock` の呼出回数は 1
  - `refreshMock` の呼出回数は 1（D5-4: 成功時に global state 更新）
  - `notice.value === null`（成功経路ではエラーチャネルを使わない）
  - 戻り値 `result` が `{ data: 'g1', error: null }` と等しい
  - **期待結果の理由**: dataflow.md §4「成功時に `useCurrentGroup().refresh()` を await して所属状態を最新化」+ interfaces.ts §5 `UseJoinGroupReturn` + §3 ActionResult
- **テストの目的**: 成功パスの正常動作（RPC 呼出規約・refresh 連携・通知不使用・戻り値契約）の確認
  - **確認ポイント**: RPC 第 2 引数のキーが `invite_code`（`p_invite_code` 等の誤記でない）であること。`notice.value` が `null` のまま汚染されないこと
- 🔵 **青信号**: TASK-0011.md §単体テスト要件 TC1 / use-join-group-requirements.md §4 正常系 / dataflow.md §4 D5-4 / interfaces.ts §5

---

## 2. 異常系テストケース（エラーハンドリング）

### TC2【核心】: DB `invitation_not_found` → 明示変換で INVITATION_NOT_FOUND_BY_LINK に詰め替え、notice に文言解決、refresh 非呼出

- **テスト名**: DB が `invitation_not_found` を返したとき明示変換で `INVITATION_NOT_FOUND_BY_LINK` に詰め替え、notice が `errors.invitation_not_found_by_link` に解決され refresh を呼ばない
  - **エラーケースの概要**: DB の RPC 例外メッセージ `invitation_not_found` と App 識別子 `invitation_not_found_by_link` の **文字列不一致**（EDGE-005 / 注2）を、useJoinGroup の明示判定で吸収する核心ケース
  - **エラー処理の重要性**: `isAppError` は `message.includes(code)` で判定するため、`'invitation_not_found'.includes('invitation_not_found_by_link')` は **false**。詰め替えをしないと `errorToMessage` が fallthrough して `errors.generic` + Sentry 報告になり、ユーザに正しい文言が出ない。明示変換が機能していることを `notice.value` の解決結果で担保する
- **入力値**: `join('badcode')`、`rpcMock` は `{ data: null, error: { message: 'invitation_not_found' } }` を返す
  - **不正な理由**: `'invitation_not_found'` は DB 側の生メッセージで、App 識別子（`'invitation_not_found_by_link'`）と文字列が異なるため素朴 includes に一致しない
  - **実際の発生シナリオ**: 無効・誤入力・存在しない招待コードで `/join/[code]` に着地し、DB が `invitation_not_found` 例外を返す場面
- **期待される結果**:
  - `notice.value === 'errors.invitation_not_found_by_link'`（t がキー透過 → 詰め替え成功で `INVITATION_NOT_FOUND_BY_LINK` 分岐に一致したことを意味する）
  - `notice.value !== 'errors.generic'`（詰め替え失敗・fallthrough でないことの否定検証）
  - `Sentry.captureException` が呼ばれない（fallthrough していない = 詰め替え成功の二重証明）
  - `refreshMock` が呼ばれない（エラー時は global state 更新しない）
  - 戻り値 `result` が `{ data: null, error: { message: 'invitation_not_found' } }`（**元のエラー**をそのまま返す。詰め替えは notice 解決用で、戻り値の error は変えない契約）
  - **エラーメッセージの内容**: `errors.invitation_not_found_by_link` キー → ja.json で「招待リンクが無効です。発行者にご確認ください」
  - **システムの安全性**: エラー時に refresh を呼ばず、global state を不正に書き換えない
- **テストの目的**: EDGE-005 明示変換ロジック（`msg.includes('invitation_not_found') && !msg.includes('invitation_not_found_by_link')`）が `notice.value` の正しい文言解決に結実することの確認
  - **品質保証の観点**: 本タスク最大の非自明点（DB↔App 文字列不一致）の回帰を防ぐ。`errors.generic` への取りこぼし（Sentry 報告）が起きないことを保証
- 🔵 **青信号**: TASK-0011.md §単体テスト要件 TC2 / use-join-group-requirements.md §4 EDGE-005 / architecture.md §既存 API マッピング 注2 / error-codes.ts `isAppError` includes 判定

---

### TC3: `already_in_group` → ALREADY_IN_GROUP notice、refresh 非呼出

- **テスト名**: DB が `already_in_group` を返したとき詰め替え不要で notice が `errors.already_in_group` に解決され refresh を呼ばない
  - **エラーケースの概要**: 1 user = 1 group 制約（ADR-006 / 注4）に基づき、既にグループ所属のユーザが参加を試みた場合の早期失敗
  - **エラー処理の重要性**: `already_in_group` は App 識別子 `ALREADY_IN_GROUP: 'already_in_group'` と **文字列一致**するため、詰め替え不要で `setNotice(error)` がそのまま解決すること（TC2 と異なり明示変換不要のパス）を確認する
- **入力値**: `join('code')`、`rpcMock` は `{ data: null, error: { message: 'already_in_group' } }` を返す
  - **不正な理由**: 既にグループに所属している状態での参加要求（業務制約違反）
  - **実際の発生シナリオ**: 既にチームに参加済みのユーザが別の招待リンクに着地して参加ボタンを押す場面。`join_group_with_code` が PG 23505 を待たず `already_in_group` を最初にチェックして返す（注4）
- **期待される結果**:
  - `notice.value === 'errors.already_in_group'`（`ALREADY_IN_GROUP` 分岐に一致）
  - `Sentry.captureException` が呼ばれない（マッピング済のため）
  - `refreshMock` が呼ばれない
  - 戻り値 `result` が `{ data: null, error: { message: 'already_in_group' } }`
  - **エラーメッセージの内容**: `errors.already_in_group` キー → ja.json で「すでにグループに参加しています」
  - **システムの安全性**: 重複参加を防ぎ、global state を書き換えない
- **テストの目的**: 文字列一致パス（詰め替え不要）の正常なエラー文言解決の確認
  - **品質保証の観点**: 明示変換が `invitation_not_found` 以外の識別子を誤って巻き込まない（`already_in_group` をそのまま通す）ことを保証
- 🔵 **青信号**: TASK-0011.md §単体テスト要件 TC3 / use-join-group-requirements.md §4 REQ-105 / architecture.md 注3/注4 / error-codes.ts `ALREADY_IN_GROUP`

---

### TC4: `invitation_expired` → INVITATION_EXPIRED notice、refresh 非呼出

- **テスト名**: DB が `invitation_expired` を返したとき詰め替え不要で notice が `errors.invitation_expired` に解決され refresh を呼ばない
  - **エラーケースの概要**: 有効期限切れの招待コードでの参加要求
  - **エラー処理の重要性**: `invitation_expired` は App 識別子 `INVITATION_EXPIRED: 'invitation_expired'` と **文字列一致**するため、詰め替え不要で `setNotice(error)` がそのまま解決すること（TC3 同様、明示変換不要のパス）を確認する
- **入力値**: `join('code')`、`rpcMock` は `{ data: null, error: { message: 'invitation_expired' } }` を返す
  - **不正な理由**: 期限切れの招待コードでの参加（時間境界による無効化）
  - **実際の発生シナリオ**: 発行から時間が経った招待リンクに着地して参加ボタンを押す場面
- **期待される結果**:
  - `notice.value === 'errors.invitation_expired'`（`INVITATION_EXPIRED` 分岐に一致）
  - `Sentry.captureException` が呼ばれない
  - `refreshMock` が呼ばれない
  - 戻り値 `result` が `{ data: null, error: { message: 'invitation_expired' } }`
  - **エラーメッセージの内容**: `errors.invitation_expired` キー → ja.json で「招待コードの有効期限が切れています」
  - **システムの安全性**: 期限切れコードでの参加を防ぎ、global state を書き換えない
- **テストの目的**: 3 つ目のエラー分岐（文字列一致パス）の正常なエラー文言解決の確認
  - **品質保証の観点**: 全エラー分岐（変換要 1 + 変換不要 2）の網羅により、エラーハンドリングの分岐カバレッジを完成させる
- 🔵 **青信号**: TASK-0011.md §単体テスト要件 TC4 / use-join-group-requirements.md §4 REQ-106 / error-codes.ts `INVITATION_EXPIRED`

---

## 3. 境界値テストケース（最小値、最大値、null等）

🟡 **黄信号**: feedback_test_coverage（最小境界 + 分岐網羅、冗長禁止）により、本タスクでは **独立した境界値ケースを追加しない**。

- **根拠**: useJoinGroup は入力 `inviteCode` の形式バリデーションを責務外とし（DB 側が `invitation_not_found` として判定。use-join-group-requirements.md §2 制約）、空文字・長大文字列等の境界はすべて DB 例外（`invitation_not_found`）に収束する。これは TC2 のエラー分岐と等価であり、独立ケースを追加すると冗長になる。
- **境界相当の観点は既存 TC に内包**:
  - 入力境界（無効コード）→ TC2 の `invitation_not_found` パスでカバー
  - notice 状態境界（null ⇔ 文言）→ TC1（null 維持）/ TC2-4（文言セット）で両端カバー
  - 分岐境界（詰め替え要 ⇔ 不要）→ TC2（要）/ TC3・TC4（不要）でカバー
- 🟡 **黄信号**: feedback_test_coverage.md（最小ケース方針）+ use-join-group-requirements.md §次フェーズ注意点 2（最小カバレッジ 4 ケース、冗長ケース追加しない）

---

## 4. 開発言語・フレームワーク

- **プログラミング言語**: TypeScript（strict mode）
  - **言語選択の理由**: プロジェクト全体が Nuxt 4 + Vue 3 + TypeScript strict（CLAUDE.md §Project / §Coding Conventions）。composable も `<script setup lang="ts">` 規約に従う型付き実装
  - **テストに適した機能**: 型による戻り値契約（`UseJoinGroupReturn` / `ActionResult<string>`）の静的検証、`Ref<T>` 型の明示
- **テストフレームワーク**: Vitest
  - **フレームワーク選択の理由**: `vitest.config.ts` で alias（`#supabase-client` / `#nuxt-router` / `#async-data` 等）と include/exclude が定義済。既存 composable テスト（`useCreateGroup.test.ts` / `useErrorMessage.test.ts` 等）が全て Vitest
  - **テスト実行環境**: `tests/unit/**/*.test.ts`（mock unit レイヤー、pre-commit + CI）。integration（`*.integration.test.ts`）は exclude されており本タスクでは不要（ADR-012 D2）
- 🔵 **青信号**: `vitest.config.ts` / `tests/unit/composables/` 既存テスト群 / note.md §5 テスト関連情報

---

## 5. テストケース実装時の日本語コメント指針

### TC1 実装コメント例（成功系）

```ts
// 【テスト目的】: join 成功時に RPC を正引数で呼び、refresh し、notice を null に保ち group_id を返すことを確認
// 【テスト内容】: rpc('join_group_with_code', { invite_code:'abcd1234' }) / refresh 1回 / notice null / 戻り値 { data:'g1', error:null }
// 【期待される動作】: 成功パスの 4 契約（RPC 引数・refresh 呼出・通知未使用・戻り値形状）を一括検証
// 🔵 TASK-0011.md §単体テスト要件 TC1 / dataflow.md §4 D5-4

// 【テストデータ準備】: rpc を成功戻り { data:'g1', error:null } で固定（成功パス再現）
rpcMock.mockResolvedValue({ data: 'g1', error: null })

// 【実際の処理実行】: useJoinGroup().join('abcd1234') を await
const { join, notice } = useJoinGroup()
const result = await join('abcd1234')

// 【結果検証】: RPC 引数 / refresh 呼出 / notice null / 戻り値を expect で検証
expect(rpcMock).toHaveBeenCalledWith('join_group_with_code', { invite_code: 'abcd1234' }) // 【検証項目】: RPC 引数名 invite_code 🔵
expect(rpcMock).toHaveBeenCalledTimes(1) // 【検証項目】: RPC 1 回 🔵
expect(refreshMock).toHaveBeenCalledTimes(1) // 【検証項目】: 成功時 refresh 1 回 (D5-4) 🔵
expect(notice.value).toBeNull() // 【検証項目】: 成功時 notice は null 🔵
expect(result).toEqual({ data: 'g1', error: null }) // 【検証項目】: ActionResult 戻り値契約 🔵
```

### TC2 実装コメント例（核心・明示変換）

```ts
// 【テスト目的】: DB invitation_not_found が INVITATION_NOT_FOUND_BY_LINK に詰め替えられ notice が正しい文言に解決されることを確認
// 【テスト内容】: notice.value === 'errors.invitation_not_found_by_link' / generic でない / Sentry 非報告 / refresh 非呼出
// 【期待される動作】: EDGE-005 明示変換が効いて fallthrough（errors.generic）に落ちないことを担保
// 🔵 TASK-0011.md §単体テスト要件 TC2 / architecture.md 注2 / EDGE-005

// 【テストデータ準備】: rpc を DB 生メッセージ invitation_not_found のエラーで固定
rpcMock.mockResolvedValue({ data: null, error: { message: 'invitation_not_found' } })

// 【実際の処理実行】: useJoinGroup().join('badcode') を await
const { join, notice } = useJoinGroup()
const result = await join('badcode')

// 【結果検証】: notice が詰め替え後キーに解決 / generic 否定 / Sentry 非報告 / refresh 非呼出
expect(notice.value).toBe('errors.invitation_not_found_by_link') // 【検証項目】: 詰め替え成功で正しいキーに解決 🔵
expect(notice.value).not.toBe('errors.generic') // 【検証項目】: fallthrough していない（核心の否定証明） 🔵
expect(vi.mocked(Sentry.captureException)).not.toHaveBeenCalled() // 【検証項目】: 詰め替え成功 = Sentry 非報告 🔵
expect(refreshMock).not.toHaveBeenCalled() // 【検証項目】: エラー時 refresh 非呼出 🔵
expect(result).toEqual({ data: null, error: { message: 'invitation_not_found' } }) // 【検証項目】: 戻り値の error は元のまま 🔵
```

### TC3 / TC4 実装コメント例（文字列一致パス）

```ts
// 【テスト目的】: already_in_group / invitation_expired は詰め替え不要で notice が対応文言に解決されることを確認
// 【テスト内容】: notice.value === 'errors.already_in_group'（/ 'errors.invitation_expired'）/ Sentry 非報告 / refresh 非呼出
// 🔵 TASK-0011.md §単体テスト要件 TC3 / TC4

rpcMock.mockResolvedValue({ data: null, error: { message: 'already_in_group' } }) // TC4 は 'invitation_expired'
const { join, notice } = useJoinGroup()
const result = await join('code')

expect(notice.value).toBe('errors.already_in_group') // 【検証項目】: 文字列一致パスで対応キーに解決 🔵
expect(vi.mocked(Sentry.captureException)).not.toHaveBeenCalled() // 【検証項目】: マッピング済で Sentry 非報告 🔵
expect(refreshMock).not.toHaveBeenCalled() // 【検証項目】: エラー時 refresh 非呼出 🔵
expect(result).toEqual({ data: null, error: { message: 'already_in_group' } }) // 【検証項目】: 戻り値契約 🔵
```

### セットアップ・クリーンアップのコメント

```ts
beforeEach(() => {
  // 【テスト前準備】: 全 mock の呼び出し履歴をクリアし TC 間の相互干渉を防ぐ
  // 【環境初期化】: refreshMock の mockResolvedValue / t のキー透過 / te の false を再設定
  vi.clearAllMocks()
  refreshMock.mockResolvedValue(undefined)
  tFn.mockImplementation((key: string) => key)
  teFn.mockReturnValue(false)
})
```

---

## 6. tdd-red フェーズへの注意点

1. **【最重要】方式 A の肝: `useNoticeErrors` / `useErrorMessage` を mock しない**
   - `#imports` mock のオブジェクトに `useNoticeErrors` / `useErrorMessage` を **含めない**（含めると差し替わり、`notice.value` の実解決を検証できず方式 A が崩壊する）。
   - `useNoticeErrors` 内部は `ref`（`#imports`）と `useErrorMessage`（実物）に依存し、`useErrorMessage` は `useI18n`（`vue-i18n` mock）と `@sentry/nuxt`（mock）に依存する。この依存チェーンが実物で解決されることを red 実行時に確認する。

2. **Nuxt Vite transform による解決崩れに注意**
   - `useNoticeErrors` / `useErrorMessage` が `~/composables/...` 直接パスに transform され、その内部の auto-import（`ref` / `useI18n`）が解決できず落ちる可能性がある。
   - その場合、`#imports` mock に `ref` を含める（既に含めている）ことに加え、`useI18n` は `vue-i18n` mock 側で解決されることを確認する。`useErrorMessage.test.ts` が `vue-i18n` 直接 mock で `t`/`te` を解決している実績があるため、同方式で解決可能。
   - もし `useNoticeErrors` の `ref` が `#imports` 経由で解決されず落ちる場合は、`vi.mock('#imports')` 内に `useErrorMessage`（実物を importOriginal で再 export）を含める調整は **避け**、代わりに `ref` の解決経路（`vue` 直接 import への transform 有無）を red のエラーメッセージから特定して最小調整する。

3. **TC2 の二重証明を必ず両方残す**
   - `expect(notice.value).toBe('errors.invitation_not_found_by_link')`（肯定）と `expect(Sentry.captureException).not.toHaveBeenCalled()`（否定）の **両方**を残す。詰め替えバグ時は前者が `errors.generic` になり後者も失敗するため、二重に回帰を捕捉できる。

4. **戻り値の error は「元のエラー」**
   - 詰め替え（`mapped`）は `setNotice` に渡す notice 解決用であり、`join` の戻り値 `{ data, error }` の `error` は **RPC が返した元のエラー**（`{ message: 'invitation_not_found' }`）であることに注意（実装スケルトン TASK-0011.md L68 `return { data, error }`）。TC2 の戻り値 assert は元メッセージで検証する。

5. **RPC 引数キーは `invite_code`**
   - `p_invite_code` 等ではなく `invite_code`（TASK-0011.md L53）。TC1 で厳密に assert する。

6. **最小 4 ケースを厳守**
   - feedback_test_coverage により TC1〜TC4 の 4 ケースのみ。境界値・冗長ケースは追加しない（§3 参照）。

---

## 7. 要件定義との対応関係

- **参照した機能概要**: use-join-group-requirements.md §1（招待コードによる Group 参加 Write composable、DB↔App 文字列不一致の吸収）
- **参照した入力・出力仕様**: use-join-group-requirements.md §2（`join(inviteCode)` / `UseJoinGroupReturn` / `ActionResult<string>`）
- **参照した制約条件**: use-join-group-requirements.md §3（エラーハンドリング制約 = EDGE-005 明示変換、i18n 集約、pending 二重送信防止）
- **参照した使用例**: use-join-group-requirements.md §4（正常系 = REQ-005、異常系 = EDGE-005 / REQ-105 / REQ-106）
- **参照したタスク定義**: TASK-0011.md §単体テスト要件 TC1〜TC4 / §完了条件 7 項目 / §注意事項（明示判定の非自明点）
- **参照した実装資産**: `app/composables/useErrorMessage.ts`（App 識別子 7 分岐 + fallthrough）/ `app/composables/useNoticeErrors.ts`（setNotice = errorToMessage ラッパ）/ `app/types/error-codes.ts`（`isAppError` includes 判定 / `APP_ERROR_CODES`）
- **参照したテストパターン資産**: `tests/unit/composables/useErrorMessage.test.ts`（t/te mock）/ `tests/unit/composables/useCreateGroup.test.ts`（rpc / refresh / composable mock）/ `tests/unit/composables/useNoticeErrors.test.ts`（notice state 検証）

---

## 品質判定

```
✅ 高品質:
- テストケース分類: 正常系 1（TC1）/ 異常系 3（TC2 核心 / TC3 / TC4）/ 境界値は既存 TC に内包（冗長回避の根拠明記）で網羅
- 期待値定義: 各 TC の期待値が具体的（notice.value のキー文字列・refresh 呼出回数・Sentry 非報告・戻り値形状まで確定）
- 技術選択: TypeScript + Vitest 確定、mock 方式 A を根拠付きで確定
- 実装可能性: 依存 composable 全て実装済、既存テスト 2 資産の組合せで実現可能
- 信頼性レベル: 🔵 大多数（TC1〜TC4 全て 🔵）、🟡 は境界値非追加の方針判断のみ
```

**信頼性レベル分布**: 🔵 TC1 / TC2 / TC3 / TC4 + 言語・FW（5 項目）／ 🟡 境界値ケース非追加の方針（1 項目）／ 🔴 なし

**テストケース件数サマリー**:

| 区分 | 件数 | ケース |
|---|---|---|
| 正常系 | 1 | TC1（成功 + refresh + notice null） |
| 異常系 | 3 | TC2（invitation_not_found 明示変換・核心） / TC3（already_in_group） / TC4（invitation_expired） |
| 境界値 | 0 | 既存 TC に内包（冗長回避） |
| **合計** | **4** | |
