# TASK-0017: /groups/new ページ TDD テストケース定義書

**機能名**: groups-new (Group 作成画面)
**タスクID**: TASK-0017
**要件名**: auth-onboarding
**出力ファイル**: `docs/implements/auth-onboarding/TASK-0017/groups-new-testcases.md`
**作成日**: 2026-06-01

---

## 0. 結論サマリー (先に読むべき判定)

- **本 page (`app/pages/groups/new.vue`) に新規 unit テストは追加しない（テストケース 0 件）**。
- **navigateTo 分岐の判定**: **page 単体テスト不要**。理由は §1 / §4 に詳述。
- **依存層テスト緑を前提とする**（追加実装不要、既存テストの再確認のみ）:
  - フォーム検証 (1〜50 文字 / trim 後空白不可、EDGE-101〜105): `tests/unit/schemas/group-name.test.ts` (TASK-0006)
  - `create` 成功 / `invalid_group_name` 失敗 / `setFieldError` / `refresh()` / `pending` 制御: `tests/unit/composables/useCreateGroup.test.ts` (TASK-0010)
- **page の通し動作 (作成 → トップ遷移)** は E2E (TASK-0020 / NFR-302) に委譲。

> このドキュメントは「最小の境界値 + 分岐網羅」を満たすために *何をテストし何をテストしないか* を確定するものである。本タスクの結論は「page 固有 unit テストはゼロ。navigateTo 分岐も page 単体テスト不要」であり、その根拠を以下に明示する。

---

## 1. テスト要否の分析（page 固有ロジックの棚卸し）

`app/pages/groups/new.vue` が持つロジックを列挙し、各々の検証主体を確定する。

| # | page 内ロジック | 検証主体 | 本 page で書くか | 信頼性 |
|---|---|---|---|---|
| L1 | `<UForm :schema="groupNameSchema">` による送信前同期検証 (1〜50 / 空白不可) | Zod `group-name` (TASK-0006) のテスト | ❌ 書かない (依存層検証済) | 🔵 |
| L2 | 送信で `useCreateGroup().create(name)` を呼ぶ | `useCreateGroup` (TASK-0010) のテスト (RPC 引数・refresh・fieldErrors) | ❌ 書かない (依存層検証済) | 🔵 |
| L3 | `invalid_group_name` → `fieldErrors['name']` を `<UFormField>` inline 表示 | `useCreateGroup` が `setFieldError('name')` するまでが検証済。inline 描画は Nuxt UI `<UFormField>` 標準バインド | ❌ 書かない (依存層 + UI ライブラリ責務、NFR-301) | 🔵 |
| L4 | 送信中 `pending` を送信ボタン `:disabled` にバインド | `pending` の挙動は `useCreateGroup` 検証済。page 側は単なる prop バインドで分岐ロジックなし | ❌ 書かない (冗長、要件 §6 で「書かない方針が妥当」) | 🔵 |
| L5 | **`create` 成功 (`error === null`) → `navigateTo('/')` / 失敗 (`error != null`) → 遷移しない** | **page にのみ存在する結線分岐** | ⚠️ 要判定 (§4 で確定) | 🟡 |

L1〜L4 は依存層 / UI ライブラリで検証済のため本 page では書かない（NFR-301「page UI 見た目テストを書かない」+ プロジェクト規約「冗長ケース禁止」）。
残る **L5 (navigateTo 分岐)** のみが page 固有であり、§4 で要否を確定する。

- **参照した要件**: 要件定義 §6 テスト対象範囲, NFR-301
- **参照した実装**: `app/composables/useCreateGroup.ts` (ActionResult 返却, setFieldError, refresh)

---

## 2. 正常系テストケース

**該当なし（0 件）**。

- 正常系の本体（有効名 → create 成功 → 遷移）は次の 2 つに分解され、いずれも本 page の単体テスト対象外:
  - Zod 検証通過: `group-name.test.ts` で検証済 (TASK-0006)。
  - `create` 成功 + `refresh()`: `useCreateGroup.test.ts` TC1 で検証済 (TASK-0010)。
  - 「成功 → トップ遷移」の通し確認: E2E (TASK-0020 / NFR-302) に委譲。
- 🔵 要件定義 §6「テストしない（依存層で検証済 / 見た目）」+ タスクファイル §単体テスト要件に厳密対応。

---

## 3. 異常系テストケース

**該当なし（0 件）**。

