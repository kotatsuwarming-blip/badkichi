# Green フェーズ記録: /join/[code] ページ (TASK-0018)

- **機能名**: 招待リンク着地ページ (`buildLoginRedirect` 純粋関数 + `/join/[code]` ページ)
- **タスクID**: TASK-0018
- **要件名**: auth-onboarding
- **実装日**: 2026-06-01
- **フェーズ**: Green（最小実装完了）

---

## 実装ファイル一覧

| ファイル | 種別 | 変更内容 |
|---|---|---|
| `app/utils/redirect.ts` | 新規作成 | `buildLoginRedirect(path: string): string` 純粋関数 |
| `app/pages/join/[code].vue` | 新規作成 | 招待リンク着地ページ |
| `i18n/locales/ja.json` | 変更 | `join.description` キー追加 |
| `i18n/locales/en.json` | 変更 | `join.description` キー追加（空文字列） |

---

## 実装コード

### app/utils/redirect.ts

```ts
/**
 * 【機能概要】: 着地パス（/join/[code]）を /login?redirect= クエリに連結して返す
 * 【実装方針】: path 全体を encodeURIComponent でエンコードして redirect クエリ値として運搬する。
 * 【テスト対応】: TC-D2-1（通常パス）/ TC-D2-2（特殊文字）
 * 🔵 REQ-108 / EDGE-001
 */
export function buildLoginRedirect(path: string): string {
  return '/login?redirect=' + encodeURIComponent(path)
}
```

### app/pages/join/[code].vue（要点）

- `definePageMeta` 指定なし → `default.vue` 自動継承 (ADR-011 D1)
- `onMounted` で `user.value` を判定:
  - `null` (未ログイン): `navigateTo(buildLoginRedirect(route.fullPath))` (REQ-108 / EDGE-001)
  - 非 null (ログイン済): `route.params.code` を正規化し `useJoinGroup().join(code)` を呼ぶ
- 成功時: `navigateTo('/')` (REQ-005)
- 失敗時: `notice` が `useJoinGroup` 側でセット済 → `<UAlert>` で永続表示 (REQ-105/106/107)
- 処理中: `pending` で `<USkeleton>` 表示 (NFR-202)
- 文言: `t('join.title')` / `t('join.description')` / `t('join.processing')` 経由 (NFR-204)

---

## 実装方針と判断理由

1. **`buildLoginRedirect` 純粋関数化**: testcases.md §0 で採用決定済み。D2 (redirect URL 組み立て) は回帰しやすく型チェックでは検出されないため切り出して mock-unit で保護する。
2. **`onMounted` で認証判定**: Nuxt の SSR/CSR 境界を意識し、`useSupabaseUser()` の値が確定する CSR 側で判定する。
3. **配列ガード + `??`フォールバック**: `route.params.code` の型 `string | string[] | undefined` に対し型安全に `string` へ正規化。空文字列のフォールバック時は DB が `invitation_not_found` を返し `useJoinGroup` が適切に処理する。
4. **EDGE-005 の page への影響ゼロ**: DB 識別子変換は `useJoinGroup` に閉じており、page は `notice.value` を表示するだけ。

---

## テスト実行結果

```
 RUN  v4.1.4

 Test Files  23 passed (23)
      Tests  86 passed (86)
   Duration  994ms
```

- `tests/unit/utils/redirect.test.ts`: TC-D2-1 / TC-D2-2 両方 ✅
- 既存テスト 84 ケース: 全て継続 ✅
- `pnpm typecheck`: エラーなし ✅
- `pnpm exec eslint --fix`: エラーなし ✅

---

## 課題・改善点（Refactorフェーズで対応）

- `app/pages/join/[code].vue` は `onMounted` 内で全処理を行っているが、`watch` ベースに変更することでリアクティブ性を高める選択肢もある（現状でも動作は正しい）
- `route.params.code` の配列正規化ロジックは `resolveQueryParam` 相当の共通ユーティリティに移動できる可能性がある
- `app/utils/redirect.ts` と `app/utils/query.ts` は同じ「URL パラメータ整形」ドメインに属するため、将来的にファイル統合を検討できる
