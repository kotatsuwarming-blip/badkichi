# TASK-0010 useCreateGroup（RPC） TDD テストケース定義書

**機能名**: useCreateGroup（RPC）
**タスクID**: TASK-0010
**要件名**: auth-onboarding
**フェーズ**: Phase 2 - ドメインロジック層
**作成日**: 2026-06-01
**テストファイル**: `tests/unit/composables/useCreateGroup.test.ts`

---

## 0. テスト方針サマリー

`useCreateGroup` は `create_group_with_owner` RPC を内包する Write 系 composable。テストは **最小カバレッジ 2 ケース**（成功 / `invalid_group_name`）で「成功・失敗の分岐代表」を押さえる（memory: `feedback_test_coverage`「最小境界値 + 分岐網羅のみ、冗長ケースなし」）。

- **対象**: `create(groupName)` の RPC 引数検証・`refresh` 呼び出し有無・`fieldErrors` 反映・戻り値契約
- **mock 対象**: `useSupabaseClient`（`rpc` spy）/ `useCurrentGroup`（`refresh` spy）/ `useFormErrors`（`setFieldError` / `clear` spy）
- **対象外**: RPC 本体ロジック（owner 自動登録 / `invalid_group_name` 発火）は data-foundation (TASK-0018) で検証済み（ADR-012 D2）。`pending` の finally リセットは実装担保（追加テストは最小判断で行わない — note.md §注意事項・指示書方針）。

---

## 1. 正常系テストケース（基本的な動作）

### TC1: 成功 → 引数検証 + refresh 呼出 + 戻り値 `{ data:'g1', error:null }`

- **テスト名**: create 成功時に RPC を正しい引数で呼び、所属状態を refresh し、group_id を返す
  - **何をテストするか**: `create('チームA')` が `rpc('create_group_with_owner', { group_name: 'チームA' })` を呼び出し、RPC 成功後に `useCurrentGroup().refresh()` を呼び、戻り値が `{ data: 'g1', error: null }` であること
  - **期待される動作**: RPC が `{ data: 'g1', error: null }` を返す経路で、引数名 `group_name` で RPC が 1 回呼ばれ、`refresh` が 1 回呼ばれ、戻り値が ActionResult 契約に一致する
- **入力値**: `create('チームA')`、`rpc` mock → `{ data: 'g1', error: null }`
  - **入力データの意味**: `'チームA'` は 1〜50 文字・空白なしの正常なグループ名の代表値（日本語名で実運用に近い）。`{ data: 'g1', error: null }` は RPC 成功時の supabase 戻り値形状（`data` = 新規 group_id）
- **期待される結果**:
  - `rpc` が `('create_group_with_owner', { group_name: 'チームA' })` で 1 回呼ばれる（引数名 `group_name`、`p_group_name` は誤記）
  - `refresh` が 1 回呼ばれる（成功時のみ最新化、D5-4）
  - `setFieldError` は呼ばれない（成功経路ではエラーチャネルを使わない）
  - 戻り値が `{ data: 'g1', error: null }`
  - **期待結果の理由**: dataflow.md §3 D5-4 で「成功時に `useCurrentGroup().refresh()` を await して所属状態を最新化」と定義。戻り値は interfaces.ts `ActionResult<string>`（`data` = group_id）。
- **テストの目的**: 成功パスの 4 つの契約（RPC 引数名・refresh 呼出・エラーチャネル不使用・戻り値形状）を一括検証する
  - **確認ポイント**: 引数名が `group_name` であること（最頻の罠）。`refresh` が成功時にのみ呼ばれること。
- 🔵 *要件定義書 §7 TC1 / TASK-0010.md §単体テスト要件 TC1 / dataflow.md §3 D5-4 / interfaces.ts §5 を直接参照*

---

## 2. 異常系テストケース（エラーハンドリング）

### TC2: invalid_group_name → setFieldError('name', error) + fieldErrors 反映 + refresh 非呼出

