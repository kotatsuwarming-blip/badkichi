# TASK-0002 usePlayers テストケース定義書

**要件名**: player-management / **TASK-ID**: TASK-0002 / **機能名**: usePlayers (Read composable)
**作成日**: 2026-06-02
**テストファイル**: `tests/unit/composables/usePlayers.test.ts`
**テスト方針**: 最小境界値 + 分岐網羅のみ（冗長ケース禁止、memory feedback_test_coverage）。Supabase クライアントと `useCurrentGroup` / `useAsyncData` をモックし、handler を即時実行してクエリビルダ呼び出しを検証する。
**確定テストケース数**: 3 件（TC-001-01 / TC-001-02 / TC-NFR-001-01、全🔵）

> 注: 本 composable は引数なし・分岐 2 経路（group_id あり / なし）のみ。3 ケースで「正常系のクエリ構築 (eq)」「正常系のフィルタ/ソート (is + order)」「境界系の未取得ガード (空配列 + クエリ未発行)」を網羅し、これ以上のケースは冗長となるため追加しない。

---

## 1. 正常系テストケース

### TC-001-01: 自 Group のみ eq(group_id) で取得する 🔵
- **何をテストするか**: `useCurrentGroup().data.value = { group_id: 'g1' }` のとき、handler が `from('players')` を実行し `eq('group_id', 'g1')` で絞り込み、取得行配列を返すこと。
- **期待される動作**: PostgREST SELECT を 1 回実行し、自 Group の選手のみを返す。
- **入力値**: `groupData.value = { group_id: 'g1' }`、`order` モックが `{ data: [{ id: 'p1', name: 'A', handedness: 'right' }], error: null }` を resolve。
  - **入力データの意味**: 所属あり・未削除 1 件を代表する最小データ。`group_id: 'g1'` は RLS と二重防御の `eq` 引数検証用。
- **期待される結果**:
  - `from` が `'players'` で呼ばれる。
  - `eq` が `('group_id', 'g1')` で呼ばれる。
  - 戻り値が `[{ id: 'p1', name: 'A', handedness: 'right' }]`。
  - **期待結果の理由**: handler は SELECT 結果を `as Player[]` で素通しする薄いラッパ（TASK-0002.md 実装スケルトン L97）。
- **テストの目的**: 一覧取得の主経路（REQ-001）と自 Group 絞り込み（NFR-101 / RLS 二重防御）の検証。
  - **確認ポイント**: `from('players')` が呼ばれること、`eq` の引数が列名 `'group_id'` と値 `'g1'` で正確であること。
- **参照**: REQ-001 / NFR-101 / players_select RLS
- 🔵

## 2. 異常系テストケース

> 本 composable のエラー経路は `if (error) throw error`（PostgREST/RLS/通信エラーを `error.vue` へ委譲）のみで、これは `useAsyncData` スタブの `error.value` 反映に依存する薄い分岐。`useCurrentGroup.ts` でも error throw 経路は専用ケース化しておらず、本タスク仕様（TASK-0002.md 単体テスト要件）でもエラー throw 専用ケースは定義されていない。**最小境界 + 分岐網羅方針に従い、異常系専用ケースは追加しない**（冗長回避）。group_id 未取得という「準異常 = 未所属/未認証」分岐は §3 境界値 TC-NFR-001-01 でカバーする。

## 3. 境界値テストケース

### TC-001-02: deleted_at IS NULL でフィルタし name 昇順で取得する (EDGE-005) 🔵
- **境界値の意味**: ソフト削除済み行（`deleted_at` 非 NULL）を一覧から除外する境界。部分インデックス `idx_players_group_id WHERE deleted_at IS NULL`（NFR-001）の活用条件でもある。
- **境界値での動作保証**: クエリチェーンに `is('deleted_at', null)` と `order('name')` が必ず含まれること。
- **入力値**: `groupData.value = { group_id: 'g1' }`（TC-001-01 と同じ beforeEach デフォルト）。
  - **境界値選択の根拠**: フィルタ列 `deleted_at` と null 比較、ソート列 `name` がクエリ構築に含まれるかの検証。
- **期待される結果**:
  - `is` が `('deleted_at', null)` で呼ばれる。
  - `order` が `('name')` で呼ばれる。
  - **境界での正確性**: 削除済み行が除外され、未削除選手が name 昇順で返る。
- **テストの目的**: 未削除フィルタ（EDGE-005 / REQ-001）と name 昇順ソートの検証、部分インデックス活用条件（NFR-001）の担保。
  - **堅牢性の確認**: 削除済みデータが誤って一覧に混入しないこと。
- **参照**: EDGE-005 / REQ-001 / NFR-001
- 🔵

### TC-NFR-001-01: group_id 未取得は空配列を返しクエリを発行しない 🔵
- **境界値の意味**: `group_id` が取得できない境界（未所属/未認証 → `useCurrentGroup().data.value = null`）。クエリ発行有無の分岐点。
- **境界値での動作保証**: ガード `if (!gid) return []` が機能し、`from('players')` が呼ばれずに空配列を返すこと。
- **入力値**: `groupData.value = null`。
  - **境界値選択の根拠**: `group_id` が undefined になる最小条件。実運用では未所属ユーザ・未認証状態（middleware が /confirm 等で呼ぶ場合）に発生。
- **期待される結果**:
  - 戻り値が `[]`。
  - `from` が **一度も呼ばれない**（`expect(from).not.toHaveBeenCalled()`）。
  - **一貫した動作**: 未取得時は不要な PostgREST クエリを発行しない（パフォーマンス + 空状態 UI 表示 REQ-201）。