- `invalid_group_name` (RPC 最終防衛) → `fieldErrors['name']` 設定は `useCreateGroup.test.ts` TC2 で検証済 (setFieldError 呼出 + refresh 非呼出)。
- inline error の描画自体は Nuxt UI `<UFormField>` の標準バインド責務 (NFR-301 で見た目テスト対象外)。
- 「同名グループ重複」エラーは存在しない (`groups.name` に UNIQUE 制約なし、architecture.md 注1) ため異常系ケース自体が存在しない。
- 🔵 要件定義 §4「同名重複なし」/ §6, error-handling.md §6.3 #2 に厳密対応。

---

## 4. 境界値テストケース / navigateTo 分岐の最終判定

### 4.1 境界値テスト

**該当なし（0 件）**。境界値 (0 / 1 / 50 / 51 文字、trim 後空白) は Zod `group-name` (TASK-0006) の `group-name.test.ts` で EDGE-101〜105 として検証済。本 page では再テストしない（冗長ケース禁止）。
🔵 要件定義 §4 EDGE-101〜105 / §6 に厳密対応。

### 4.2 navigateTo 分岐（L5）の要否判定 — **判定: page 単体テスト不要**

検討対象の分岐（page 固有）:

```ts
const { error } = await create(form.name)
if (error === null) {
  await navigateTo('/')   // 成功分岐
}
// error != null → 何もしない（fieldErrors は composable が設定済、inline 表示）
```

#### 不要と判定する根拠（4 点）

1. **🟡 分岐ロジックが自明かつ最小**: 分岐は `error === null` 単一条件の通過/非通過のみ。固有の計算・変換・状態組み立てを持たず、`useCreateGroup` が返す `ActionResult.error` をそのまま判定するだけの結線である。プロジェクト規約「最小の境界値 + 分岐網羅、冗長ケース禁止」に照らし、自明な prop/result 消費は単体テスト価値が低い。

2. **🔵 同パターンが依存層で実証済**: 「composable 結果の `error` 有無で navigateTo を分岐する」パターンは `useLogin.test.ts` TC2 (成功 → `navigateTo('/login')`) / TC3 (`error` → navigateTo 非呼出) で既に検証済み。同型の分岐を page 層で再度書くのは冗長。本 page の分岐は方向 (`'/'`) が違うだけで構造は同一。

3. **🔵 テスト基盤コストが分岐価値に見合わない**: 現行 Vitest 設定 (`vitest.config.ts`) は `include: ['tests/unit/**/*.test.ts']` の **mock-unit 一択**で、`.vue` のマウント基盤 (`@vue/test-utils` の `mount` / happy-dom / jsdom) は未導入（既存テストに `.vue` / `mount` 利用ゼロ）。L5 を page で検証するには (a) コンポーネントマウント基盤の新規導入、または (b) 分岐を別関数へ抽出して `<UForm @submit>` から呼ぶ過剰設計、のいずれかが必要。NFR-301 が page 単体テストを原則不要と定める中で、この分岐 1 つのために基盤を導入するのは「最小」原則に反する。

4. **🔵 通し検証が E2E で担保される**: 「成功 → トップ遷移」「失敗 → 留まり inline 表示」の end-to-end は TASK-0020 (E2E / NFR-302) でカバー予定。page 結線の最終的な正しさは E2E が保証するため、unit 層で重複させない。

#### 代替の品質担保

- 実装時 (tdd-green) に **`navigateTo` を `error === null` のときのみ呼ぶ / 失敗時は呼ばない** ことをコードレビュー観点（本書 §4.2 の分岐コード）で確認する。
- `pnpm typecheck` で `ActionResult<string>` (`{ data, error }`) の構造一致を静的に保証する（`error` フィールドの存在・型は型検査で担保）。
- 通し動作は E2E (TASK-0020) で検証。

> **結論**: navigateTo 分岐 (L5) は **page 単体テストとして書かない**。自明な結線・同型パターンの依存層実証済み・基盤コスト過大・E2E 担保の 4 点から「不要」と確定する。

- **参照した要件**: NFR-301, NFR-302, 要件定義 §6（navigateTo 分岐の要否を tdd-testcases で最終判断する旨）
- **参照した実装/基盤**: `tests/unit/composables/useLogin.test.ts` (同型分岐の実証), `vitest.config.ts` (mock-unit 限定基盤), `app/composables/useCreateGroup.ts` (ActionResult)

---

## 5. 依存層テスト緑の前提確認（本タスクで実施する唯一の検証アクション）

