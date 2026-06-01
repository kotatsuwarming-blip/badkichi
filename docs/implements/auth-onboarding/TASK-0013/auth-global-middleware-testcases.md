# TASK-0013: middleware auth.global.ts — TDD テストケース定義書

**作成日**: 2026-06-01
**タスク ID**: TASK-0013
**要件名**: auth-onboarding
**機能名**: auth.global.ts（グローバル認証 middleware）
**出力ファイル**: `docs/implements/auth-onboarding/TASK-0013/auth-global-middleware-testcases.md`
**テストファイル**: `tests/unit/middleware/auth.test.ts`

---

## 0. テスト戦略サマリー

- **対象**: `app/middleware/auth.global.ts`（`defineNuxtRouteMiddleware(async (to) => {...})`）
- **カバレッジ方針**: ADR-008 D8 の 7 分岐表に基づく**分岐カバレッジ**（最小カバレッジ、memory `feedback_test_coverage`）。
- **冗長ケース禁止**: ADR-008 D8 の 8 行目「未認証 + /login → 通過」は TC2 に代表集約済。境界値・異常系の追加ケースは作らない（middleware は純粋な分岐判定であり、入力空間は `user.value` ∈ {null, X} × `currentGroup.value` ∈ {null, G} × `to.path` の有限集合に閉じているため、7 ケースで全分岐を網羅する）。
- **テストの正体**: 正常系/異常系/境界値という従来の 3 分類ではなく、**「7 つの判定分岐ごとの代表ケース」**として整理する。下記 §1〜§3 では便宜上「正常系（リダイレクト発火）」「正常系（通過）」「境界（public/非 public 切替・許可 path 切替）」に振り分けて記載する。

### mock 方針（🔵 TASK-0013.md §単体テスト要件 + requirements §6 + useLogin.test.ts 踏襲）

1. **`defineNuxtRouteMiddleware` を恒等関数 mock**: 渡された `fn` をそのまま返す（`(fn) => fn`）。これにより default export が「`to` を引数に取る async 関数」そのものとなり、テストで `to` オブジェクトを直接渡して呼び出せる。
2. **`useSupabaseUser`**: `{ value: null }`（未認証）または `{ value: <user> }`（ログイン済）を返す mock。
3. **`useCurrentGroup`**: `{ data: { value: null } }`（未所属）または `{ data: { value: <group> } }`（所属済）を返す mock。
   - ⚠️ **ネスト差の注意**: `useSupabaseUser` は `{ value }`（1 段）、`useCurrentGroup` は `{ data: { value } }`（2 段）。混同するとテストが偽陽性/偽陰性になる。
4. **`navigateTo`**: `vi.fn()` でスパイ。呼び出し引数を `toHaveBeenCalledWith` で検証。
5. **`vi.hoisted` + `vi.mock`**: useLogin.test.ts と同様に hoisted で mock 変数を先に定義し、`#imports`（必要に応じて `#nuxt-router` / `#supabase-user` エイリアス）で差し替える。
6. **`beforeEach(vi.clearAllMocks())`**: テスト間でスパイ履歴を隔離。`userRef.value` / `groupRef.value` も各 TC 冒頭でセットする（または各 TC で mockReturnValue を上書き）。

---

## 1. 正常系テストケース（リダイレクトが発火する分岐）

### TC1: 未認証ユーザーが保護ページにアクセス → `/login?redirect=/`

- **テスト名**: 未認証で保護 page にアクセスすると redirect クエリ付きで /login へリダイレクトする
  - **何をテストするか**: `user.value === null` かつ to が非 public path のとき、`navigateTo('/login?redirect=' + encodeURIComponent(to.fullPath))` が呼ばれること。
  - **期待される動作**: 未認証ユーザーは保護コンテンツに到達できず、復帰用 redirect クエリ付きでログインページへ誘導される。
- **入力値**: `user.value = null`, `to = { path: '/', fullPath: '/' }`
  - **入力データの意味**: `/` は最も基本的な保護ページ（ダッシュボード）。`fullPath === '/'` のため redirect クエリは `redirect=/` になる。未認証の代表ケース。
- **期待される結果**: `navigateTo('/login?redirect=/')` が 1 回呼ばれる。
  - **期待結果の理由**: REQ-101（未認証→ログイン誘導）+ REQ-108（復帰のため redirect 付与）。`encodeURIComponent('/')` は `%2F` ではなく `/`（`/` はエンコード対象外）のため期待値は `/login?redirect=/`。