- **テスト名**: create が invalid_group_name エラー時に inline フィールドエラーを載せ、refresh を呼ばない
  - **エラーケースの概要**: RPC が `invalid_group_name` エラーを返したとき（CHECK 制約違反の二重防御）、`useFormErrors` の inline チャネルにエラーを載せ、所属状態の refresh は行わない
  - **エラー処理の重要性**: 検証エラーは `<UFormField>` の inline 表示でユーザに修正を促す（REQ-109 / NFR-201）。エラー時に refresh を呼ぶと無意味なクエリ・stale 更新が走るため、否定アサーションで「呼ばれないこと」を保証する必要がある
- **入力値**: `create('')`、`rpc` mock → `{ data: null, error: { message: 'invalid_group_name' } }`
  - **不正な理由**: `''`（空文字）は group-name schema（1〜50 文字 / 空白不可）に違反する。page 側 Zod 事前検証をすり抜けた場合の RPC 側二重防御を再現する
  - **実際の発生シナリオ**: 事前検証バイパス・並行リクエスト・DB CHECK 制約と Zod 規則の差分などで RPC が `invalid_group_name` を返す場面
- **期待される結果**:
  - `setFieldError` が `('name', error)` で呼ばれる（`error` は RPC の error オブジェクトをそのまま渡す = 文言変換は useFormErrors 内部責務、責務分離）
  - `fieldErrors.value['name']` が非 undefined になる（実物 or mock の setFieldError が state に反映する）
  - `refresh` が呼ばれない（**否定アサーション** `not.toHaveBeenCalled()`）
  - 戻り値が `{ data: null, error: { message: 'invalid_group_name' } }`
  - **エラーメッセージの内容**: 文言生成（i18n 変換）は useFormErrors → useErrorMessage の責務であり、useCreateGroup は error をそのまま `setFieldError('name', error)` へ渡すことのみを検証する（useLogin.test.ts TC3 の責務分離方針を踏襲）
  - **システムの安全性**: エラー時に refresh を呼ばないことで、無効な作成試行後に余計な状態更新が走らないことを保証する
- **テストの目的**: 失敗パスの 3 つの契約（setFieldError 呼出・fieldErrors 反映・refresh 非呼出）を検証する
  - **品質保証の観点**: 否定アサーション（refresh 非呼出）により、成功・失敗の分岐が正しく排他であることを担保する
- 🔵 *要件定義書 §7 TC2 / TASK-0010.md §単体テスト要件 TC2 / REQ-109 / architecture.md §既存 API マッピング 注1 を直接参照*

---

## 3. 境界値テストケース（最小値、最大値、null等）

本タスクは memory `feedback_test_coverage`（最小境界値 + 分岐網羅のみ・冗長禁止）および指示書方針に従い、**追加の境界値テストは設けない**。理由は以下:

- **入力境界（1 文字 / 50 文字 / 空白）**: group-name の長さ・空白検証は TASK-0006 Zod schema の責務で、そのテストは TASK-0006 で実施済み。useCreateGroup は文字列をそのまま RPC へ渡すだけで境界判定ロジックを持たないため、ここで再検証するのは冗長。
- **RPC 戻り値境界（成功 / invalid_group_name）**: TC1 / TC2 が分岐の両端を網羅済み。`groups.name` に UNIQUE 制約がないため `GROUP_NAME_TAKEN` / `UNIQUE_VIOLATION` 分岐は到達不能で、追加ケースは存在しない（architecture.md §既存 API マッピング 注1）。
- **`pending` の境界（true→false）**: try/finally による false リセットは実装担保。エラー時も finally で false に戻る挙動はコードレビューで担保し、テストは最小判断で追加しない（note.md §6 確定事項 4・指示書「pending finally リセットは実装担保」）。

🔵 *memory feedback_test_coverage + 要件定義書 §7（最小カバレッジ 2 ケース）+ 指示書方針を直接参照*

---

## 4. 開発言語・フレームワーク

- **プログラミング言語**: TypeScript（strict mode）
  - **言語選択の理由**: プロジェクト全体が Nuxt 4 + Vue 3 + TypeScript strict（CLAUDE.md）。composable・RPC 引数・戻り値の型整合（`UseCreateGroupReturn` / `ActionResult<string>` / 生成型 `create_group_with_owner`）を型レベルで担保するため
  - **テストに適した機能**: ジェネリクス（`ActionResult<string>`）と生成型による静的検査でテストの型崩れを早期検出できる
