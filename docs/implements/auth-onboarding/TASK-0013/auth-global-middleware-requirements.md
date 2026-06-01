# TASK-0013: middleware auth.global.ts — TDD 要件定義書

**作成日**: 2026-06-01
**タスク ID**: TASK-0013
**要件名**: auth-onboarding
**機能名**: auth.global.ts（グローバル認証 middleware）
**出力ファイル**: `docs/implements/auth-onboarding/TASK-0013/auth-global-middleware-requirements.md`

---

## 1. 機能の概要（EARS要件定義書・設計文書ベース）

- 🔵 **何をする機能か**
  Nuxt のグローバルルートミドルウェア (`app/middleware/auth.global.ts`) として、全ルート遷移時に「認証状態」と「Group 所属状態」を判定し、適切なページへリダイレクトする。1 ファイルで全認証分岐を集約することで保護漏れをゼロにする (ADR-008 D1 / NFR-104)。

- 🔵 **どのような問題を解決するか**
  保護ページごとに認証チェックを書くと書き漏れが発生し、未認証ユーザーや未所属ユーザーが保護コンテンツに到達してしまう。グローバル middleware で一元判定することで、全ページに対し「未認証→ログイン」「ログイン済未所属→オンボーディング」を確実に強制する。

- 🔵 **想定されるユーザー**
  - 未認証ユーザー（ログインしていない訪問者）
  - ログイン済・Group 未所属ユーザー（サインアップ直後でまだ Group に参加していない）
  - ログイン済・Group 所属ユーザー（通常利用ユーザー）

- 🔵 **システム内での位置づけ**
  Phase 2「ドメインロジック層」。`useSupabaseUser()`（認証状態）と `useCurrentGroup()`（Group 所属状態、TASK-0009）の上に立つルーティングガード。後続の保護ページ群 (TASK-0015〜0020) はこの middleware により保護される。

- **参照したEARS要件**: REQ-101 / REQ-102 / REQ-103 / REQ-108、NFR-002 / NFR-104
- **参照した設計文書**: `docs/design/auth-onboarding/dataflow.md` §1（判定フローチャート）、`docs/design/auth-onboarding/architecture.md` §認証 middleware、ADR-008 D1-D8

---

## 2. 入力・出力の仕様（EARS機能要件・TypeScript型定義ベース）

### 入力パラメータ

- 🔵 **`to`（遷移先ルート）**
  `defineNuxtRouteMiddleware(async (to) => {...})` の第 1 引数。本機能で使用するのは以下 2 プロパティのみ。
  - `to.path: string` — クエリを含まないパス（例: `/`, `/login`, `/onboarding`, `/groups/new`）
  - `to.fullPath: string` — クエリを含む完全パス（redirect クエリ生成に使用）

- 🔵 **`useSupabaseUser()`（認証状態、暗黙入力）**
  戻り値は `Ref<User | null>`。
  - `user.value === null` → 未認証
  - `user.value` がオブジェクト → ログイン済（uid は `user.value.sub`）

- 🔵 **`useCurrentGroup()`（Group 所属状態、暗黙入力）**
  戻り値は `{ data: Ref<CurrentGroup | null>, pending, error, refresh }`。固定キー `'current-group'` の `useAsyncData` キャッシュを page と共有（ADR-008 D4 / NFR-002）。
  - `currentGroup.value === null` → 未所属
  - `currentGroup.value` がオブジェクト → 所属済
  - `CurrentGroup` 型: `{ group_id: string, groups: { id: string, name: string } | null }`

### 出力値

- 🔵 **リダイレクト**: `navigateTo(path)` の戻り値を `return` する。
  - `navigateTo('/login?redirect=' + encodeURIComponent(to.fullPath))`
  - `navigateTo('/onboarding')`
  - `navigateTo('/')`
- 🔵 **通過（リダイレクトなし）**: `return`（undefined）でナビゲーションを許可。

