# TASK-0013: auth.global.ts middleware — Refactor フェーズ記録

**作成日**: 2026-06-01  
**タスク ID**: TASK-0013  
**要件名**: auth-onboarding  
**フェーズ**: Refactor（品質改善完了）

---

## 1. 改善方針

Green フェーズからの引き継ぎ事項を全て対応した。

| 項目 | 内容 | 信頼性 |
|------|------|--------|
| 定数の切り出し | `PUBLIC_PATHS` / `GROUP_OPTIONAL_PATHS` を関数外のモジュールスコープ const へ移動 | 🔵 |
| コメント整理 | 冗長な行内コメントを削減し、重要な情報（REQ番号・ADR参照）は保持 | 🔵 |
| lint 修正 | `auth.test.ts` の `@stylistic/member-delimiter-style` エラーを修正 (`;` → `,`) | 🔵 |

---

## 2. 改善内容詳細

### 2-1. 定数のモジュールスコープへの切り出し

**変更前（関数内定数）**:

```typescript
export default defineNuxtRouteMiddleware(async (to) => {
  const PUBLIC_PATHS = ['/login', '/confirm']
  const isPublicPath = PUBLIC_PATHS.includes(to.path) || to.path.startsWith('/join/')
  const GROUP_OPTIONAL_PATHS = ['/onboarding', '/groups/new']
  ...
})
```

**変更後（モジュールスコープ定数）**:

```typescript
// 【PUBLIC_PATHS】: 認証チェックをスキップする固定パス一覧 🔵
const PUBLIC_PATHS = ['/login', '/confirm']

// 【GROUP_OPTIONAL_PATHS】: ログイン済・未所属でも通過を許可するパス一覧 🔵
const GROUP_OPTIONAL_PATHS = ['/onboarding', '/groups/new']

export default defineNuxtRouteMiddleware(async (to) => {
  const isPublicPath = PUBLIC_PATHS.includes(to.path) || to.path.startsWith('/join/')
  ...
})
```

**改善理由**:
- ナビゲーション毎の配列生成を回避（パフォーマンス）
- 定数の役割が外から一目で確認できる（可読性）
- 将来の path 追加時に 1 箇所のみ変更すれば良い（保守性）

### 2-2. コメント整理

- 行内のノイズコメント（「罠」「注意」「1 段ネスト」等の実装者向け詳細メモ）を削除
- REQ 番号・ADR 参照・設計意図は残して保守時のコンテキストを維持
- ファイルヘッダに isomorphic 原則の明示を追加

### 2-3. lint エラー修正（テストファイル）

`tests/unit/middleware/auth.test.ts` line 30 の inline 型定義でセミコロン区切りを使用していた箇所を ESLint `@stylistic/member-delimiter-style` に合わせてカンマ区切りに修正。

```typescript
// 変更前
const currentGroupRef = { value: null as { group_id: string; groups: { id: string; name: string } | null } | null }

// 変更後
const currentGroupRef = { value: null as { group_id: string, groups: { id: string, name: string } | null } | null }
```

---

## 3. リファクタ後のコード全文

