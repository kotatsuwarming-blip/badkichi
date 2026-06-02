# TASK-0017: /groups/new ページ TDD要件定義書

**機能名**: groups-new (Group 作成画面)
**タスクID**: TASK-0017
**要件名**: auth-onboarding
**出力ファイル**: `docs/implements/auth-onboarding/TASK-0017/groups-new-requirements.md`
**作成日**: 2026-06-01

---

## 1. 機能の概要（EARS要件定義書・設計文書ベース）

- 🔵 **何をする機能か**: ログイン済みユーザが Group 名を入力して新しい Group を作成し、作成成功後にトップ (`/`) へ遷移する画面 (`app/pages/groups/new.vue`)。Group 名フォーム (`<UForm>` + `<UFormField>`) を表示し、Zod スキーマ `group-name` で同期検証したうえで `useCreateGroup().create(name)` を実行する。
- 🔵 **どのような問題を解決するか**: As a ログイン済みユーザ, I want 自分の Group を作成したい, So that チームのデータを管理する単位 (オーナーとして所属する Group) を立ち上げられる。未所属ユーザがオンボーディングの一環として Group を新規作成する導線を提供する。
- 🔵 **想定されるユーザー**: ログイン済みユーザ。未所属ユーザでも到達可能 (middleware `auth.global.ts` の未所属許可 path、ADR-008 D1)。page 内に所属判定は書かない。
- 🔵 **システム内での位置づけ**: Phase 3 - UI層。Domain composable `useCreateGroup` (TASK-0010) と Zod スキーマ `group-name` (TASK-0006) を結線する presentation 層。page から Supabase を直接叩かず composable 経由でのみアクセスする (REQ-406 / ADR-005 D1)。layout は無指定で `default.vue` を継承 (ADR-011 D1)。

- **参照したEARS要件**: REQ-004 (Group 名フォーム表示 + RPC 実行), REQ-109 (`invalid_group_name` inline 表示)
- **参照した設計文書**: `docs/design/auth-onboarding/architecture.md` §画面構成 / §レイアウト戦略, `docs/design/auth-onboarding/dataflow.md` §3 Group 作成フロー

---

## 2. 入力・出力の仕様（EARS機能要件・TypeScript型定義ベース）

### 入力

- 🔵 **フォーム入力**: Group 名 (`form.name`, 文字列)。`<UInput>` に `v-model` でバインド。
- 🔵 **Zod 検証スキーマ**: `groupNameSchema` (`app/schemas/group-name.ts`)。`z.string().trim().min(1).max(50)`。trim 後 1〜50 文字、空白のみは trim 後 0 文字となり `min(1)` で弾かれる (NFR-201, EDGE-105)。違反時 message は `'invalid_group_name'` (locale キーと整合)。

### 出力