- **テストの目的**: 非 public + 未認証 分岐（dataflow.md §1 の `!user.value` ブランチ）を検証する。
  - **確認ポイント**: redirect クエリが `to.fullPath` から正しく生成されること。`navigateTo` が呼ばれること。
- 🔵 *ADR-008 D8 TC1 + REQ-101 / REQ-108 + dataflow.md §1*

### TC3: ログイン済・未所属ユーザーが保護ページにアクセス → `/onboarding`

- **テスト名**: ログイン済未所属で保護 page にアクセスするとオンボーディングへリダイレクトする
  - **何をテストするか**: `user.value` あり・`currentGroup.value === null`・to が非 public かつ非許可 path のとき `navigateTo('/onboarding')` が呼ばれること。
  - **期待される動作**: Group 未所属ユーザーは保護コンテンツの代わりにオンボーディング（Group 参加/作成）へ誘導される。
- **入力値**: `user.value = X`, `currentGroup.value = null`, `to = { path: '/', fullPath: '/' }`
  - **入力データの意味**: サインアップ直後でまだ Group に参加していないユーザーが `/`（保護ページ）にアクセスする実運用シナリオ。`X` は任意の User オブジェクト（`{ sub: 'uid-x' }` など最小スタブで可）。
- **期待される結果**: `navigateTo('/onboarding')` が 1 回呼ばれる。
  - **期待結果の理由**: REQ-102（ログイン済未所属→オンボーディング強制）。`!currentGroup.value && !GROUP_OPTIONAL_PATHS.includes('/')` が真。
- **テストの目的**: 非 public + ログイン済 + 未所属 + 非許可 path 分岐（AND 条件 `!currentGroup.value && !GROUP_OPTIONAL_PATHS.includes(to.path)` の真ケース）を検証する。
  - **確認ポイント**: `useCurrentGroup` が解決され `data.value === null` を読めること。AND 条件の左辺・右辺がともに真で onboarding へ飛ぶこと。
- 🔵 *ADR-008 D8 TC3 + REQ-102 + dataflow.md §1*

### TC5: ログイン済・所属ユーザーが `/login` にアクセス → `/`（public 分岐側）

- **テスト名**: ログイン済所属で /login にアクセスするとトップへリダイレクトする（public 分岐側で処理）
  - **何をテストするか**: to が public path `/login` かつ `user.value` あり・`currentGroup.value` ありのとき、**public 分岐の中で** `navigateTo('/')` が呼ばれること。
  - **期待される動作**: 既にログイン済・所属済のユーザーがログインページに来ても、再ログイン不要のためトップへ戻される。
- **入力値**: `user.value = X`, `currentGroup.value = G`, `to = { path: '/login', fullPath: '/login' }`
  - **入力データの意味**: 通常利用ユーザーが誤って（またはブックマークから）`/login` に来るシナリオ。`G` は所属 Group（`{ group_id: 'g1', groups: { id: 'g1', name: 'TeamA' } }` など）。
- **期待される結果**: `navigateTo('/')` が 1 回呼ばれる。
  - **期待結果の理由**: REQ-103。dataflow.md §1 では `/login` での所属済→`/` は**public 分岐側**（図上部の `PubLogin` ノード）で判定する。非 public ブランチではない。
- **テストの目的**: public path + `/login` + ログイン済 + 所属済 分岐（`to.path === '/login' && user.value` → `currentGroup.value` 真）を検証する。
  - **確認ポイント**: public 分岐の中で `useCurrentGroup` が呼ばれ所属判定されること。⚠️ 罠: この経路は非 public ブランチではなく public ブランチで処理される。
- 🔵 *ADR-008 D8 TC5 + REQ-103 + dataflow.md §1（public 分岐側 PubLogin）*

### TC6: ログイン済・所属ユーザーが `/onboarding` にアクセス → `/`

- **テスト名**: ログイン済所属で /onboarding にアクセスするとトップへリダイレクトする
  - **何をテストするか**: to が非 public path `/onboarding` かつ `user.value` あり・`currentGroup.value` ありのとき `navigateTo('/')` が呼ばれること。
  - **期待される動作**: 既に Group 所属済のユーザーはオンボーディング不要のためトップへ戻される。
- **入力値**: `user.value = X`, `currentGroup.value = G`, `to = { path: '/onboarding', fullPath: '/onboarding' }`
  - **入力データの意味**: 所属済ユーザーが不要なオンボーディングに（ブックマーク等で）アクセスするシナリオ。`/onboarding` は `GROUP_OPTIONAL_PATHS` に含まれるため未所属判定では通過するが、所属済の場合は `/` へ戻す分岐に入る。