- **テストの目的**: 未所属ガード（REQ-201）と無駄クエリ抑止（NFR-001）の検証。
  - **堅牢性の確認**: group_id 未取得でもエラーにせず空配列を正常値として返すこと。
- **参照**: REQ-201 / NFR-001 / 未所属ガード
- 🔵

## 4. 開発言語・フレームワーク

- **プログラミング言語**: TypeScript（strict mode）
  - **言語選択の理由**: プロジェクト全体が Nuxt 4 + TypeScript（CLAUDE.md）。型付き Supabase クライアントとドメイン型 `Player` の narrow を型レベルで検証できる。
- **テストフレームワーク**: Vitest + @nuxt/test-utils（`defineVitestConfig`、`vitest.config.ts`）
  - **フレームワーク選択の理由**: プロジェクト確立のユニットテスト基盤。`tests/unit/composables/*.test.ts` に集約（ADR-012 D5）。
  - **テスト実行環境**: `pnpm` 経由の Vitest。`include: ['tests/unit/**/*.test.ts']`、integration は別 config で除外。
- 🔵

## 5. テストケース実装時の方針（mock 戦略）

プロジェクト確立パターン（`tests/unit/composables/useCurrentGroup.test.ts`）を踏襲する:

- `vi.hoisted()` で `fromMock` / `selectMock` / `eqMock` / `isMock` / `orderMock` / `useAsyncDataMock` / `groupRef` を定義（TDZ 回避）。
- クエリビルダチェーンは usePlayers のクエリ順に合わせて `from → select → eq → is → order` を返す。末端 `order` が `{ data, error }` を resolve する。
- `useAsyncDataMock` は handler を即時 await 実行し `{ data: ref(result), pending: ref(false), error: ref(null), refresh: vi.fn() }` を返す（忘れると data.value が null になる）。
- `vi.mock('#imports', ...)` + `vi.mock('#supabase-client', ...)` + `vi.mock('#async-data', ...)` で auto-import を差し替え。`useCurrentGroup` は本 composable が直接 import する `~/composables/useCurrentGroup` を `vi.mock` で差し替える。
- `beforeEach` で `vi.clearAllMocks()` + `order.mockResolvedValue(...)` 再設定 + `groupRef` を `{ value: { group_id: 'g1' } }` に初期化。
- **補足**: TASK-0002.md の inline テストは `vi.stubGlobal` 方式で簡略化されている。tdd-red 実装時に `vi.hoisted + vi.mock`（確立パターン）に揃えるか、`vi.stubGlobal` で通るか確認のうえ方式を確定する。

### 各 TC の Given/When/Then 雛形（日本語コメント指針）

```typescript
// 【テスト目的】: 自 Group のみを eq(group_id) で絞り込んで取得することを確認 🔵
// 【テスト内容】: groupData.value = { group_id: 'g1' } のとき handler が from('players')→eq('group_id','g1') を実行
// 【期待される動作】: SELECT 結果配列を素通しで返す
it('TC-001-01: 自 Group のみ eq(group_id) で取得する', async () => {
  // 【テストデータ準備】: 所属あり・未削除 1 件 (beforeEach デフォルト groupData='g1', order が 1 行 resolve)
  // 【実際の処理実行】: usePlayers() → useAsyncData スタブ経由で handler を即時解決
  usePlayers()
  const result = await handlers[0]!()
  // 【結果検証】: from('players') 呼出 + eq('group_id','g1') 呼出 + 取得行配列返却
  expect(from).toHaveBeenCalledWith('players') // 【確認内容】: players テーブルへの SELECT 発行 🔵
  expect(eq).toHaveBeenCalledWith('group_id', 'g1') // 【確認内容】: 自 Group 絞り込み列名・値の正確性 🔵
  expect(result).toEqual([{ id: 'p1', name: 'A', handedness: 'right' }]) // 【確認内容】: SELECT 結果素通し 🔵
})
```

## 6. 要件定義との対応関係

- **参照した機能概要**: `usePlayers-requirements.md §1`（未削除選手一覧を name 昇順で返す Read composable）
- **参照した入力・出力仕様**: `usePlayers-requirements.md §2`（入力なし、`UsePlayersReturn = AsyncState<Player[]>`、group_id あり/なし分岐）
- **参照した制約条件**: `usePlayers-requirements.md §3`（固定キー / 部分インデックス / RLS 二重防御 / select 列限定）
- **参照した使用例**: `usePlayers-requirements.md §4`（基本パターン / 0 件 / group_id 未取得 / deleted_at 除外 / エラー throw）
- **参照したタスク仕様**: `docs/tasks/player-management/TASK-0002.md §単体テスト要件`（TC-001-01 / TC-001-02 / TC-NFR-001-01）

---

## 品質判定

- テストケース分類: 正常系（TC-001-01）/ 境界値（TC-001-02 deleted_at 除外境界, TC-NFR-001-01 group_id 未取得境界）を網羅。異常系専用ケースは分岐構造上不要（最小境界 + 分岐網羅方針）。
- 期待値定義: 各 TC の expect（from / eq / is / order の引数、戻り値）が明確。
- 技術選択: TypeScript + Vitest 確定。
- 実装可能性: `useCurrentGroup.test.ts` の同型 mock 戦略が既存。
- 信頼性レベル: 🔵 100%（3 件全て TASK-0002.md と要件定義に裏付けあり）

**判定**: ✅ 高品質
