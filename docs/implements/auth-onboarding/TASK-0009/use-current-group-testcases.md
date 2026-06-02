# TASK-0009: useCurrentGroup（Read）— TDD テストケース定義書

**機能名**: useCurrentGroup（現在の所属 Group 読み取り composable）
**タスク ID**: TASK-0009
**要件名**: auth-onboarding
**フェーズ**: Phase 2 - ドメインロジック層
**作成日**: 2026-06-01
**テストファイル**: `tests/unit/composables/useCurrentGroup.test.ts`

---

## 0. テスト方針サマリー

- 🔵 **最小カバレッジ（境界 2 ケース）**: memory `feedback_test_coverage`（最小境界値 + 分岐網羅のみ・冗長禁止）と note.md §5 / requirements.md §7 / TASK-0009.md §単体テスト要件に従い、**正常系 2 ケースのみ**を定義する。
  - **TC1（所属あり）**: `maybeSingle()` が 1 行を返す → `data.value` が `{ group_id, groups }`、`eq('user_id', 'u1')` で呼ばれる。
  - **TC2（未所属）**: `maybeSingle()` が `{ data: null, error: null }` → `data.value` が `null`（例外を投げない）。
- 🔵 **このタスクで異常系・追加境界値を増やさない理由**: クエリエラーは「そのまま throw（error.vue フォールバックに委譲）」が責務であり、本 composable はエラー整形・分岐を持たない（requirements.md §3）。uid 不在（未認証）の即時 null も TC2 の `data:null` 経路と検証構造が重複するため、冗長回避（memory `feedback_test_coverage`）で独立ケースにしない。これらは「3. 異常系・境界値の取り扱い方針」に明記し、将来必要時の追加方針として残す。

---

## 1. 正常系テストケース（基本的な動作）

### TC1: Group 所属 → `{ group_id, groups }` が返り、`eq('user_id','u1')` で呼ばれる

- **テスト名**: 所属ありユーザの SELECT 結果が data.value に反映され、uid で絞り込まれる
  - **何をテストするか**: `useSupabaseUser().value.sub = 'u1'` のとき、`from('group_members').select('group_id, groups(id, name)').eq('user_id','u1').maybeSingle()` が実行され、その `data` が `useCurrentGroup()` の `data.value` にそのまま返ること。
  - **期待される動作**: handler が PostgREST SELECT を 1 回実行し、`eq('user_id', 'u1')`（uid で絞り込み）を呼び、`maybeSingle()` の `data` を返却する。例外は発生しない。
- **入力値**:
  - `useSupabaseUser().value = { sub: 'u1' }`
  - `maybeSingle()` の返り値 mock = `{ data: { group_id: 'g1', groups: { id: 'g1', name: 'チームA' } }, error: null }`
  - **入力データの意味**: `sub: 'u1'` は「認証済みユーザの uid（JWT の `sub` claim、`user.id` ではない）」を代表（memory `project_mvp_revised_scope`）。`{ group_id: 'g1', groups: { id: 'g1', name: 'チームA' } }` は ADR-006「1 user = 1 group」で保証される単数所属行の代表値（requirements.md §2 / §7・TASK-0009.md TC1）。
- **期待される結果**:
  - `data.value` === `{ group_id: 'g1', groups: { id: 'g1', name: 'チームA' } }`
  - `eq` mock が `('user_id', 'u1')` で呼ばれている
  - `error.value` が null（throw されない）
  - **期待結果の理由**: handler は `data` をそのまま返すだけの薄いラッパ（TASK-0009.md 実装スケルトン L48-54）。`eq('user_id', uid)` は uid 絞り込みが正しい列・値で行われたことの検証であり、RLS 任せでも「自ユーザ行を要求している」ことを保証する（requirements.md §2 入出力の関係性）。
- **テストの目的**: 所属あり経路で「SELECT 結果の素通し」と「uid 絞り込みの正しさ」を確認する。
  - **確認ポイント**: (1) `data.value` がオブジェクト同値であること、(2) `eq` の引数が `'user_id', 'u1'`（列名と uid=sub）であること。
- 🔵 信頼性: REQ-005 + interfaces.ts `CurrentGroup` + architecture.md §既存 API マッピング + TASK-0009.md TC1（資料に明記、推測なし）

---

### TC2: 未所属 → `null` が返る（例外を投げない）

- **テスト名**: 0 行（未所属）のとき data.value が null になり例外が発生しない
  - **何をテストするか**: `maybeSingle()` が `{ data: null, error: null }`（0 行＝未所属）を返すとき、`useCurrentGroup()` の `data.value` が `null` になり、`error.value` が null のまま（throw されない）であること。
  - **期待される動作**: handler は `data`（= null）をそのまま返す。`if (error) throw error` の分岐は通らない（`error` が null のため）。