### 入出力の関係性（判定マトリクス）

🔵

| 条件 | 出力 | 根拠 |
|---|---|---|
| public path 以外 + 未認証 | `navigateTo('/login?redirect=' + encodeURIComponent(to.fullPath))` | REQ-101 / REQ-108 |
| public path 以外 + ログイン済 + 未所属 + 非許可 path | `navigateTo('/onboarding')` | REQ-102 |
| public path 以外 + ログイン済 + 所属 + `/onboarding` | `navigateTo('/')` | REQ-103 |
| public path (`/login`) + ログイン済 + 所属 | `navigateTo('/')` | REQ-103 |
| 上記以外 | 通過（return） | dataflow.md §1 |

### データフロー（dataflow.md §1）

🔵

```
Start → to は public path? (/login, /confirm, /join/**)
  ├─ Yes → to === /login かつ user.value あり?
  │   ├─ Yes → useCurrentGroup() 所属済? → Yes: navigateTo('/') / No: return
  │   └─ No  → return（通す）
  └─ No  → user.value あり?（ログイン済?）
      ├─ No  → navigateTo('/login?redirect=...')
      └─ Yes → useCurrentGroup() 所属?
          ├─ No  → to が GROUP_OPTIONAL_PATHS (/onboarding, /groups/new)?
          │   ├─ Yes → return（通す）
          │   └─ No  → navigateTo('/onboarding')
          └─ Yes → to === /onboarding?
              ├─ Yes → navigateTo('/')
              └─ No  → return（通す）
```

- **参照したEARS要件**: REQ-101 / REQ-102 / REQ-103 / REQ-108
- **参照した設計文書**: `docs/design/auth-onboarding/interfaces.ts`（`CurrentGroup` / `AsyncState`）、`docs/design/auth-onboarding/dataflow.md` §1

---

## 3. 制約条件（EARS非機能要件・アーキテクチャ設計ベース）

- 🔵 **パフォーマンス要件 (NFR-002)**
  1 ナビゲーション 1 クエリ。`useCurrentGroup()` は固定キー `'current-group'` の `useAsyncData` キャッシュを page と共有し、middleware で別クエリを直書きしない。public 分岐と非 public 分岐で 2 回呼んでも同一キーのためクエリは 1 回のみ。

- 🔵 **セキュリティ要件 (NFR-104)**
  グローバル middleware で全ルートを保護し、保護漏れをゼロにする。ページ個別の認証チェックに依存しない。

- 🔵 **アーキテクチャ制約 (ADR-008 D1 / D6)**
  - 実装は `defineNuxtRouteMiddleware(async (to) => {...})` 形式、`app/middleware/auth.global.ts` 1 ファイルに全分岐を集約。
  - **isomorphic 原則 (D6)**: `useSupabaseUser` / `useCurrentGroup` / `navigateTo` **のみ**使用。`serverSupabaseClient` / `window` / `document` 禁止（SSR/CSR 双方で動作）。

- 🔵 **互換性要件 / path 定数 (dataflow.md §1 / ADR-008 D1)**
  - `PUBLIC_PATHS = ['/login', '/confirm']`、加えて `to.path.startsWith('/join/')` で public 判定。
  - `GROUP_OPTIONAL_PATHS = ['/onboarding', '/groups/new']`（ログイン済未所属でも通す）。

- 🔵 **エラーハンドリング制約 (ADR-008 D7)**
  middleware 内で `try-catch` は不要。`useCurrentGroup` のクエリエラーは throw → `error.vue` → Sentry に委譲。

- 🔵 **例外仕様 (ADR-008 D1 例外)**
  `/join/**` は public path として middleware では未認証リダイレクトしない。未認証時のリダイレクトは page 内 (TASK-0018 `join/[code].vue`) で実装する。

- **参照したEARS要件**: NFR-002 / NFR-104、REQ-101〜103 / 108
- **参照した設計文書**: ADR-008 D1-D8、`docs/design/auth-onboarding/architecture.md` §認証 middleware、`docs/design/cross-cutting/error-handling.md`

