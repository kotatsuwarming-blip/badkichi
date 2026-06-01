# TDD要件定義書: /join/[code] ページ (TASK-0018)

- **機能名**: 招待リンク着地ページ (`/join/[code]`)
- **タスクID**: TASK-0018
- **要件名**: auth-onboarding
- **実装ファイル**: `app/pages/join/[code].vue`
- **依存**: `useJoinGroup` (TASK-0011), `default.vue` layout (TASK-0014), `auth.global.ts` middleware (TASK-0013)
- **作成日**: 2026-06-01

---

## 1. 機能の概要（EARS要件定義書・設計文書ベース）

- 🔵 **何をする機能か**: 招待リンク `/join/[code]` を着地点として受け取り、ルートパラメータ `code` を招待コードとして扱う。未ログインならログイン動線へ誘導し、ログイン済なら `useJoinGroup().join(code)` を呼んで Group 参加処理を行う。成功すれば `/` (ダッシュボード) へ遷移し、失敗すれば `<UAlert>` で永続エラー通知を表示する。
- 🔵 **どのような問題を解決するか**: 既存メンバーが発行した招待リンクを受け取った人が、ログイン状態を問わず正しくオンボーディング動線に乗り、Group に参加できるようにする。未ログイン時にコードを失わないよう `redirect` クエリで URI を保持する (EDGE-001 リダイレクトチェーンの起点)。
- 🔵 **想定されるユーザー**: チームに新しく招待される選手・メンバー。URL を直接踏むケース (ログイン済 / 未ログインの双方) を含む。
- 🔵 **システム内での位置づけ**: UI 層 (Nuxt 4 ファイルベースルーティングの page)。`/join/**` は middleware (`auth.global.ts`) の **public path** として未ログインでも通過させ、未認証リダイレクトは page 内で行う (ADR-008 D1 の例外)。join のドメインロジック・識別子変換は依存 composable `useJoinGroup` 側に閉じ、page は結線と表示のみを担う。

- **参照したEARS要件**: REQ-005, REQ-105, REQ-106, REQ-107, REQ-108
- **参照した設計文書**:
  - `docs/design/auth-onboarding/dataflow.md` §1 (middleware フロー), §4 (招待リンク参加 sequence)
  - `docs/design/auth-onboarding/architecture.md` §画面構成 / §既存 API マッピング
  - `docs/decisions/` ADR-008 D1 (例外: page 内リダイレクト), ADR-011 D1 (layout 継承)

---

## 2. 入力・出力の仕様（EARS機能要件・TypeScript型定義ベース）

### 入力

- 🔵 **route params `code`** (`string`): 招待コード。`useRoute().params.code` から取得。8 文字想定だが page では長さ検証しない (不正長は DB 側で `invitation_not_found` 扱い、EDGE-005/106)。
- 🔵 **認証状態**: `useSupabaseUser()` の `Ref<User | null>`。`null` を未ログインと判定する (直接 `supabase.auth` を叩かない)。
- 🟡 **route query `redirect`**: 本 page では入力として消費しない。`/login?redirect=/join/[code]` を **出力** として生成する側 (login.vue 側が `resolveQueryParam` で消費)。

### 出力 (副作用 / 状態)

- 🔵 **未ログイン時の遷移**: `navigateTo('/login?redirect=/join/[code]')`。`/join/[code]` 部分は現在のパス (code を含む実 URL) を保持する (REQ-108)。
- 🔵 **成功時の遷移**: `useJoinGroup().join(code)` が `{ data: group_id, error: null }` を返したら `navigateTo('/')` (REQ-005, dataflow.md §4)。`useCurrentGroup().refresh()` は `useJoinGroup` 内で実施済のため page では呼ばない。
- 🔵 **失敗時の表示**: `useJoinGroup().notice` (`Ref<string | null>`) に App エラー識別子が入る。これを `<UAlert>` で永続表示する。識別子は次の 3 種:
  | App 識別子 | 文言キー (i18n) | 対応 REQ |
  |---|---|---|
  | `ALREADY_IN_GROUP` | `errors.already_in_group` | REQ-105 |
  | `INVITATION_NOT_FOUND_BY_LINK` | `errors.invitation_not_found_by_link` | REQ-107 / EDGE-005 |
  | `INVITATION_EXPIRED` | `errors.invitation_expired` | REQ-106 |