- **入力値**:
  - `useSupabaseUser().value = { sub: 'u1' }`
  - `maybeSingle()` の返り値 mock = `{ data: null, error: null }`
  - **入力データの意味**: `.maybeSingle()` の「0 行 → `{ data: null, error: null }`」は PostgREST/supabase-js の正常な未所属表現（ADR-006 で 1 user = 1 group が保証されるため、複数行例外は構造的に発生しない）。これは「未所属」という正常状態の境界値（requirements.md §4 エッジケース「0 行」）。
- **期待される結果**:
  - `data.value` === `null`
  - `error.value` が null（例外を投げない）
  - **期待結果の理由**: `.maybeSingle()` の 0 行は正常値であり、未所属は middleware 側で join/onboarding へ誘導する正常分岐（requirements.md §4・TASK-0009.md TC2）。本 composable は null を素通しするだけでエラーにしない。
- **テストの目的**: 未所属（0 行）が例外ではなく `null` という正常値として扱われる境界挙動を確認する。
  - **確認ポイント**: `data.value === null` かつ throw が発生しないこと（`error.value` が null）。
- 🔵 信頼性: ADR-006（1 user = 1 group）+ `.maybeSingle()` の 0 行挙動 + TASK-0009.md TC2（資料に明記、推測なし）

---

## 2. mock 戦略（tdd-red 実装仕様）

> requirements.md §7・note.md §5・TASK-0009.md §単体テスト要件 + 既存 `tests/unit/composables/useLogin.test.ts` の実証パターンを踏襲する。

### 2.1 mock 対象（3 つ）

| # | 対象 | mock 内容 |
|---|------|-----------|
| 1 | `useSupabaseClient<Database>()` | `from().select().eq().maybeSingle()` の 4 段チェーンを返すオブジェクト。`maybeSingle` は `{ data, error }` を resolve する `vi.fn()`。`eq` は引数検証用に `vi.fn()` でスパイし、`maybeSingle` を持つオブジェクトを返す。 |
| 2 | `useSupabaseUser()` | `{ value: { sub: 'u1' } }` 互換の ref スタブ（`.value.sub` で uid を返す）。 |
| 3 | `useAsyncData(key, handler)` | **handler 即時実行スタブ**。`handler()` を即時 await し、`data: ref(result)` / `error: ref(null)` / `pending: ref(false)` / `refresh` を持つ `AsyncState` 互換オブジェクトを返す。handler が throw した場合は `error.value` に格納（または再 throw）する。固定キー `'current-group'` が第 1 引数で渡されることも検証可能。 |

### 2.2 チェーン mock の形（参考スケルトン）

```typescript
// 【from().select().eq().maybeSingle() チェーン】: 各段を vi.fn() で返し、eq の引数を検証可能にする
const maybeSingleMock = vi.fn() // 各 TC で mockResolvedValue({ data, error }) を上書き
const eqMock = vi.fn(() => ({ maybeSingle: maybeSingleMock }))
const selectMock = vi.fn(() => ({ eq: eqMock }))
const fromMock = vi.fn(() => ({ select: selectMock }))

const supabaseClientStub = { from: fromMock }
```

### 2.3 useAsyncData 即時実行スタブ（参考スケルトン）

```typescript
// 【useAsyncData スタブ】: 第 2 引数 handler を即時実行し AsyncState 互換を返す
// 固定キー 'current-group'（第 1 引数）が渡ることも mock.calls で検証できる
const useAsyncDataMock = vi.fn(async (_key: string, handler: () => Promise<unknown>) => {
  const errorRef = ref<Error | null>(null)
  let data: unknown = null
  try {
    data = await handler()
  } catch (e) {
    errorRef.value = e as Error
  }
  return {
    data: ref(data),
    pending: ref(false),
    error: errorRef,
    refresh: vi.fn()
  }
})
```

### 2.4 mock 配線方針（useLogin.test.ts 踏襲）

- 🔵 `vi.hoisted()` で `fromMock` / `eqMock` / `maybeSingleMock` / `useAsyncDataMock` / `userRef` を先に定義（TDZ 回避）。
- 🔵 `vi.mock('#imports', ...)` で `ref`（vue 実物）/ `useSupabaseClient` / `useSupabaseUser` / `useAsyncData` を差し替え。
- 🟡 Nuxt Vite transform が auto-import を実パスへ直接変換する場合に備え、useLogin.test.ts と同様に `#supabase-client` の alias mock が必要になる可能性がある（`useSupabaseClient` / `useSupabaseUser` を `@nuxtjs/supabase` 実パス経由で差し替え）。`useAsyncData` は Nuxt core の auto-import のため、`#imports` mock で効かなければ `#app` 系 alias の追加検討が必要（tdd-red で実測確認）。
- 🔵 `beforeEach(() => { vi.clearAllMocks() })` でテスト間隔離（毎 TC で `maybeSingleMock.mockResolvedValue(...)` を再設定）。

