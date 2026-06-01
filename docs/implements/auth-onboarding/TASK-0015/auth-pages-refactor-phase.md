# TDD Refactor フェーズ記録: auth-pages (TASK-0015)

**機能名**: 認証前ページ (auth-pages: `/login` + `/confirm`)
**タスクID**: TASK-0015
**要件名**: auth-onboarding
**実施日**: 2026-06-01

---

## リファクタリング概要

Green フェーズで `login.vue` / `confirm.vue` に重複していた `route.query.redirect` 配列ガード正規化ロジックを、共通ユーティリティ関数 `resolveQueryParam` に抽出した。

---

## 改善内容

### 1. `app/utils/query.ts` — 新規作成 🔵

**改善種別**: DRY 原則 / 重複コードの除去 (refactoring_guidelines §2)

**Before (login.vue / confirm.vue に各々):**
```ts
// login.vue
const redirect = Array.isArray(route.query.redirect)
  ? route.query.redirect[0] ?? undefined
  : route.query.redirect ?? undefined

// confirm.vue
const redirect = Array.isArray(route.query.redirect)
  ? route.query.redirect[0] ?? '/'
  : route.query.redirect ?? '/'
```

**After:**
```ts
// app/utils/query.ts に集約
export function resolveQueryParam(value: QueryValue): string | undefined
export function resolveQueryParam(value: QueryValue, fallback: string): string
```

**設計方針**:
- `route.query` の値は `LocationQueryValue | LocationQueryValue[]` (= `string | null | (string|null)[]`) になりうる
- `fallback` を省略した場合は `string | undefined` を返し、指定した場合は `string` を返すオーバーロードシグネチャを定義
- 副作用なし・ルーティング非依存のピュア関数のため `composable` ではなく `utils` に配置
- ファイル名 `query.ts` は Vue Router のクエリ操作に関連することを示す

### 2. `app/pages/login.vue` — 更新 🔵

```ts
// Before
const redirect = Array.isArray(route.query.redirect)
  ? route.query.redirect[0] ?? undefined
  : route.query.redirect ?? undefined

// After
const redirect = resolveQueryParam(route.query.redirect)
```

### 3. `app/pages/confirm.vue` — 更新 🔵

```ts
// Before
const redirect = Array.isArray(route.query.redirect)
  ? route.query.redirect[0] ?? '/'
  : route.query.redirect ?? '/'

// After
const redirect = resolveQueryParam(route.query.redirect, '/')
```

---

## セキュリティレビュー

| 観点 | 評価 | 内容 |
|---|---|---|
| open redirect | ✅ 問題なし | Supabase Auth の `redirectTo` URL ホワイトリストと middleware の判定で対策済み。page 側での追加検証は不要 |
| XSS | ✅ 問題なし | `route.query.redirect` は `navigateTo()` の第一引数としてのみ使用。DOM への直接挿入なし |
| CSRF | ✅ 問題なし | OAuth フローは Supabase Auth が管理。page 側に CSRF 攻撃面なし |
| Supabase 直叩き | ✅ 遵守 | page から `supabase.auth` / `supabase.from` / `supabase.rpc` の直接呼び出しなし (REQ-406) |
| Secret 漏洩 | ✅ 問題なし | publishable key のみ使用。service_role key は不使用 |

---

## パフォーマンスレビュー

| 観点 | 評価 | 内容 |
|---|---|---|
| `resolveQueryParam` の計算量 | ✅ O(1) | 配列判定 + 先頭要素取得のみ。ループなし |
| メモリ | ✅ 問題なし | 文字列のコピーのみ。新規オブジェクト生成なし |
| バンドルサイズ | ✅ 極小 | 約 10 行の純粋関数。Tree-shaking 対象 |
| watch の効率 | ✅ 問題なし (変更なし) | Green フェーズからの変更なし。`immediate: true` + user 変化時のみ発火 |

---

## テスト実行結果

```
pnpm typecheck  → エラーなし
pnpm test --run → 18 files / 61 tests — 全 passed
pnpm lint (新規・変更ファイル対象) → エラーなし
```

- 既存 lint エラー (`app/layouts/auth.vue`, `app/layouts/default.vue`, `docs/design/video-playback/interfaces.ts`) は本タスク範囲外の既存問題。変更なし。

---

## 変更ファイル一覧

| ファイル | 変更種別 | 内容 |
|---|---|---|
| `app/utils/query.ts` | 新規作成 | `resolveQueryParam` ユーティリティ関数 |
| `app/pages/login.vue` | 更新 | 配列ガードを `resolveQueryParam` 呼び出しに置換 |
| `app/pages/confirm.vue` | 更新 | 配列ガードを `resolveQueryParam` 呼び出しに置換 |

---

## コード品質評価

| 観点 | 判定 | 内容 |
|---|---|---|
| DRY 原則 | ✅ 改善 | 重複ロジックを 1 箇所に集約 |
| 単一責任 | ✅ 良好 | `resolveQueryParam` はクエリ値正規化のみを担当 |
| 型安全性 | ✅ 改善 | `LocationQueryValue[]` を正しく受け入れるオーバーロードシグネチャ定義 |
| ファイルサイズ | ✅ 良好 | login.vue: 65 行 / confirm.vue: 84 行 / query.ts: 38 行（全て 500 行未満） |
| コメント | ✅ 充実 | 日本語コメント + 信頼性レベル付与済み |
| 過剰抽象化なし | ✅ 良好 | composable にせず utils に配置。副作用ゼロのピュア関数 |

**総合品質評価**: ✅ 高品質
