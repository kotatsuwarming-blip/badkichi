# Green フェーズ記録: useCurrentGroup

**機能名**: useCurrentGroup（現在の所属 Group 読み取り composable）
**タスク ID**: TASK-0009
**要件名**: auth-onboarding
**フェーズ**: Green（最小実装）
**作成日**: 2026-06-01

---

## 1. 実装ファイル

`app/composables/useCurrentGroup.ts`

---

## 2. 実装コード（全文）

```typescript
/**
 * 【機能概要】: ログイン中ユーザが所属している Group を 1 件読み取る Read 専用 composable
 * 【実装方針】: useAsyncData('current-group', handler) の固定キーでラップし、
 *             middleware と page が同一キーを共有して 1 ナビゲーション 1 クエリを保証する (NFR-002 / ADR-008 D4)
 * 【テスト対応】: TC1 (所属あり SELECT 結果素通し + uid 絞り込み検証) / TC2 (0 行 null 素通し検証)
 * 🔵 REQ-005 / ADR-006 / ADR-007 / ADR-008 D4 / interfaces.ts UseCurrentGroupReturn
 */

import type { Database } from '~/types/supabase'

export function useCurrentGroup() {
  // 【supabase クライアント取得】: Database 型付きで型安全に PostgREST SELECT を呼ぶ 🔵
  const client = useSupabaseClient<Database>()

  // 【認証ユーザ取得】: uid は user.sub (user.id ではない) — memory project_mvp_revised_scope 確定 🔵
  const user = useSupabaseUser()

  // 【useAsyncData 固定キー】: 'current-group' 固定でラップ。NFR-002 / ADR-008 D4 🔵
  return useAsyncData('current-group', async () => {
    // 【uid 取得】: JWT の sub claim を uid として使用 (user.id ではない) 🔵
    const uid = user.value?.sub

    // 【未認証ガード】: uid 不在時はクエリを発行せず null を即返す 🔵
    if (!uid) return null

    // 【group_members SELECT】: groups 埋め込み付き、uid で絞り込み 🔵
    const { data, error } = await client
      .from('group_members')
      .select('group_id, groups(id, name)')
      .eq('user_id', uid)
      .maybeSingle()

    // 【エラーハンドリング】: クエリエラーは throw → error.vue フォールバック 🔵
    if (error) throw error

    // 【結果返却】: 所属あり → オブジェクト / 未所属 → null を素通し 🔵
    return data
  })
}
```

---

## 3. 実装方針と判断理由

| 方針 | 理由 |
|------|------|
| `useAsyncData('current-group', handler)` の戻り値をそのまま return | AsyncState<CurrentGroup> 型 (`data / pending / error / refresh`) に一致、await せず AsyncState のまま返す |
| uid は `user.value?.sub` | memory `project_mvp_revised_scope` 確定、`user.id` ではない |
| `.maybeSingle()` | ADR-006 で 1 user = 1 group が保証されるため複数行例外は発生しない |
| 0 行（未所属）は null で正常返却 | `maybeSingle` の仕様 (`{ data: null, error: null }`)、例外を投げない |
| クエリエラーは `throw error` のみ | error.vue グローバルフォールバックに委ねる（error-handling.md チャネル分岐は本タスク非適用） |
| `groups` embed の `| null` を維持 | supabase.ts 生成型を真とする方針（isOneToOne: false のため nullable 推論） |

---

## 4. テスト実行結果

```
 Test Files  13 passed (13)
      Tests  45 passed (45)
   Start at  17:42:40
   Duration  538ms
```

- TC1（所属あり）: PASS — `data.value` がオブジェクト同値、`eq('user_id', 'u1')` 呼び出し確認、`error.value` null
- TC2（未所属）: PASS — `data.value` null、`error.value` null（例外なし）
- `pnpm typecheck`: エラーなし通過

---

## 5. 品質判定

| 項目 | 結果 |
|------|------|
| テスト結果 | ✅ 全 45 件通過（useCurrentGroup は TC1 / TC2 の 2 件含む） |
| 実装品質 | ✅ シンプル・最小限（50 行未満） |
| typecheck | ✅ エラーなし |
| ファイルサイズ | ✅ 50 行以下（800 行制限を大幅に下回る） |
| モック使用 | ✅ 実装コードにモック・スタブなし |
| 信頼性レベル | 🔵 全箇所（推測なし） |

---

## 6. Refactor フェーズへの注意点

- `groups` embed 型: supabase.ts 生成型が `| null` を含む（isOneToOne: false）ため、page 側で `groups?.name` の optional access が必要。本 composable の戻り値型は現状で正しい。
- `useAsyncData` の戻り値型が自動推論されるため、明示的な型注釈（`: UseCurrentGroupReturn`）を追加するとドキュメンタリー価値が高まる（Refactor 候補）。
- 現状の実装はシンプルで変更不要レベル。Refactor はコメント整理・型注釈追加程度で完了見込み。