- **期待される結果**: `navigateTo('/')` が 1 回呼ばれる。
  - **期待結果の理由**: REQ-103。非 public ブランチで `currentGroup.value && to.path === '/onboarding'` が真。
- **テストの目的**: 非 public + ログイン済 + 所属済 + `/onboarding` 分岐（`currentGroup.value && to.path === '/onboarding'` の真ケース）を検証する。
  - **確認ポイント**: 未所属用 AND 条件（`!currentGroup.value && ...`）は偽でスキップされ、続く所属済 + `/onboarding` 条件で `/` へ飛ぶこと。
- 🔵 *ADR-008 D8 TC6 + REQ-103 + dataflow.md §1*

---

## 2. 正常系テストケース（通過する＝リダイレクトしない分岐）

> これらは `navigateTo` が **呼ばれない**ことを `expect(navigateTo).not.toHaveBeenCalled()` で検証する（requirements §次フェーズ注意点 5）。

### TC2: 未認証ユーザーが `/login`（public）にアクセス → 通過

- **テスト名**: 未認証で /login にアクセスすると通過する（リダイレクトなし）
  - **何をテストするか**: `user.value === null` かつ to が public path `/login` のとき、`navigateTo` が呼ばれず素通りすること。
  - **期待される動作**: 未認証ユーザーがログインページにアクセスできる（ログインの入口を塞がない）。
- **入力値**: `user.value = null`, `to = { path: '/login', fullPath: '/login' }`
  - **入力データの意味**: ログインフローの起点。未認証が public path にアクセスする正常な動線。ADR-008 D8 の 8 行目（未認証+/login）はこの TC2 に集約。
- **期待される結果**: `navigateTo` が一度も呼ばれない（戻り値は undefined）。
  - **期待結果の理由**: public path の `/login` は早期 return で通す。`user.value === null` のため public 分岐内の所属済判定（`to.path === '/login' && user.value`）にも入らない。
- **テストの目的**: public path + 未認証 分岐（`isPublicPath` 真 → 所属済判定スキップ → return）を検証する。
  - **確認ポイント**: public 判定が機能し、未認証でも `/login` を通すこと。`useCurrentGroup` が呼ばれないこと（user.value が null のため）。
- 🔵 *ADR-008 D8 TC2（8 行目代表集約）+ dataflow.md §1*

### TC4: ログイン済・未所属ユーザーが `/groups/new`（許可 path）にアクセス → 通過

- **テスト名**: ログイン済未所属で /groups/new にアクセスすると通過する（未所属許可 path）
  - **何をテストするか**: `user.value` あり・`currentGroup.value === null` かつ to が `GROUP_OPTIONAL_PATHS` の `/groups/new` のとき、`navigateTo` が呼ばれず通過すること。
  - **期待される動作**: 未所属ユーザーが Group 作成ページに到達できる（オンボーディングの Group 作成動線を塞がない）。
- **入力値**: `user.value = X`, `currentGroup.value = null`, `to = { path: '/groups/new', fullPath: '/groups/new' }`
  - **入力データの意味**: オンボーディング中のユーザーが Group を新規作成する動線。`/groups/new` は `GROUP_OPTIONAL_PATHS = ['/onboarding', '/groups/new']` の代表（`/onboarding` は TC6 で所属済側を検証するため、許可 path 通過は `/groups/new` で代表検証）。
- **期待される結果**: `navigateTo` が一度も呼ばれない。
  - **期待結果の理由**: REQ-102 の例外。`!currentGroup.value` は真だが `!GROUP_OPTIONAL_PATHS.includes('/groups/new')` が偽のため AND 条件全体が偽 → onboarding リダイレクトしない。続く所属済 + `/onboarding` 条件も `currentGroup.value` が null で偽 → return（通過）。
- **テストの目的**: 非 public + ログイン済 + 未所属 + 許可 path 分岐（AND 条件 `!currentGroup.value && !GROUP_OPTIONAL_PATHS.includes(to.path)` の**偽**ケース）を検証する。
  - **確認ポイント**: `GROUP_OPTIONAL_PATHS.includes(to.path)` が AND の右辺を偽化し、リダイレクトを抑止すること。境界: 許可 path リストの効果。
- 🔵 *ADR-008 D8 TC4 + REQ-102（未所属許可 path）+ dataflow.md §1*