```typescript
/**
 * 【機能概要】: 認証・Group 所属チェック グローバル middleware
 * 【実装方針】: dataflow.md §1 フローチャートの 7 分岐を 1 ファイルで集約 (ADR-008 D1)
 * 【テスト対応】: TC1〜TC7 (ADR-008 D8 表) を全て通す実装
 * 【isomorphic 原則】: window / document / serverSupabaseClient 不使用。SSR/CSR 双方で動作 (ADR-008 D6)
 * 🔵 note.md §4 実装テンプレート + TASK-0013.md 実装詳細コードに厳密に対応
 */

// 【auto-import】: Nuxt 4 の auto-import により以下をグローバル利用
//   defineNuxtRouteMiddleware / useSupabaseUser / useCurrentGroup / navigateTo

// 【PUBLIC_PATHS】: 認証チェックをスキップする固定パス一覧 🔵
// /join/** は動的パスのため startsWith で別途判定 (dataflow.md §1)
const PUBLIC_PATHS = ['/login', '/confirm']

// 【GROUP_OPTIONAL_PATHS】: ログイン済・未所属でも通過を許可するパス一覧 🔵
// REQ-102 例外: Group 作成・オンボーディング動線は未所属のままアクセス可能にする
const GROUP_OPTIONAL_PATHS = ['/onboarding', '/groups/new']

export default defineNuxtRouteMiddleware(async (to) => {
  // 【public path 判定】: 固定パスか /join/** で始まるかを判定 🔵
  const isPublicPath = PUBLIC_PATHS.includes(to.path) || to.path.startsWith('/join/')

  // 【ユーザー状態取得】: useSupabaseUser は { value: User | null } を返す 🔵
  const user = useSupabaseUser()

  // ===================================================================
  // public path ブランチ (dataflow.md §1 上半分)
  // ===================================================================
  if (isPublicPath) {
    // 【/login + 所属済チェック】: REQ-103 — 所属済ユーザーが /login に来たらトップへ誘導 🔵
    // ⚠️ この分岐は public ブランチ (PubLogin ノード) で処理。非 public 側ではない
    if (to.path === '/login' && user.value) {
      // キャッシュ共有: useAsyncData('current-group') キーで 1 ナビゲーション 1 クエリ (ADR-008 D4)
      const { data: currentGroup } = await useCurrentGroup()
      if (currentGroup.value) return navigateTo('/')
    }
    // /login+未所属、/confirm、/join/** などは何もせず通す
    return
  }

  // ===================================================================
  // 非 public path ブランチ (dataflow.md §1 下半分)
  // ===================================================================

  // 【未認証チェック】: REQ-101/108 — 未認証ユーザーは redirect クエリ付きで /login へ誘導 🔵
  if (!user.value) {
    return navigateTo(`/login?redirect=${encodeURIComponent(to.fullPath)}`)
  }

  // 【Group 所属チェック】: ログイン済ユーザーの Group 所属を確認 🔵
  // キャッシュ共有: public 分岐で await 済みの場合も同一キー 'current-group' で再利用 (ADR-008 D4)
  const { data: currentGroup } = await useCurrentGroup()

  // 【未所属 + 非許可 path】: REQ-102 — 未所属ユーザーを /onboarding へ誘導 🔵
  if (!currentGroup.value && !GROUP_OPTIONAL_PATHS.includes(to.path)) {
    return navigateTo('/onboarding')
  }

  // 【所属済 + /onboarding】: REQ-103 — 所属済ユーザーが /onboarding に来たらトップへ誘導 🔵
  if (currentGroup.value && to.path === '/onboarding') {
    return navigateTo('/')
  }

  // 【通過】: ログイン済・所属済・通常保護ページの正規ユーザーは通す (TC7 カバー) 🔵
})
```

---

## 4. セキュリティレビュー結果

| 観点 | 結果 |
|------|------|
| open redirect | `navigateTo` のみ使用。外部 URL は Nuxt が制御するため問題なし |
| redirect クエリの URL エンコード | `encodeURIComponent` で安全にエンコード済み |
| 認証バイパス | `isPublicPath` 判定は AND 条件で厳密。public 漏れなし |
| isomorphic | `window` / `document` / `serverSupabaseClient` 不使用（grep 確認済み） |

**判定**: 重大な脆弱性なし ✅

---

## 5. パフォーマンスレビュー結果

| 観点 | 結果 |
|------|------|
| 定数の配列生成 | モジュールスコープに切り出したことで 1 回のみ生成（改善済み） |
| DB クエリ回数 | `useAsyncData('current-group')` キャッシュ共有で 1 ナビゲーション 1 クエリ (ADR-008 D4) |
| 早期リターン | public path は早期 return で後続処理をスキップ |

**判定**: 重大な性能課題なし ✅

---

## 6. テスト実行結果

### middleware 関連テストのみ

```
Test Files  1 passed (1)
      Tests  7 passed (7)
```

### 全スイート

```
Test Files  18 passed (18)
      Tests  61 passed (61)
   Duration  684ms
```

### lint

- `app/middleware/auth.global.ts`: エラーなし ✅
- `tests/unit/middleware/auth.test.ts`: エラーなし ✅ (リファクタ時に修正)
- `docs/design/video-playback/interfaces.ts`: 既存エラー（対象外）

### typecheck

- エラーなし ✅

---

## 7. 品質判定

✅ **高品質**

- テスト結果: 全 18 ファイル・61 テスト全成功（テスト破壊なし）
- セキュリティ: 重大な脆弱性なし
- パフォーマンス: 重大な性能課題なし
- リファクタ品質: 定数切り出し・コメント整理・lint 修正の目標を全て達成
- コード品質: 7 分岐の意図が明確、57 行（500 行制限内）
- isomorphic 原則: window / document / serverSupabaseClient 不使用を確認