- **テストフレームワーク**: Vitest + @nuxt/test-utils（`defineVitestConfig`）
  - **フレームワーク選択の理由**: 既存 unit テスト（useLogin / useFormErrors）が Vitest で統一（ADR-012 D5）。`vi.hoisted` + `vi.mock` で auto-import composable を差し替える既存パターンをそのまま流用できる
  - **テスト実行環境**: `vitest.config.ts` の include `tests/unit/**/*.test.ts`。alias で `#supabase-client` / `#nuxt-router` を安定解決
- 🔵 *vitest.config.ts / tests/unit/composables/useLogin.test.ts / CLAUDE.md を直接参照*

---

## 5. テストケース実装時の mock 戦略・日本語コメント指針

### 5.1 mock 戦略（useLogin.test.ts / useFormErrors.test.ts 踏襲）

1. **vi.hoisted**: ファイル先頭で `rpcMock` / `refreshMock` / `setFieldErrorMock` / `clearMock` / `fieldErrorsRef` を先に評価（TDZ 回避）
   - `rpcMock`: `vi.fn()`。各テストで `.mockResolvedValue({ data, error })` を上書き
   - `refreshMock`: `vi.fn().mockResolvedValue(undefined)`（await される）
   - `setFieldErrorMock`: `vi.fn((field, _error) => { fieldErrorsRef.value[field] = 'mocked_message' })`（state 反映を再現し `fieldErrors.value['name']` 非 undefined を成立させる）
   - `clearMock`: `vi.fn()`
   - `fieldErrorsRef`: `{ value: {} as Record<string, string> }`（ref 互換の最小スタブ）
2. **vi.mock('#imports')**: `ref` は `importOriginal('vue')` の実物、`useSupabaseClient: () => ({ rpc: rpcMock })`、`useCurrentGroup: () => ({ refresh: refreshMock })`、`useFormErrors: () => ({ fieldErrors: fieldErrorsRef, setFieldError: setFieldErrorMock, clear: clearMock })`
3. **vi.mock('#supabase-client')**: `useSupabaseClient: () => ({ rpc: rpcMock })`（Nuxt Vite transform が auto-import を実パスに変換するケースへの保険。useLogin.test.ts と同型。alias は vitest.config.ts 定義）
4. **vi.mock('~/composables/useCurrentGroup')** / **vi.mock('~/composables/useFormErrors')**: composable ファイル直接 mock（`refresh` / `setFieldError` / `clear` / `fieldErrors` を同じ spy で expose）
5. **beforeEach**: `vi.clearAllMocks()` + `fieldErrorsRef.value = {}`（TC 間で state が漏れないようリセット）

> 補足: vitest.config.ts の alias 状況に応じて `#supabase-client` mock の要否は green フェーズで実コードを動かして確定する（useLogin は必要だった）。`useCurrentGroup` / `useFormErrors` は composable ファイル直接 mock を基本線とする。

### 5.2 日本語コメント指針

```typescript
// 【テスト目的】: [このテストで何を確認するか]
// 【テスト内容】: [具体的にどの処理をテストするか]
// 【期待される動作】: [正常動作時の結果]
// 🔵🟡🔴 信頼性レベル
```

```typescript
beforeEach(() => {
  // 【テスト前準備】: スパイ呼び出し履歴をクリアしてテスト間干渉を防ぐ
  // 【環境初期化】: fieldErrorsRef.value を空に戻し、前 TC のエラー state を漏らさない
  vi.clearAllMocks()
  fieldErrorsRef.value = {}
})
```

```typescript
// 【テストデータ準備】: rpc を成功戻り値 { data:'g1', error:null } で固定する理由（成功パス再現）
// 【実際の処理実行】: useCreateGroup().create('チームA') を await
// 【結果検証】: rpc 引数 / refresh 呼出 / 戻り値を expect で検証
```