### TC7: ログイン済・所属ユーザーが保護ページにアクセス → 通過

- **テスト名**: ログイン済所属で保護 page にアクセスすると通過する（通常利用の正常系）
  - **何をテストするか**: `user.value` あり・`currentGroup.value` あり かつ to が非 public・非 `/onboarding` のとき、`navigateTo` が呼ばれず通過すること。
  - **期待される動作**: 通常利用ユーザーが保護コンテンツに正常にアクセスできる（ガードが正規ユーザーを妨げない）。
- **入力値**: `user.value = X`, `currentGroup.value = G`, `to = { path: '/', fullPath: '/' }`
  - **入力データの意味**: 認証・所属がともに整った正規ユーザーの最も一般的なアクセス。`/` は保護ページの代表。
- **期待される結果**: `navigateTo` が一度も呼ばれない。
  - **期待結果の理由**: 未所属 AND 条件は `!currentGroup.value` が偽で不成立、所属済 + `/onboarding` 条件は `to.path === '/onboarding'` が偽で不成立 → どのリダイレクトにも該当せず return（通過）。
- **テストの目的**: 非 public + ログイン済 + 所属済 + 非 onboarding 分岐（全リダイレクト条件が偽 → return）を検証する。最終的な「素通り」経路の保証。
  - **確認ポイント**: 全分岐をすり抜けて何もリダイレクトしないこと。正規ユーザーへの誤リダイレクトがないこと。
- 🔵 *ADR-008 D8 TC7 + dataflow.md §1*

---

## 3. 境界値・分岐切替の観点（既存 7 ケースで内包）

> middleware は数値範囲や文字列長のような連続的境界を持たないため、**独立した境界値テストは追加しない**（memory `feedback_test_coverage`：冗長ケース禁止）。代わりに、以下の「分岐切替の境界」が既存 TC に内包されていることを明示する。

- **public ⇄ 非 public の境界**: TC2（public `/login` 通過）と TC1（非 public `/` でリダイレクト）が `isPublicPath` 判定の両側を網羅。
- **未所属許可 path ⇄ 非許可 path の境界**: TC4（許可 path `/groups/new` 通過）と TC3（非許可 path `/` でリダイレクト）が `GROUP_OPTIONAL_PATHS.includes(to.path)` の両側を網羅。
- **/login での所属済 ⇄ /onboarding での所属済**: TC5（public 分岐側）と TC6（非 public 分岐側）が「所属済の `/` リダイレクト」の 2 経路を分離して網羅。
- **OR 条件**: `PUBLIC_PATHS.includes(to.path) || to.path.startsWith('/join/')` の左辺真は TC2/TC5（`/login`）で検証。右辺（`/join/**`）は middleware では「通すだけ」で副作用がなく、未認証リダイレクトは page 側（TASK-0018）責務のため、本タスクの分岐カバレッジ対象外（requirements §4 / ADR-008 D1 例外）。
- **AND 条件**: `!currentGroup.value && !GROUP_OPTIONAL_PATHS.includes(to.path)` の真ケースは TC3、偽ケース（右辺偽）は TC4 で網羅。左辺偽（所属済）は TC6/TC7 で網羅。

🔵 *requirements §次フェーズ注意点 1 + memory feedback_test_coverage*

---

## 4. 開発言語・フレームワーク

- **プログラミング言語**: TypeScript（strict mode）
  - **言語選択の理由**: プロジェクト全体が Nuxt 4 + Vue 3 + TypeScript strict（CLAUDE.md / note.md §1）。middleware も `.ts` で型安全に実装する。
  - **テストに適した機能**: `to` / `User` / `CurrentGroup` の型注釈により mock 戻り値のネスト構造（`{ value }` vs `{ data: { value } }`）をコンパイル時に検証でき、混同事故を防げる。
- **テストフレームワーク**: Vitest（`@nuxt/test-utils` の `defineVitestConfig`）
  - **フレームワーク選択の理由**: ADR-012 D5 / note.md §5。既存 composable テスト（useLogin.test.ts 等）が Vitest + `vi.hoisted` / `vi.mock('#imports')` で統一されており、middleware も同パターンに揃える。
  - **テスト実行環境**: `tests/unit/middleware/auth.test.ts`（新規ディレクトリ）。`vitest.config.ts` の `include: tests/unit/**/*.test.ts` と alias（`#nuxt-router` / `#supabase-user` / `#supabase-client`）に追従。mock unit のため DB 接続不要、pre-commit + CI 両方で実行（feedback_test_layer_separation）。