本 page は新規 unit テストを持たないため、tdd-red/green での「赤→緑」対象は依存層の既存テスト緑確認に限られる。

| 前提 | テストファイル | 確認内容 |
|---|---|---|
| Zod 検証 | `tests/unit/schemas/group-name.test.ts` | EDGE-101〜105 境界が緑 |
| create 結線 | `tests/unit/composables/useCreateGroup.test.ts` | TC1 成功 (refresh) / TC2 失敗 (setFieldError) が緑 |

- 実行コマンド: `pnpm vitest run tests/unit/schemas/group-name.test.ts tests/unit/composables/useCreateGroup.test.ts`
- いずれも緑であれば、本 page 実装 (tdd-green) は依存契約に乗るだけで完了する。
- 🔵 タスクファイル §単体テスト要件 / note.md §5 テスト関連情報に厳密対応。

---

## 6. 開発言語・フレームワーク

- **プログラミング言語**: TypeScript (strict mode) / Vue 3 SFC `<script setup lang="ts">`
  - **言語選択の理由**: プロジェクト全体が Nuxt 4 + TypeScript strict (CLAUDE.md)。page も同一。
  - **テストに適した機能**: 静的型検査 (`pnpm typecheck`) が `ActionResult` 構造を保証し、navigateTo 分岐の型安全を unit テストなしで担保。
- **テストフレームワーク**: Vitest + `@nuxt/test-utils`（依存層のみ。本 page は対象外）
  - **フレームワーク選択の理由**: 既存 mock-unit 基盤 (`vitest.config.ts`) と統一。`#nuxt-router` / `#supabase-client` alias で Nuxt composable を mock 可能。
  - **テスト実行環境**: `tests/unit/**/*.test.ts`（mock unit、pre-commit + CI）。本 page は新規テストを追加しないため実行対象に登録しない。
- 🔵 CLAUDE.md / note.md §5 / vitest.config.ts に厳密対応。

---

## 7. テストケース数と内訳

| 分類 | 件数 | 備考 |
|---|---|---|
| 正常系 | 0 | 依存層 (Zod / useCreateGroup) + E2E で検証 |
| 異常系 | 0 | `invalid_group_name` は useCreateGroup 検証済、同名重複は存在せず |
| 境界値 | 0 | EDGE-101〜105 は Zod スキーマテストで検証済 |
| **page 固有 (navigateTo 分岐)** | **0** | **判定: 不要**（§4.2、自明結線 / 同型実証済 / 基盤コスト過大 / E2E 担保） |
| **合計 (本 page 新規)** | **0** | NFR-301 + 冗長ケース禁止に基づく |

**前提として緑を確認する依存層テスト**: 2 ファイル（group-name.test.ts, useCreateGroup.test.ts）。

---

## 8. 要件定義との対応関係

- **参照した機能概要**: 要件定義 §1（Group 作成画面、成功時トップ遷移）
- **参照した入力・出力仕様**: 要件定義 §2（form.name 入力 / 成功 navigateTo / 検証 inline / RPC inline / pending disabled）
- **参照した制約条件**: 要件定義 §3（NFR-201/202/204, REQ-406, ADR-005/008/011, 同名重複なし）
- **参照した使用例**: 要件定義 §4（正常系 / EDGE-101〜105 / EDGE-003 / REQ-109 / 同名重複なし）
- **参照したテスト対象範囲**: 要件定義 §6（依存層検証済の非テスト項目 + navigateTo 分岐の要否判断委譲）

---

## 信頼性レベルサマリー

| セクション | 🔵 | 🟡 | 🔴 |
|---|---|---|---|
| §1 ロジック棚卸し (L1〜L4) | 4 | 0 | 0 |
| §1 / §4.2 navigateTo 分岐 (L5) | 3 | 1 | 0 |
| §2 正常系 | 1 | 0 | 0 |
| §3 異常系 | 1 | 0 | 0 |
| §4.1 境界値 | 1 | 0 | 0 |
| §5 依存層前提 | 1 | 0 | 0 |

- **品質評価**: 高品質。🔵 が大半。🟡 は navigateTo 分岐が「page 固有結線である」という性質判断 1 点のみで、判定結論（不要）の根拠は 🔵（依存層実証・基盤制約・E2E 担保）に支えられている。🔴 なし。
- **テストケース総数**: 0 件（本 page 新規）。NFR-301 + 冗長ケース禁止に整合。
- **navigateTo 分岐**: 不要と確定。