### 2.5 各フェーズの日本語コメント指針（実装時必須）

```typescript
// 【テスト目的】: TC1 = 所属あり SELECT 結果の素通しと uid 絞り込み検証 / TC2 = 0 行 null 素通し検証
// 【テスト内容】: maybeSingle の返り値を切り替え、data.value と eq 引数を確認する
// 【期待される動作】: TC1 → data.value がオブジェクト同値 + eq('user_id','u1') / TC2 → data.value === null
// 🔵 REQ-005 / ADR-006

// Given（準備）:
// 【テストデータ準備】: maybeSingleMock.mockResolvedValue({ data, error }) で行有無を切り替える
// 【初期条件設定】: userRef.value = { sub: 'u1' }（uid = sub、user.id ではない）
// 【前提条件確認】: useAsyncData スタブが handler を即時実行する状態

// When（実行）:
// 【実際の処理実行】: useCurrentGroup() を呼び、useAsyncData スタブ経由で handler を解決する
// 【処理内容】: handler が from().select().eq().maybeSingle() を実行し data を返す
// 【実行タイミング】: composable 呼び出し時に固定キー 'current-group' で 1 回だけ実行

// Then（検証）:
// 【結果検証】: data.value と eq 呼び出し引数（TC1）/ data.value === null（TC2）
// 【期待値確認】: TC1 はオブジェクト同値、TC2 は null かつ error.value が null
// 【品質保証】: 所属/未所属の分岐網羅で middleware・page の上流挙動を担保
```

---

## 3. 異常系・境界値の取り扱い方針（このタスクで独立ケースを作らない理由）

> memory `feedback_test_coverage`（最小境界値 + 分岐網羅のみ・冗長禁止）に基づく明示判断。下記は「検証対象だが TC として独立させない」項目。

- 🔵 **クエリエラー（RLS 拒否 / ネットワーク / PostgREST エラー）**: 本 composable の責務は `if (error) throw error` でそのまま throw し `error.vue` グローバルフォールバックに委ねること（requirements.md §3 / §4 エラーケース）。エラー整形・分岐ロジックを持たないため、「throw が起きること」自体は実装が 1 行の透過処理であり、独立 TC を作っても検証価値が低い（冗長）。**将来 error 透過の回帰防止が必要になった場合のみ** 「TC3: error 非 null → throw（data を返さない）」を追加する方針。
- 🔵 **uid 不在（未認証 / `/confirm` 等で user 未解決）**: `user.value?.sub` が `undefined` → handler 即時 `return null`（クエリ未発行）。返り値は TC2 と同じ「`data.value === null`」であり、検証構造が重複する。クエリ未発行の確認が必要になった場合のみ 「TC4: uid undefined → `from` が呼ばれず data.value === null」を追加する方針（`fromMock` が呼ばれないことの検証で TC2 と差別化可能）。
- 🟡 **groups embed の null（型上 nullable）**: requirements.md §5 で `CurrentGroup.groups` は `Pick<...> | null` に確定済（生成型を真とする）。型レベルの制約であり、ランタイム挙動テストの対象外（型チェックは `pnpm typecheck` が担保）。TC として作らない。

---

## 4. 開発言語・フレームワーク

- **プログラミング言語**: TypeScript（strict mode）
  - **言語選択の理由**: プロジェクト全体が Nuxt 4 + Vue 3 + TypeScript strict（CLAUDE.md / note.md §1）。composable も型安全な `AsyncState<CurrentGroup>` を返すため TS 必須。
  - **テストに適した機能**: 型推論により mock の `{ data, error }` 形・`AsyncState` 戻り値の構造をコンパイル時に検証できる。
- **テストフレームワーク**: Vitest（+ `@nuxt/test-utils` の `defineVitestConfig`）
  - **フレームワーク選択の理由**: ADR-012 D5 で単体テストは Vitest に確定。既存 composable テスト（useLogin / useErrorMessage 等）が Vitest で実装済みでパターンを踏襲できる。
  - **テスト実行環境**: `tests/unit/` 配下、`vitest.config.ts`（alias `#nuxt-router` / `#supabase-client` 定義済）。integration とはファイル名（`*.integration.test.ts`）で分離（memory `feedback_test_layer_separation`）。