---

## 4. 想定される使用例（EARS Edgeケース・データフローベース）

### 基本的な使用パターン

- 🔵 **未認証ユーザーが保護ページにアクセス**: `/` → `/login?redirect=/`（REQ-101/108）
- 🔵 **未認証ユーザーがログインページにアクセス**: `/login` → そのまま表示（通過）
- 🔵 **ログイン済未所属ユーザーが保護ページにアクセス**: `/` → `/onboarding`（REQ-102）
- 🔵 **ログイン済未所属ユーザーが Group 作成ページにアクセス**: `/groups/new` → そのまま表示（許可 path、通過）
- 🔵 **ログイン済所属ユーザーがログインページにアクセス**: `/login` → `/`（REQ-103）
- 🔵 **ログイン済所属ユーザーがオンボーディングにアクセス**: `/onboarding` → `/`（REQ-103）
- 🔵 **ログイン済所属ユーザーが保護ページにアクセス**: `/` → そのまま表示（通過）

### エッジケース・境界

- 🔵 **`/confirm`（public）**: 未認証でも通過（メール確認用 public path）。
- 🔵 **`/join/<code>`（public・例外）**: 未認証でも middleware は通す。未認証リダイレクトは page 側 (TASK-0018) で処理。
- 🟡 **redirect クエリのエンコード**: `to.fullPath` にクエリ・特殊文字が含まれても `encodeURIComponent` で安全にエンコードする（複数パラメータ・日本語対応）。

### エラーケース

- 🔵 **`useCurrentGroup` のクエリ失敗**: middleware では catch せず throw を伝播し、`error.vue`（グローバルエラーハンドラ）→ Sentry へ委譲（ADR-008 D7）。

- **参照したEARS要件**: REQ-101 / REQ-102 / REQ-103 / REQ-108
- **参照した設計文書**: `docs/design/auth-onboarding/dataflow.md` §1（フローチャート）、ADR-008 D8（7 分岐表）

---

## 5. EARS要件・設計文書との対応関係

- **参照したユーザストーリー**: 認証ガード（未認証/未所属ユーザーの保護ページアクセス制御）
- **参照した機能要件**:
  - REQ-101: 未認証ユーザーの保護ページアクセス → `/login` リダイレクト
  - REQ-102: ログイン済未所属ユーザー → `/onboarding` リダイレクト
  - REQ-103: ログイン済所属ユーザーが `/login` / `/onboarding` → `/` リダイレクト
  - REQ-108: ログイン後の復帰のため `redirect` クエリ（`encodeURIComponent(to.fullPath)`）を付与
- **参照した非機能要件**:
  - NFR-002: 1 ナビゲーション 1 クエリ（`useAsyncData('current-group')` キャッシュ共有）
  - NFR-104: グローバル middleware による保護漏れゼロ
  - NFR-301: mock unit による分岐網羅
- **参照したEdgeケース**: `/join/**` の page 側未認証リダイレクト例外（ADR-008 D1 例外）、`/confirm` public 通過
- **参照した受け入れ基準**: ADR-008 D8 の 7 分岐表（TC1〜TC7、8 行目「未認証+/login」は TC2 に代表集約）
- **参照した設計文書**:
  - **アーキテクチャ**: `docs/design/auth-onboarding/architecture.md` §認証 middleware、ADR-008 D1-D8
  - **データフロー**: `docs/design/auth-onboarding/dataflow.md` §1（判定フローチャート）
  - **型定義**: `docs/design/auth-onboarding/interfaces.ts`（`CurrentGroup` / `AsyncState`）
  - **データベース**: 該当なし（本タスクは新規 RLS/RPC を作らない。`group_members` RLS は data-foundation で検証済）
  - **API仕様**: 該当なし（middleware はリダイレクト判定のみ）

---

