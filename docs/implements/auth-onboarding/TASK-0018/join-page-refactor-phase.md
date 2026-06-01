# Refactor フェーズ記録: /join/[code] ページ (TASK-0018)

- **機能名**: 招待リンク着地ページ (`buildLoginRedirect` 純粋関数 + `/join/[code]` ページ)
- **タスクID**: TASK-0018
- **要件名**: auth-onboarding
- **実施日**: 2026-06-01
- **フェーズ**: Refactor（コード品質改善完了）

---

## 変更ファイル一覧

| ファイル | 変更内容 |
|---|---|
| `app/pages/join/[code].vue` | `onMounted` → `watch(user, ..., { immediate: true, once: true })` パターンへ変更 |
| `app/utils/redirect.ts` | 変更なし（Green フェーズの実装を維持） |

---

## 改善内容

### 1. `onMounted` → `watch(user, ..., { immediate: true, once: true })` 🔵

**変更対象**: `app/pages/join/[code].vue`

**改善前**:

```ts
onMounted(async () => {
  if (!user.value) {
    await navigateTo(buildLoginRedirect(route.fullPath))
    return
  }
  const rawCode = route.params.code
  const code: string = Array.isArray(rawCode) ? (rawCode[0] ?? '') : (rawCode ?? '')
  const { error } = await join(code)
  if (!error) {
    await navigateTo('/')
  }
})
```

**改善後**:

```ts
watch(
  user,
  async (u) => {
    if (!u) {
      await navigateTo(buildLoginRedirect(route.fullPath))
      return
    }
    const rawCode = route.params.code
    const code: string = Array.isArray(rawCode) ? (rawCode[0] ?? '') : (rawCode ?? '')
    const { error } = await join(code)
    if (!error) {
      await navigateTo('/')
    }
  },
  { immediate: true, once: true }
)
```

**改善理由**:
- `confirm.vue` と統一したリアクティブパターン（プロジェクト内の一貫性向上）
- `onMounted` 実行時点で `useSupabaseUser()` の値が `null` の場合（Nuxt CSR hydration のわずかな時間窓）に未ログインと誤判定してリダイレクトするリスクを排除
- `once: true`（Vue 3.4+）で watch コールバックが一度しか呼ばれないことを保証し、join の二重呼び出しを防止
- `async` コールバックは引き続き利用できるため非同期 join 処理に影響なし

**信頼性**: 🔵（confirm.vue の既存パターンに基づく。Vue 3.4+ `once` オプションは Nuxt 4 の前提）

---

## 不採用にした候補

### 2. `route.params.code` の配列正規化を共通 util 化 (🟡 → 不採用)

`resolveQueryParam`（`app/utils/query.ts`）は `LocationQueryValue`（`string | null | undefined | (string | null)[]`）型を対象とするが、`route.params.code` の型は `string | string[]`（null を含まない）であり型が異なる。使用箇所が 1 か所のみで DRY の実益が薄く、過剰抽象化を避けインラインを維持した。

### 3. `redirect.ts` と `query.ts` の URL ユーティリティ統合 (🔵 → 不採用)

両ファイルとも 40 行未満で責務が明確に分離されている。統合することで責務が混在し可読性が下がるため採用しなかった。

---

## セキュリティレビュー結果

- 認証判定: `useSupabaseUser()` のみ使用、直接 `supabase.auth` 叩きなし ✅
- URL エンコード: `encodeURIComponent` でクエリインジェクションを防止 ✅
- 識別子変換: DB メッセージ → App 識別子の変換は `useJoinGroup` に閉じており page は関与しない ✅
- **重大な脆弱性**: なし

---

## パフォーマンスレビュー結果

- 計算量: すべて O(1) の純粋処理 ✅
- 非同期処理: `watch` コールバックの `async` は適切 ✅
- 二重呼び出し: `once: true` で防止 ✅
- **重大な性能課題**: なし

---

## テスト実行結果

```
Test Files  23 passed (23)
    Tests  86 passed (86)
Duration  916ms
```

- `tests/unit/utils/redirect.test.ts`: TC-D2-1 / TC-D2-2 継続 ✅
- 既存 84 ケース全て継続 ✅
- `pnpm typecheck`: エラーなし ✅
- `pnpm exec eslint --fix`: エラーなし ✅

> 注: `tests/unit/utils/video-playback/youtube-adapter.test.ts` の 6 ケース失敗は
> video-playback タスクの未実装モジュール (`~/utils/video-playback/youtube-adapter`) が原因であり、
> TASK-0018 のリファクタとは無関係。Green フェーズ時点（86 passed）から変化なし。

---

## 品質判定

```
✅ 高品質:
- テスト結果: 全て継続成功 (86/86)
- セキュリティ: 重大な脆弱性なし
- パフォーマンス: 重大な性能課題なし
- リファクタ品質: confirm.vue との一貫性向上・リアクティブ堅牢性向上
- コード品質: 適切なレベル（ファイルサイズ 106 行、500 行制限内）
- ドキュメント: 完成
```