- 🔵 信頼性: note.md §1 / §5 + ADR-012 D5 + 既存 useLogin.test.ts（資料に明記）

---

## 5. 要件定義との対応関係

- **参照した機能概要**: requirements.md §1（所属 Group を 1 件読み取る Read composable / 未所属は null）
- **参照した入力・出力仕様**: requirements.md §2（暗黙入力 `useSupabaseUser().value?.sub` / `useSupabaseClient` / クエリ `from('group_members').select('group_id, groups(id, name)').eq('user_id', uid).maybeSingle()` / 戻り値 `AsyncState<CurrentGroup>`）
- **参照した制約条件**: requirements.md §3（NFR-002 固定キー `'current-group'` / ADR-006 単数保証 / throw のみ / embed null 維持）
- **参照した使用例**: requirements.md §4（所属あり / 未所属 / EDGE uid 不在・0 行 / クエリエラー）
- **参照した単体テスト要件**: requirements.md §7・TASK-0009.md §単体テスト要件（TC1 / TC2 + mock 戦略）
- **参照した設計文書**: interfaces.ts（`CurrentGroup` / `AsyncState` / `UseCurrentGroupReturn`）、architecture.md §既存 API マッピング、ADR-006 / ADR-007 / ADR-008 D4 / ADR-012 D5
- **参照した既存実装**: `tests/unit/composables/useLogin.test.ts`（vi.hoisted + vi.mock('#imports') + alias mock パターン）

---

## 6. 品質判定

- ✅ **高品質**
  - **テストケース分類**: 正常系 2 ケース（所属あり / 未所属）を網羅。異常系・追加境界値は「§3 取り扱い方針」で冗長回避を明示判断（memory `feedback_test_coverage` 準拠）。所属/未所属の分岐網羅は達成。
  - **期待値定義**: 各 TC の入力（`sub`・`maybeSingle` 返り値）と期待値（`data.value` 同値 / null、`eq` 引数、`error.value` null）が具体的に確定。
  - **技術選択**: TypeScript + Vitest 確定。mock 3 対象（useSupabaseClient / useSupabaseUser / useAsyncData）と即時実行スタブ仕様を具体化。
  - **実装可能性**: 既存 useLogin.test.ts の実証済みパターンで実現可能。チェーン mock・useAsyncData スタブのスケルトンを提示済。
  - **信頼性レベル分布**: 🔵 多数（TC1 / TC2 / 言語FW / §3 方針の大半）/ 🟡 2 点（mock alias の実測確認・groups embed null 型のみ）/ 🔴 なし。
- **次フェーズへの注意点**: 「7. tdd-red への引き継ぎ」参照。

---

## 7. tdd-red への引き継ぎ（注意点）

1. 🟡 **`useAsyncData` の mock 配線が最大の不確実点**: `useAsyncData` は Nuxt core の auto-import。`vi.mock('#imports')` で差し替わるかを **まず最小再現で実測**すること。効かない場合は useLogin.test.ts が `#supabase-client` / `#nuxt-router` alias で回避したのと同様、`#app`（または `nuxt/dist/app/composables/asyncData` 実パス）への alias mock が必要になる可能性が高い。必要なら `vitest.config.ts` に alias を 1 行追加する（既存 alias 運用を踏襲）。
2. 🔵 **useAsyncData スタブは「handler 即時実行」が必須**: 実際の Nuxt 環境なしで handler 内クエリを駆動するため、スタブが handler を await 実行し結果を `data: ref(result)` に詰めること（§2.3 スケルトン）。これを忘れると `data.value` が常に null になり TC1 が落ちる。
3. 🔵 **uid は `user.value.sub`**（`user.id` ではない）。`userRef` スタブは `{ value: { sub: 'u1' } }` 形にする（memory `project_mvp_revised_scope`）。TC1 の `eq('user_id', 'u1')` 検証はこの `sub` 値と一致させる。
4. 🔵 **固定キー検証は任意だが推奨**: `useAsyncDataMock.mock.calls[0][0] === 'current-group'` を 1 箇所で確認しておくと NFR-002（重複クエリ防止の固定キー）の回帰防止になる。必須ではない（冗長なら省略可）。
5. 🔵 **`beforeEach(vi.clearAllMocks())` 必須** + 各 TC 冒頭で `maybeSingleMock.mockResolvedValue({ data, error })` を再設定（clearAllMocks で実装が消えるため）。
6. 🔵 **異常系を red で増やさない**: §3 の方針どおり、クエリエラー throw・uid undefined は独立 TC にしない。red は TC1 / TC2 の 2 本のみ。