## 6. テスト要件（ADR-008 D8 / 7 分岐）

**テストファイル**: `tests/unit/middleware/auth.test.ts`

🔵 **mock 方針（`defineNuxtRouteMiddleware`）**
`defineNuxtRouteMiddleware` を**恒等関数**として mock する（渡された `fn` をそのまま返す）。これにより middleware の `default export` が「`to` を受け取る async 関数」そのものとなり、テストでは `to` オブジェクト (`{ path, fullPath }`) を直接渡して呼び出して戻り値・`navigateTo` 呼び出しを検証する。

🔵 **mock 対象（`vi.hoisted` + `vi.mock`）**
- `useSupabaseUser`: `{ value: null }`（未認証）または `{ value: <user> }`（ログイン済）を返す。
- `useCurrentGroup`: `{ data: { value: null } }`（未所属）または `{ data: { value: <group> } }`（所属済）を返す。
- `navigateTo`: `vi.fn()` でスパイ（呼び出し引数を検証）。
- `beforeEach` で `vi.clearAllMocks()` によりテスト間を隔離。

🔵 **テストケース（7 分岐・最小カバレッジ）**

| TC | user | currentGroup | to.path | 期待 |
|---|---|---|---|---|
| TC1 | null | — | `/` | `navigateTo('/login?redirect=/')` |
| TC2 | null | — | `/login` | 通過（`navigateTo` 未呼び出し） |
| TC3 | X | null | `/` | `navigateTo('/onboarding')` |
| TC4 | X | null | `/groups/new` | 通過 |
| TC5 | X | G | `/login` | `navigateTo('/')` |
| TC6 | X | G | `/onboarding` | `navigateTo('/')` |
| TC7 | X | G | `/` | 通過 |

---

## 品質判定

✅ **高品質**
- 要件の曖昧さ: なし（判定フローは dataflow.md §1 と ADR-008 D8 で完全に確定）
- 入出力定義: 完全（`to.path` / `to.fullPath` / `useSupabaseUser` / `useCurrentGroup` の型・戻り値、出力 `navigateTo` を明記）
- 制約条件: 明確（NFR-002 キャッシュ共有、ADR-008 D6 isomorphic、D7 エラー委譲）
- 実装可能性: 確実（実装テンプレート確定済、前提タスク TASK-0009 実装済）
- 信頼性レベル: 🔵 が大多数（🟡 は redirect エンコードの 1 項目のみ、🔴 なし）

**信頼性分布**: 🔵 ≒ 96% / 🟡 ≒ 4% / 🔴 0%

---

## 次フェーズへの注意点（testcases フェーズ）

1. **7 ケースの分岐カバレッジ**: 各 TC で `to.path` / `user.value` / `currentGroup.value` の組み合わせを明示し、OR (`PUBLIC_PATHS.includes || startsWith('/join/')`) / AND (`!currentGroup.value && !GROUP_OPTIONAL_PATHS.includes`) の条件網羅を確認する。
2. **`defineNuxtRouteMiddleware` の恒等関数 mock**: テストは default export を「`to` を引数に取る関数」として直接呼び出す前提で設計する。
3. **mock 戻り値型の正確性**: `useSupabaseUser` は `{ value: ... }`、`useCurrentGroup` は `{ data: { value: ... } }` という**ネストの差**に注意（混同しやすい）。
4. **`/login` 所属済は public 分岐側**: TC5 は非 public ブランチではなく public 分岐（`to.path === '/login' && user.value`）で `navigateTo('/')` する経路をテストする。
5. **通過ケースの検証方法**: TC2 / TC4 / TC7 は「`navigateTo` が呼ばれない」ことを `expect(navigateTo).not.toHaveBeenCalled()` で検証する。
6. **8 行目の代表集約**: ADR-008 D8 の「未認証 + /login → 通過」は TC2 に集約済み。冗長ケースは追加しない（memory `feedback_test_coverage`）。