### 5.3 expect ステートメント例

```typescript
// TC1
expect(rpcMock).toHaveBeenCalledWith('create_group_with_owner', { group_name: 'チームA' }) // 【検証】: 引数名 group_name で 1 回 🔵
expect(refreshMock).toHaveBeenCalledTimes(1) // 【検証】: 成功時に refresh 1 回 🔵
expect(setFieldErrorMock).not.toHaveBeenCalled() // 【検証】: 成功時はエラーチャネル不使用 🔵
expect(result).toEqual({ data: 'g1', error: null }) // 【検証】: ActionResult 戻り値契約 🔵

// TC2
const rpcError = { message: 'invalid_group_name' }
expect(setFieldErrorMock).toHaveBeenCalledWith('name', rpcError) // 【検証】: name フィールドへ error をそのまま渡す 🔵
expect(fieldErrors.value['name']).not.toBeUndefined() // 【検証】: fieldErrors['name'] に文言が載る 🔵
expect(refreshMock).not.toHaveBeenCalled() // 【検証】: エラー時 refresh を呼ばない（否定アサーション）🔵
expect(result).toEqual({ data: null, error: rpcError }) // 【検証】: ActionResult 戻り値契約 🔵
```

---

## 6. 要件定義との対応関係

- **参照した機能概要**: 要件定義書 §1（グループ作成 composable）/ §0 サマリー
- **参照した入力・出力仕様**: 要件定義書 §2.3〜§2.5（`create` 入力・`ActionResult<string>` 出力・RPC 呼び出し仕様）/ interfaces.ts §3 `ActionResult<T>` / §5 `UseCreateGroupReturn`
- **参照した制約条件**: 要件定義書 §3（エラーチャネル inline 限定 / エラー種別 invalid_group_name のみ / 二重送信防止 / 成功時のみ refresh）
- **参照した使用例**: 要件定義書 §4.1（成功）/ §4.2（invalid_group_name）/ §4.3（二重送信防止）
- **参照したテストケース概要**: 要件定義書 §7（TC1 / TC2 最小カバレッジ）/ TASK-0010.md §単体テスト要件
- **参照したEARS要件**: REQ-004（グループ作成）/ REQ-109（inline 検証エラー）/ NFR-201 / EDGE-003

---

## 7. テストケース一覧（区分・件数）

| # | 区分 | テスト名 | 主アサーション | 信頼性 |
|---|---|---|---|---|
| TC1 | 正常系 | create 成功 | rpc 引数 `group_name` / refresh 呼出 / `{ data:'g1', error:null }` | 🔵 |
| TC2 | 異常系 | invalid_group_name | `setFieldError('name', error)` / `fieldErrors['name']` 非 undefined / refresh **非**呼出 | 🔵 |

- **正常系**: 1 件
- **異常系**: 1 件
- **境界値**: 0 件（理由は §3 — Zod 責務・到達不能分岐・pending は実装担保のため最小判断で追加なし）
- **合計**: 2 件

---

## 8. 信頼性レベルサマリー

| カテゴリ | 🔵 | 🟡 | 🔴 | 合計 |
|---|---|---|---|---|
| 1. 正常系（TC1） | 1 | 0 | 0 | 1 |
| 2. 異常系（TC2） | 1 | 0 | 0 | 1 |
| 3. 境界値方針 | 1 | 0 | 0 | 1 |
| 4. 言語・FW | 1 | 0 | 0 | 1 |
| **合計** | **4** | **0** | **0** | **4** |

- 🔵 100% / 🟡 0% / 🔴 0%

**品質判定**: ✅ 高品質
- テストケース分類: 正常系・異常系が分岐の両端を網羅、境界値は方針として除外理由を明記
- 期待値定義: 各 expect の値・否定アサーションまで具体化
- 技術選択: TypeScript + Vitest 確定（既存テスト踏襲）
- 実装可能性: mock 戦略（vi.hoisted + vi.mock）が既存パターンで実証済み
- 信頼性レベル: 🔵 100%（要件定義書・タスクファイル・既存テストを直接参照）
