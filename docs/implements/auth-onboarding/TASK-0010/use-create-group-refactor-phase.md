# Refactor フェーズ記録: useCreateGroup

**機能名**: useCreateGroup（RPC）
**タスクID**: TASK-0010
**要件名**: auth-onboarding
**フェーズ**: Refactor（品質改善完了）
**実施日**: 2026-06-01

---

## リファクタリング内容

### 改善点: brace-style (1tbs) lint エラー修正

**改善前 (Green フェーズ)**

```typescript
    }
    finally {
      pending.value = false
    }
```

**改善後 (Refactor フェーズ)**

```typescript
    } finally {
      pending.value = false
    }
```

- **原因**: `@stylistic/brace-style` ルール（1tbs スタイル）により、`finally` ブロックの開き波括弧は前のブロックの閉じ波括弧と同行に記載が必要
- **信頼性**: 🔵（プロジェクトの ESLint 設定 CLAUDE.md §Coding Conventions 「1tbs brace style」に明記）

---

## 改善後の最終コード

`app/composables/useCreateGroup.ts`

```typescript
/**
 * 【機能概要】: グループ作成 RPC を実行する Write 系 composable
 * 【実装方針】: rpc('create_group_with_owner', { group_name }) を呼び、
 *             成功時は useCurrentGroup().refresh() で所属状態を最新化し、
 *             エラー時は useFormErrors チャネルに inline 表示する。
 *             pending は try/finally で確実に false にリセット（EDGE-003 二重送信防止）
 * 【テスト対応】: TC1 (成功 → RPC 引数検証 + refresh 呼出 + ActionResult 返却)
 *              TC2 (invalid_group_name → setFieldError 呼出 + refresh 非呼出)
 * 🔵 TASK-0010.md §実装詳細 / dataflow.md §3 D5-1〜D5-4 / interfaces.ts §5 UseCreateGroupReturn
 */

import type { Database } from '~/types/supabase'
import type { Ref } from 'vue'

/** ActionResult<T>: アクション関数の共通戻り値型 (interfaces.ts §3 契約に従う) 🔵 */
interface ActionResult<T> {
  data: T | null
  error: unknown
}

/** UseCreateGroupReturn: useCreateGroup の戻り値型 (interfaces.ts §5 契約に従う) 🔵 */
interface UseCreateGroupReturn {
  create: (groupName: string) => Promise<ActionResult<string>>
  pending: Ref<boolean>
  fieldErrors: Ref<Record<string, string>>
}

export function useCreateGroup(): UseCreateGroupReturn {
  const pending = ref(false)
  const { fieldErrors, setFieldError, clear } = useFormErrors()
  const supabase = useSupabaseClient<Database>()

  async function create(groupName: string): Promise<ActionResult<string>> {
    clear()
    pending.value = true

    try {
      const { data, error } = await supabase.rpc('create_group_with_owner', { group_name: groupName })

      if (error) {
        setFieldError('name', error)
        return { data: null, error }
      }

      await useCurrentGroup().refresh()

      return { data, error: null }
    } finally {
      pending.value = false
    }
  }

  return { create, pending, fieldErrors }
}
```

---

## セキュリティレビュー結果

| 観点 | 評価 | 詳細 |
|---|---|---|
| インジェクション対策 | ✅ 問題なし | `useSupabaseClient<Database>()` 型付きクライアント経由 (PreparedStatement 相当) |
| 入力値検証 | ✅ 問題なし | page 側 Zod 事前検証 + RPC 側 CHECK 制約で二重防御 |
| センシティブ情報露出 | ✅ 問題なし | `setFieldError` に error をそのまま渡すが、文言変換は `useErrorMessage` がマスク |
| 認証・認可 | ✅ 問題なし | Supabase セッション Cookie 経由。composable は認証状態を直接操作しない |

**重大な脆弱性: なし** 🔵

---

## パフォーマンスレビュー結果

| 観点 | 評価 | 詳細 |
|---|---|---|
| 不要クエリ防止 | ✅ 問題なし | `refresh()` は成功時のみ呼ぶ（エラー経路では再クエリ不発生） |
| 初期化コスト | ✅ 問題なし | `useSupabaseClient` / `useFormErrors` は composable トップレベルで 1 回のみ取得 |
| キャッシュ共有 | ✅ 問題なし | `useCurrentGroup()` は `useAsyncData('current-group')` 固定キーで middleware と共有 (ADR-008 D4) |

**重大なパフォーマンス課題: なし** 🟡

---

## テスト実行結果

```
 Test Files  14 passed (14)
      Tests  47 passed (47)
   Duration  593ms
```

`pnpm typecheck` も通過。

---

## 品質判定

```
✅ 高品質:
- テスト結果: 全 47 テスト継続成功 (TC1/TC2 とも 2ms 以内)
- セキュリティ: 重大な脆弱性なし
- パフォーマンス: 重大な性能課題なし
- リファクタ品質: lint エラー（brace-style）修正完了 / 追加改善不要と判断
- コード品質: ESLint (app/composables + tests/unit 対象) / typecheck ともに通過
- ファイルサイズ: 90 行（500 行制限内）
- ドキュメント: 完成
```

---

## 追加品質チェック（2026-06-01 再確認）

brace-style 修正・コメント強化後に改めて全観点を再点検した結果、追加リファクタリング不要と判断:

| 観点 | 判定 | 理由 |
|---|---|---|
| 型定義インライン配置 | ✅ 現状維持 | 他 composable（useCurrentGroup / useFormErrors）と同パターン。`app/types/interfaces.ts` 未整備のため移行不要 |
| `useCurrentGroup()` 呼び出し位置 | ✅ 現状維持 | create 内で呼ぶパターンはテスト mock と整合しており変更不要 |
| 一時ファイル | ✅ なし | debug-* / temp-* 等の不要ファイルなし |
| テストスキップ | ✅ なし | describe.skip / it.skip なし、全 2 ケース有効 |