- 🔵 *note.md §1 / §5 + CLAUDE.md + ADR-012 D5 + useLogin.test.ts*

---

## 5. テストケース実装時の日本語コメント指針

実装（tdd-red / green）時、各 TC に以下の日本語コメントを付与する。

### テストファイル冒頭

```typescript
/**
 * auth.global.ts middleware 単体テスト (TC1〜TC7 / ADR-008 D8 7 分岐)
 *
 * mock 戦略 (TASK-0013.md §単体テスト要件 / useLogin.test.ts 踏襲):
 *   - defineNuxtRouteMiddleware を恒等関数 mock ((fn) => fn) し、default export を
 *     「to を引数に取る async 関数」として直接呼び出す
 *   - useSupabaseUser: { value: null } | { value: <user> } を返す mock (1 段ネスト)
 *   - useCurrentGroup: { data: { value: null } } | { data: { value: <group> } } を返す mock (2 段ネスト)
 *     ⚠️ useSupabaseUser({value}) と useCurrentGroup({data:{value}}) のネスト差に注意
 *   - navigateTo: vi.fn() でスパイ
 *   - beforeEach(vi.clearAllMocks()) でテスト間隔離
 * 🔵 ADR-008 D8 + REQ-101/102/103/108 + dataflow.md §1
 */
```

### Given（準備フェーズ）

```typescript
// 【テストデータ準備】: user.value / currentGroup.value / to を当該分岐に合わせて設定する理由
// 【初期条件設定】: 未認証/ログイン済、未所属/所属済、public/非 public path の組み合わせ
// 【前提条件確認】: defineNuxtRouteMiddleware が恒等関数 mock 済で default export が呼び出し可能なこと
```

### When（実行フェーズ）

```typescript
// 【実際の処理実行】: default export (middleware 本体) に to を渡して await 実行
// 【処理内容】: dataflow.md §1 の判定フローを通り、navigateTo 呼び出し or return する
// 【実行タイミング】: user/group mock 設定後、1 回だけ middleware を呼ぶ
const result = await middleware(to)
```

### Then（検証フェーズ）

```typescript
// 【結果検証】: navigateTo の呼び出し有無・引数を検証
// 【期待値確認】: リダイレクト系 (TC1/3/5/6) は toHaveBeenCalledWith、通過系 (TC2/4/7) は not.toHaveBeenCalled
// 【品質保証】: 7 分岐の網羅により保護漏れゼロ (NFR-104) を担保
```

### expect 例（リダイレクト系 / 通過系）

```typescript
// 【検証項目】: 未認証で保護 page → /login?redirect=/ へリダイレクト
// 🔵 ADR-008 D8 TC1
expect(navigateTo).toHaveBeenCalledWith('/login?redirect=/') // 【確認内容】: redirect クエリ付き /login へ 1 回リダイレクト

// 【検証項目】: 未認証で /login → 通過 (リダイレクトなし)
// 🔵 ADR-008 D8 TC2
expect(navigateTo).not.toHaveBeenCalled() // 【確認内容】: public path のため navigateTo が一度も呼ばれない
```

### セットアップ・クリーンアップ

```typescript
beforeEach(() => {
  // 【テスト前準備】: 各 TC 前にスパイ呼び出し履歴をクリアし TC 間の相互干渉を防ぐ
  // 【環境初期化】: userRef.value / groupRef.value を当該 TC の値に設定 (または mockReturnValue 上書き)
  vi.clearAllMocks()
})
```

🔵 *useLogin.test.ts のコメント規約踏襲*

---

## 6. 要件定義との対応関係

- **参照した機能概要**: requirements §1（グローバル middleware で認証・Group 所属を一元判定、NFR-104 保護漏れゼロ）
- **参照した入力・出力仕様**: requirements §2（入力 `to.path` / `to.fullPath` / `useSupabaseUser` / `useCurrentGroup`、出力 `navigateTo` / return、判定マトリクス）
- **参照した制約条件**: requirements §3（NFR-002 キャッシュ共有、ADR-008 D6 isomorphic、D7 エラー委譲、PUBLIC_PATHS / GROUP_OPTIONAL_PATHS 定数）
- **参照した使用例**: requirements §4（基本 7 パターン + `/confirm` / `/join/**` エッジ + redirect エンコード）
- **参照したテスト要件**: requirements §6 / TASK-0013.md §単体テスト要件（TC1〜TC7 の Given/When/Then と mock 方針）