- 🔵 **ローディング表示**: `useJoinGroup().pending` (`Ref<boolean>`) が `true` の間、`<USkeleton>` 表示 / 操作要素を `disabled` にする (NFR-202)。
- 🔵 **文言**: すべて `useI18n().t()` 経由 (`join.title` / `join.processing` 等 + `errors.*`)。文字列リテラル直書き禁止 (NFR-204)。

### 入出力の関係性 / データフロー

- 🔵 `code` (入力) → `join(code)` → 成否で遷移先 (`/`) または `notice` 文字列 (出力) が分岐。
- 🔵 認証状態 (入力) が `null` → 遷移先 `/login?redirect=/join/[code]` (出力)。

- **参照したEARS要件**: REQ-005, REQ-105, REQ-106, REQ-107, REQ-108
- **参照した設計文書**: `docs/design/auth-onboarding/interfaces.ts` (`ActionResult<T>`, `UseJoinGroupReturn`), `app/composables/useJoinGroup.ts`, `i18n/locales/ja.json` (`join.*`, `errors.*`), `app/utils/query.ts` (resolveQueryParam)

---

## 3. 制約条件（EARS非機能要件・アーキテクチャ設計ベース）

- 🔵 **アーキテクチャ制約 (ADR-008 D1 例外 / REQ-108)**: `/join/**` は middleware では public path として通す。未認証判定とリダイレクトは **page 内** で `navigateTo('/login?redirect=...)` として実行する。middleware に未認証ガードを入れない。
- 🔵 **責務分離 (EDGE-005 / architecture.md §既存 API マッピング 注2)**: DB メッセージ `invitation_not_found` → App 識別子 `INVITATION_NOT_FOUND_BY_LINK` の明示変換は `useJoinGroup` 内に閉じる。page は DB メッセージ / context / 識別子変換を一切意識しない (素朴な `includes` を page 側に持たない)。
- 🔵 **layout 制約 (ADR-011 D1)**: `definePageMeta` で layout を指定しない → `default.vue` を自動継承。public path であることと layout 分岐は独立。
- 🔵 **エラー表示チャネル (error-handling.md §6.2/§6.3 #3)**: 着地ページはフィールド特定不能のため inline ではなく `<UAlert>` を使う。`notice` は永続通知でユーザが明示クリアするまで残す (error-handling.md §6.1)。
- 🔵 **状態管理制約**: ユーザ取得は `useSupabaseUser()` のみ。Group 参加は `useJoinGroup().join()` のみ。`useCurrentGroup().refresh()` は composable 内で実施済 (page で重複呼び出ししない)。
- 🔵 **パフォーマンス / UX (NFR-202)**: 処理中は `pending` で `<USkeleton>` / disabled を表示し、二重送信を防ぐ。
- 🔵 **i18n (NFR-204)**: 全文言を locales 経由。
- 🔵 **テスト制約 (NFR-301 + ADR-012 D5 + vitest mock-unit 限定)**: vitest は mock-unit のみで `.vue` のマウント (`@vue/test-utils` 等のレンダリング) は行わない。よって UI 見た目テストは書かない。`tests/unit/pages/` は設けない方針。
- 🔵 **コーディング規約 (CLAUDE.md)**: `<script setup lang="ts">` + Composition API のみ。TypeScript strict。ESLint 1tbs / no comma dangle。Nuxt UI コンポーネント使用。

- **参照したEARS要件**: REQ-108, NFR-202, NFR-204, NFR-301
- **参照した設計文書**: ADR-008 D1, ADR-011 D1, ADR-012 D5, `docs/design/cross-cutting/error-handling.md` §6.1/§6.2/§6.3, `CLAUDE.md`

---

## 4. 想定される使用例（EARS Edgeケース・データフローベース）

### 基本的な使用パターン

- 🔵 **UC1 (REQ-005, dataflow.md §4 成功系)**: ログイン済ユーザが有効な招待リンクを開く → `join(code)` 成功 → `/` へ遷移。
- 🔵 **UC2 (REQ-108, EDGE-001 起点)**: 未ログインユーザが招待リンクを開く → `navigateTo('/login?redirect=/join/[code]')`。

### データフロー (dataflow.md §4)

- 🔵 page → `useSupabaseUser()` で認証判定 → (未ログイン) `/login?redirect=...` / (ログイン済) `join(code)` → RPC `join_group_with_code` → 成否分岐 → 成功時 `useCurrentGroup.refresh()` + `/` 遷移、失敗時 `notice` セット → `<UAlert>`。

### エラーケース (EARS Edge)

- 🔵 **EC1 (REQ-105)**: 既に Group 所属のユーザが参加試行 → `already_in_group` → `notice = ALREADY_IN_GROUP` → `<UAlert>`。
- 🔵 **EC2 (REQ-106)**: 期限切れ招待 → `invitation_expired` → `notice = INVITATION_EXPIRED` → `<UAlert>`。
- 🔵 **EC3 (REQ-107 / EDGE-005 / EDGE-106)**: 無効・不存在・不正文字・長さ8文字以外の code → DB で `invitation_not_found` → (`useJoinGroup` 内で明示変換) `notice = INVITATION_NOT_FOUND_BY_LINK` → `<UAlert>`。新規識別子は追加しない。
- 🔵 **EC4 (EDGE-001 全体)**: 未ログイン → `/login?redirect=/join/[code]` → Google OAuth → `/confirm?redirect=/join/[code]` → セッション確立 → `/join/[code]` 再着地 → join 成功 → `/`。page の責務はチェーンの起点 (UC2) と終点 (UC1) のみ。チェーン全体の通し確認は TASK-0020 (E2E) に委譲。

- **参照したEARS要件**: REQ-005, REQ-105, REQ-106, REQ-107, REQ-108, EDGE-001, EDGE-005, EDGE-106
- **参照した設計文書**: `docs/design/auth-onboarding/dataflow.md` §1 / §4

---

## 5. テスト対象範囲の明確化（NFR-301 + mock-unit 限定の検証配置）

NFR-301 (UI 見た目テストを書かない) と vitest mock-unit 限定 (`.vue` マウント不可) を前提に、page 固有ロジックの各分岐が **どの層で検証されるか** を以下に明示する。

### A. 依存層 (`useJoinGroup`, TASK-0011) で検証済 — page で再テストしない

- 🔵 join 成功 → `data: group_id`, `error: null`, `notice: null`, `refresh()` 呼び出し (TC1)
- 🔵 `invitation_not_found` → `INVITATION_NOT_FOUND_BY_LINK` 明示変換 (TC2, EDGE-005)
- 🔵 `already_in_group` → `notice` 反映 (TC3, REQ-105)
- 🔵 `invitation_expired` → `notice` 反映 (TC4, REQ-106)
- 🔵 `pending` の true/false 遷移 (composable 内 finally)
- 参照: `tests/unit/composables/useJoinGroup.test.ts` (TC1-TC4)

### B. data-foundation 統合テスト (ADR-012) で検証済 — page スコープ外

- 🔵 RPC `join_group_with_code` + RLS の通し動作。

### C. E2E (TASK-0020, NFR-302) に委譲

- 🔵 EDGE-001 リダイレクトチェーン全体 (`/join` → `/login?redirect` → OAuth → `/confirm` → `/join` → `/`)。
- 🔵 `<UAlert>` / `<USkeleton>` の実レンダリング・aria。

### D. page 固有で未検証のロジック (テスト候補として明示)

page 固有の結線・分岐のうち、A〜C のいずれでも直接カバーされない純粋ロジックは以下。NFR-301 と mock-unit 制約により page 単体テストは **最小 / 省略** が方針だが、純粋関数として切り出せば mock-unit でテスト可能なため、テスト候補として残す。

| # | ロジック | 現状の検証配置 | テスト候補としての扱い |
|---|---|---|---|
| D1 | 認証状態判定: `user.value === null` → 未ログイン分岐 | 未検証 (page 固有)。構成要素 `useSupabaseUser`/`navigateTo` は標準 API | 🟡 NFR-301 により最小/省略。E2E (UC2) でカバー |
| D2 | redirect URL 組み立て: 現在パス `/join/[code]` を `/login?redirect=` に正しく連結 (code を含む実 URL を保持) | 未検証 (page 固有) | 🟡 **テスト候補**。URL 生成を純粋関数 (例 `buildLoginRedirect(path)`) に切り出せば mock-unit 1ケースで検証可。切り出さない場合は E2E (EDGE-001) に委譲 |
| D3 | join 成否で遷移先を出し分け (成功→`/` / 失敗→`<UAlert>`) | join 成否自体は A で検証済。遷移の結線 (成功時のみ `navigateTo('/')`) は page 固有で未検証 | 🟡 NFR-301 により最小/省略。E2E (UC1) でカバー |
| D4 | `code` を `useRoute().params.code` から取得し `join()` へ渡す結線 | 未検証 (page 固有) | 🟡 NFR-301 により最小/省略。E2E でカバー |

**推奨**: D1/D3/D4 は Nuxt 標準 API への単純結線のため NFR-301 に従い page 単体テストを省略し E2E に委譲する。**D2 (redirect URL 生成) のみ**、code を含む URL 保持はリダイレクトチェーン成立の要であり回帰しやすいため、純粋関数に切り出して mock-unit で 1 ケース (例: パス `/join/ABC123` → `/login?redirect=%2Fjoin%2FABC123` または非エンコード連結) を検証することを候補として残す。切り出さず page にインライン実装する場合は E2E (EDGE-001) のみでの担保とする。

- **参照したEARS要件**: REQ-108, EDGE-001, NFR-301, NFR-302
- **参照した設計文書**: `docs/tasks/auth-onboarding/TASK-0018.md` §単体テスト要件 / §統合テスト要件, ADR-012 D5

---

## 6. EARS要件・設計文書との対応関係

- **参照したユーザストーリー**: 招待リンクからの Group 参加 (オンボーディング動線)
- **参照した機能要件**: REQ-005 (RPC 呼び出し), REQ-105 (`ALREADY_IN_GROUP`), REQ-106 (`INVITATION_EXPIRED`), REQ-107 (`INVITATION_NOT_FOUND_BY_LINK`), REQ-108 (未ログイン redirect)
- **参照した非機能要件**: NFR-202 (ローディング), NFR-204 (i18n), NFR-301 (page テスト最小化), NFR-302 (E2E)
- **参照したEdgeケース**: EDGE-001 (リダイレクトチェーン), EDGE-005 (不正 code → `INVITATION_NOT_FOUND_BY_LINK`), EDGE-106 (長さ8文字以外)
- **参照した受け入れ基準**: TASK-0018 §完了条件 (未ログイン redirect / 成功時 `/` / 失敗時 `<UAlert>` 永続 / pending ローディング / locales / default layout 継承)
- **参照した設計文書**:
  - **アーキテクチャ**: `architecture.md` §画面構成 / §既存 API マッピング (注2), ADR-008 D1 例外, ADR-011 D1
  - **データフロー**: `dataflow.md` §1 (middleware), §4 (join sequence)
  - **型定義**: `interfaces.ts` (`ActionResult<T>`, `UseJoinGroupReturn`)
  - **データベース / API**: `data-foundation/api-endpoints.md` §join_group_with_code (RPC)
  - **エラー戦略**: `cross-cutting/error-handling.md` §4 (識別子), §6.1 (永続通知), §6.2/§6.3 #3 (`<UAlert>` 選択)
  - **i18n**: `i18n/locales/ja.json` (`join.*`, `errors.*`)
  - **参考実装**: `app/pages/login.vue`, `app/pages/confirm.vue` (resolveQueryParam パターン), `app/composables/useJoinGroup.ts`

---

## 品質判定

- 要件の曖昧さ: なし (全分岐の検証配置を明示)
- 入出力定義: 完全 (入力 code/認証状態、出力 遷移/notice/pending を型付きで定義)
- 制約条件: 明確 (ADR-008 D1 例外 / ADR-011 D1 / NFR / mock-unit 限定)
- 実装可能性: 確実 (依存 composable 緑、参考 page 実装あり)
- 信頼性レベル分布: 🔵 多数 / 🟡 少数 (テスト切り出しの推測のみ) / 🔴 なし
- **総合判定**: ✅ 高品質