- 🔵 **成功時**: `useCreateGroup().create(name)` が `{ data: group_id(string), error: null }` を返却 → `navigateTo('/')` でトップへ遷移。`useCurrentGroup().refresh()` は composable 内部で実行済み (page 側では呼ばない)。
- 🔵 **検証エラー時 (Zod)**: `<UFormField name="name">` の inline error として表示 (NFR-201)。`<UForm>` の schema 連携で送信前同期検証。
- 🔵 **RPC エラー時 (`invalid_group_name`)**: `useCreateGroup.fieldErrors['name']` を `<UFormField name="name">` の inline error として Group 名フィールド直下に表示 (REQ-109 / error-handling.md §6.3 #2)。page は context 文字列を持たない (error-handling.md §5.5)。
- 🔵 **送信中**: `useCreateGroup.pending` (`Ref<boolean>`) が `true` の間、送信ボタンを disabled にする (EDGE-003 / NFR-202)。

### 依存 composable の契約 (interfaces.ts §5 / 実装済)

- 🔵 `useCreateGroup(): { create: (groupName: string) => Promise<ActionResult<string>>, pending: Ref<boolean>, fieldErrors: Ref<Record<string, string>> }`
  - `ActionResult<T>` = `{ data: T | null, error: unknown }`
  - `create` は内部で `clear()` → `pending=true` → RPC → 成否分岐 (成功: `refresh()`、失敗: `setFieldError('name', error)`) → `finally pending=false` を実行する。

### 入出力の関係性 / データフロー (dataflow.md §3)

```
User Input → Zod parse
  ├─ Fail    → fieldErrors display (<UFormField> inline)
  └─ Success → create(name) [pending=true]
       ├─ RPC Success            → (composable: refresh()) → navigateTo('/')
       └─ RPC invalid_group_name → (composable: setFieldError('name')) → inline 表示
       └─ finally pending=false
```

- **参照したEARS要件**: REQ-004, REQ-109, NFR-201, NFR-202
- **参照した設計文書**: `app/composables/useCreateGroup.ts` (UseCreateGroupReturn), `app/schemas/group-name.ts` (groupNameSchema), `docs/design/auth-onboarding/dataflow.md` §3

---

## 3. 制約条件（EARS非機能要件・アーキテクチャ設計ベース）

- 🔵 **二重送信防止 (NFR-202 / EDGE-003)**: 送信中は `useCreateGroup.pending` で送信ボタンを disabled にし、重複 Group が作られないようにする。
- 🔵 **同期バリデーション (NFR-201)**: `<UForm>` の schema に Zod `group-name` を渡し、送信前に inline error で検証する。境界 (EDGE-101〜105) は Zod 側で完結。
- 🔵 **文言の locale 経由 (NFR-204)**: label / error / button label は `useI18n().t()` 経由で `locales/ja.json` から取得。TS コードに直書きしない。`errors.invalid_group_name` キーは既存。
- 🔵 **composable 経由アクセス (REQ-406 / ADR-005 D1)**: page から Supabase を直接呼ばない。`useCreateGroup` 経由のみ。
- 🔵 **エラー識別子集約 (ADR-005 D2 / error-handling.md §4)**: `INVALID_GROUP_NAME: 'invalid_group_name'` は `app/types/error-codes.ts` 定義済を import。フラット直書きしない。
- 🔵 **context 文字列を page に持たない (error-handling.md §5.5)**: フィールド原因が明確なため context は composable 内に閉じる。page には文言のみ返る。
- 🔵 **layout 無指定継承 (ADR-011 D1)**: `definePageMeta` でレイアウト指定せず `default.vue` を自動継承 (ログアウトボタン付きヘッダー)。
- 🔵 **未所属ユーザ到達可能 (ADR-008 D1 / dataflow.md §1)**: middleware は `/groups/new` を未所属許可 path とし `/onboarding` へリダイレクトしない。page 内に所属判定を書かない。
- 🔵 **同名重複エラーは存在しない (architecture.md §既存 API マッピング 注1)**: `groups.name` に UNIQUE 制約がないため `GROUP_NAME_TAKEN` / `UNIQUE_VIOLATION` 分岐は採用しない。create のエラーは `invalid_group_name` のみ。
- 🔵 **RPC 引数名 (architecture.md §既存 API マッピング)**: `group_name` (要件定義の `p_group_name` は誤記)。引数名は `useCreateGroup` 内に閉じるため page では意識しない。
- 🔵 **技術スタック制約**: Nuxt 4.4 + Vue 3 + TypeScript strict mode、Nuxt UI v4.5 (`<UForm>` / `<UFormField>` / `<UInput>` / `<UButton>`、v4.3+ で `<UFormGroup>` → `<UFormField>` 改称済)、Zod 4.x。`<script setup lang="ts">` (Composition API のみ)。`any` 回避。ESLint 1tbs / no comma dangle。
- 🟡 **アクセシビリティ**: `<UForm>` / `<UFormField>` の label / error 関連付けの Nuxt UI v4 標準 aria に従う (標準動作のため明示実装不要、推測)。
- 🔵 **モバイル対応**: `<UForm>` / `<UFormField>` をモバイル幅でも崩れず表示 (Nuxt UI v4 標準レスポンシブ)。

- **参照したEARS要件**: NFR-201, NFR-202, NFR-204, REQ-109, REQ-406, EDGE-003
- **参照した設計文書**: `docs/design/auth-onboarding/architecture.md` (§既存 API マッピング 注1, §レイアウト戦略), `docs/design/cross-cutting/error-handling.md` (§4, §5.2, §5.5, §6.2, §6.3 #2), ADR-005 / ADR-008 / ADR-011

---

## 4. 想定される使用例（EARS Edgeケース・データフローベース）

### 基本的な使用パターン (REQ-004)

- 🔵 **正常系**: ユーザが有効な Group 名 (trim 後 1〜50 文字) を入力 → 送信 → Zod 検証通過 → `create(name)` 成功 → `navigateTo('/')`。

### エッジケース・エラーケース

- 🔵 **EDGE-101〜105 (境界値、Zod 側で完結)**: 0 文字 / 空白のみ (trim 後 0 文字) → `min(1)` で inline error。1 文字 (下限 OK)。50 文字 (上限 OK)。51 文字 → `max(50)` で inline error。これらは Zod スキーマ `group-name` (TASK-0006) のテストで検証済。
- 🔵 **EDGE-003 (二重送信)**: 送信ボタン押下後、`pending=true` の間はボタン disabled → 連打しても 2 回目の `create` が走らない。
- 🔵 **REQ-109 (RPC `invalid_group_name`)**: Zod をすり抜けて RPC が `invalid_group_name` を返した場合 (最終防衛) → `fieldErrors['name']` に設定され `<UFormField>` inline で表示。`create` 内部処理は composable (TASK-0010) のテストで検証済。
- 🔵 **同名重複なし**: UNIQUE 制約がないため、同名 Group を続けて作成してもエラーにならず両方成功する (architecture.md 注1)。

- **参照したEARS要件**: EDGE-003, EDGE-101〜105, REQ-109
- **参照した設計文書**: `docs/design/auth-onboarding/dataflow.md` §3, `docs/design/cross-cutting/error-handling.md` §6.3 #2

---

## 5. EARS要件・設計文書との対応関係

- **参照したユーザストーリー**: ログイン済みユーザによる Group 新規作成 (オンボーディング導線)
- **参照した機能要件**: REQ-004 (Group 名フォーム + RPC), REQ-109 (`invalid_group_name` inline), REQ-406 (composable 経由)
- **参照した非機能要件**: NFR-201 (同期 inline 検証), NFR-202 (処理中 disabled), NFR-204 (文言 locales 経由), NFR-301 (page 見た目テストを書かない)
- **参照したEdgeケース**: EDGE-003 (二重送信防止), EDGE-101〜105 (境界値)
- **参照した受け入れ基準**:
  - `<UForm>` + `<UFormField>` で Group 名フォーム表示、Zod 同期検証
  - 送信で `create(name)`、成功時 `navigateTo('/')`
  - `invalid_group_name` を `<UFormField>` inline で表示
  - 送信中ボタン disabled
  - 文言 locales 経由 / layout 無指定 default 継承
- **参照した設計文書**:
  - **アーキテクチャ**: `docs/design/auth-onboarding/architecture.md` (§画面構成, §レイアウト戦略, §既存 API マッピング 注1)
  - **データフロー**: `docs/design/auth-onboarding/dataflow.md` §3 Group 作成フロー
  - **型定義**: `app/composables/useCreateGroup.ts` (UseCreateGroupReturn, ActionResult), `app/schemas/group-name.ts` (groupNameSchema)
  - **エラー実装規約**: `docs/design/cross-cutting/error-handling.md` (§4, §5.2, §5.5, §6.2, §6.3 #2)
  - **ADR**: ADR-005 (エラーハンドリング), ADR-007 (composable 命名), ADR-008 (middleware), ADR-011 (レイアウト)

---

## 6. テスト対象範囲（NFR-301 / プロジェクト規約「最小境界値 + 分岐網羅」）

### テストしない (依存層で検証済 / 見た目)

- 🔵 **フォーム検証 (1〜50 文字 / 空白のみ不可、EDGE-101〜105)**: Zod スキーマ `group-name` (TASK-0006) の `tests/unit/schemas/group-name.test.ts` で検証済。本 page では再テストしない。
- 🔵 **`create` の成功 / `invalid_group_name` 失敗 / `setFieldError` / `refresh()` 呼び出し / `pending` 制御**: `useCreateGroup` (TASK-0010) のテストで検証済。本 page では再テストしない。
- 🔵 **UI 全体の見た目テスト**: NFR-301 により書かない。
- 🔵 **RPC + RLS 通し検証**: data-foundation 側 integration test (ADR-012) で済。
- 🔵 **ログイン後の作成 → トップ遷移の通し確認**: TASK-0020 (E2E / NFR-302) に委譲。

### テストしうる (page 固有の結線/分岐ロジックがあれば最小対象)

- 🟡 **page 固有の結線ロジック**: 「`create` 成功時に `navigateTo('/')` を呼ぶ / 失敗時 (`error != null`) に遷移しない」という分岐は page にのみ存在し、依存層では検証されない。NFR-301 は「page UI 見た目テストを書かない」だが、この遷移分岐は見た目でなく結線ロジックのため、最小 2 ケース (成功→遷移呼出 / 失敗→遷移非呼出) で分岐網羅できる候補となる。テスト要否は tdd-testcases で最終判断する。
- 🟡 **pending → ボタン disabled の結線**: `pending` を `:disabled` にバインドする結線。`pending` 自体の挙動は composable テスト済のため、page 側は bind の有無のみで分岐ロジックが薄い。冗長になりやすく、書かない方針が妥当 (tdd-testcases で確定)。

> 備考: タスクファイル §単体テスト要件は「page は結線のため本タスクでは単体テストなし (NFR-301)」と明記。原則は unit テストなしだが、上記 navigateTo 分岐のみ最小テスト候補として tdd-testcases で精査する。

---

## 信頼性レベルサマリー

| カテゴリ | 🔵 | 🟡 | 🔴 |
|---|---|---|---|
| 1. 機能の概要 | 4 | 0 | 0 |
| 2. 入力・出力 | 全項目 | 0 | 0 |
| 3. 制約条件 | 11 | 1 | 0 |
| 4. 使用例 | 5 | 0 | 0 |
| 6. テスト対象範囲 | 5 | 2 | 0 |

- **品質評価**: 高品質。🔵 が大半、🟡 はアクセシビリティ標準動作 (Nuxt UI 委譲) と page 固有テストの要否判断のみ。🔴 なし。
- **要件の曖昧さ**: なし
- **入出力定義**: 完全 (依存 composable / Zod の実装済シグネチャと一致)
- **制約条件**: 明確
- **実装可能性**: 確実 (依存 TASK-0006 / TASK-0010 / TASK-0014 実装済)