### TC ⇄ EARS / 分岐 対応表

| TC | user | currentGroup | to.path | 期待 | EARS | dataflow.md §1 分岐 |
|---|---|---|---|---|---|---|
| TC1 | null | — | `/` | `navigateTo('/login?redirect=/')` | REQ-101 / 108 | 非 public + 未認証 |
| TC2 | null | — | `/login` | 通過（未呼び出し） | dataflow §1 | public + 未認証 |
| TC3 | X | null | `/` | `navigateTo('/onboarding')` | REQ-102 | 非 public + 未所属 + 非許可 path |
| TC4 | X | null | `/groups/new` | 通過 | REQ-102（許可 path） | 非 public + 未所属 + 許可 path |
| TC5 | X | G | `/login` | `navigateTo('/')` | REQ-103 | public + 所属済（PubLogin） |
| TC6 | X | G | `/onboarding` | `navigateTo('/')` | REQ-103 | 非 public + 所属済 + /onboarding |
| TC7 | X | G | `/` | 通過 | dataflow §1 | 非 public + 所属済 + 非 onboarding |

---

## 品質判定

✅ **高品質**

- **テストケース分類**: 7 分岐をリダイレクト系 4（TC1/3/5/6）+ 通過系 3（TC2/4/7）に整理し、ADR-008 D8 表を完全網羅。public/非 public・許可/非許可 path・/login/onboarding 所属済の各境界を内包（§3）。
- **期待値定義**: 各 TC の `navigateTo` 引数（または未呼び出し）が一意に確定。redirect クエリ値（`/login?redirect=/`）まで明記。
- **技術選択**: TypeScript strict + Vitest + `vi.hoisted` / `vi.mock` + 恒等関数 mock 方式で確定（既存 useLogin.test.ts と同一パターン）。
- **実装可能性**: 前提タスク TASK-0009（useCurrentGroup）実装済、実装テンプレート確定済、mock パターンも既存テストで実証済。
- **信頼性レベル**: 🔵 が大多数（全 TC が ADR-008 D8 / REQ-101〜103/108 / dataflow.md §1 に直接対応）。🟡🔴 なし。

**信頼性分布**: 🔵 100%（TC1〜TC7・mock 方針・言語/FW すべて元資料に直接対応）/ 🟡 0% / 🔴 0%

---

## 次フェーズ（tdd-red）への注意点

1. **恒等関数 mock の実装確認**: `vi.mock` で `defineNuxtRouteMiddleware: (fn) => fn` とし、`import middleware from '~/middleware/auth.global'` の default export が「`to` を取る async 関数」になることを最初に確認する。これが効かないと全 TC が落ちる。
2. **ネスト差の徹底**: `useSupabaseUser` は `{ value }`、`useCurrentGroup` は `{ data: { value } }`。mock 設定時に取り違えると TC3/4/5/6/7 が偽の結果になる。型注釈（`Ref<User|null>` / `{ data: Ref<CurrentGroup|null> }`）で防御する。
3. **TC5 は public 分岐側**: `/login` + 所属済の `/` リダイレクトは非 public ブランチではなく `to.path === '/login' && user.value` の public 分岐内で発火する。実装が non-public 側に書かれていると TC5 が落ちる（仕様どおり）。
4. **通過系の検証方法**: TC2/TC4/TC7 は `expect(navigateTo).not.toHaveBeenCalled()` で検証。`toHaveReturned` 等ではなく「副作用が起きない」ことを見る。
5. **redirect クエリの期待値**: TC1 の期待は `'/login?redirect=/'`（`encodeURIComponent('/')` は `/` のまま）。`%2F` を期待値に書かないこと。
6. **vitest.config.ts の alias 追従**: `#supabase-user` / `#nuxt-router` のエイリアスが未定義なら useLogin.test.ts と同様に `#imports` mock に集約するか alias を追加する。Red フェーズでまず import 解決エラーが出ないことを確認する。
7. **冗長ケース追加の禁止**: 7 ケースで分岐カバレッジは完了。`/confirm` 単独や `/join/**`、redirect エンコードの追加 TC は作らない（middleware の副作用がない／別タスク責務、memory `feedback_test_coverage`）。
8. **`useCurrentGroup` 即時解決 mock**: `await useCurrentGroup()` が pending を待たずに即 `{ data: { value } }` を返す mock にする（useCurrentGroup.test.ts の useAsyncData 即時実行パターン参考）。pending ポーリングは不要。
