# Refactor フェーズ記録: useCurrentGroup

**機能名**: useCurrentGroup（現在の所属 Group 読み取り composable）
**タスク ID**: TASK-0009
**要件名**: auth-onboarding
**フェーズ**: Refactor（品質改善）
**作成日**: 2026-06-01

---

## 1. リファクタリング概要

Green フェーズの実装はシンプルかつ正確で、構造変更は不要と判断。
以下の品質改善のみを実施した：

| 改善項目 | 内容 | 信頼性 |
|---------|------|--------|
| `CurrentGroup` 型ローカル定義の追加 | supabase.ts 生成型から group_id / groups を直接参照する型エイリアスを composable 内に定義 | 🔵 |
| `useAsyncData<CurrentGroup \| null>` 型パラメータ明示 | handler の戻り値型を明示し、呼び出し側の `data.value` 型を TypeScript が正確に推論できるようにする | 🔵 |
| JSDoc `@returns` 追記 | 設計契約（interfaces.ts `UseCurrentGroupReturn`）との対応を関数ドキュメントに明記 | 🔵 |
| テスト lint 修正（selectMock 未使用変数 → `_selectMock`） | vi.hoisted 内で `selectMock` をテスト本体で直接参照しないため `_selectMock` にリネーム | 🔵 |
| テスト lint 修正（brace-style） | `} catch (e) {` の 1tbs スタイルに修正 | 🔵 |

---

## 2. リファクタリング後の実装コード全文

`app/composables/useCurrentGroup.ts`:

```typescript
/**
 * 【機能概要】: ログイン中ユーザが所属している Group を 1 件読み取る Read 専用 composable
 * 【実装方針】: useAsyncData('current-group', handler) の固定キーでラップし、
 *             middleware と page が同一キーを共有して 1 ナビゲーション 1 クエリを保証する (NFR-002 / ADR-008 D4)
 * 【テスト対応】: TC1 (所属あり SELECT 結果素通し + uid 絞り込み検証) / TC2 (0 行 null 素通し検証)
 * 🔵 REQ-005 / ADR-006 / ADR-007 / ADR-008 D4 / interfaces.ts UseCurrentGroupReturn
 */

import type { Database } from '~/types/supabase'

// 【型エイリアス】: group_members + groups 埋め込みの SELECT 結果型
//   supabase.ts 生成型から group_id を直接参照し、groups embed は FK 必須でも | null 許容 (isOneToOne: false)。
//   UseCurrentGroupReturn (interfaces.ts) = AsyncState<CurrentGroup> ≈ AsyncData<CurrentGroup | null, Error>。 🔵
type CurrentGroup = {
  group_id: Database['public']['Tables']['group_members']['Row']['group_id']
  groups: Pick<Database['public']['Tables']['groups']['Row'], 'id' | 'name'> | null
}

/**
 * 【機能概要】: 現在の認証済みユーザが所属する Group を取得する composable
 * 【実装方針】: group_members テーブルを groups 埋め込み付きで SELECT し AsyncData<CurrentGroup | null> を返す。
 *             所属なし（0 行）は null を正常値として返す（例外を投げない）。
 *             クエリエラーは throw し error.vue グローバルフォールバックに委ねる。
 * 【設計契約】: interfaces.ts UseCurrentGroupReturn = AsyncState<CurrentGroup> と対応
 *             (data / pending / error / refresh の 4 プロパティを呼び出し側が await で受け取る)
 * 【テスト対応】: useAsyncData をスタブするテストが handler を即時実行して data.value を検証する
 * 🔵 architecture.md §既存 API マッピング / TASK-0009.md 実装詳細
 * @returns AsyncData<CurrentGroup | null> — middleware と page が同一キー 'current-group' を共有する
 */
export function useCurrentGroup() {
  // 【supabase クライアント取得】: Database 型付きで型安全に PostgREST SELECT を呼ぶ 🔵
  const client = useSupabaseClient<Database>()

  // 【認証ユーザ取得】: uid は user.sub (user.id ではない) — memory project_mvp_revised_scope 確定 🔵
  const user = useSupabaseUser()

  // 【useAsyncData 固定キー + 型パラメータ明示】: 'current-group' 固定でラップ。
  //   <CurrentGroup | null> 型パラメータにより handler の戻り値型を明示し、呼び出し側の data.value 型を確定させる。
  //   未所属（0 行）は null を正常値として返すため | null が必要。 🔵
  //   middleware (TASK-0013) と各保護 page が同一キーを共有し、1 ナビゲーション 1 クエリを保証する (NFR-002)。
  //   動的キーにすると重複クエリが発生するため禁止 (ADR-008 D4)。 🔵
  return useAsyncData<CurrentGroup | null>('current-group', async () => {
    // 【uid 取得】: JWT の sub claim を uid として使用 (user.id ではない点に注意) 🔵
    const uid = user.value?.sub

    // 【未認証ガード】: uid が undefined の場合はクエリを発行せず null を即返す。
    //   middleware が /confirm 等でこの composable を呼ぶ場合に未認証状態になり得るため (architecture.md §未認証)。 🔵
    if (!uid) return null

    // 【group_members SELECT】: groups を埋め込みで取得し、uid で絞り込む。
    //   ADR-006 で 1 user = 1 group が保証されるため maybeSingle() を使用。
    //   0 行は { data: null, error: null } で正常値として返る (.maybeSingle の仕様)。 🔵
    const { data, error } = await client
      .from('group_members')
      .select('group_id, groups(id, name)')
      .eq('user_id', uid)
      .maybeSingle()

    // 【エラーハンドリング】: クエリエラーはそのまま throw して error.vue グローバルフォールバックに委ねる。
    //   本 composable はエラー整形・チャネル分岐を持たない (requirements.md §3 / error-handling.md 非適用)。 🔵
    if (error) throw error

    // 【結果返却】: 所属あり → { group_id, groups: { id, name } | null } / 未所属 → null を素通しする。
    //   groups embed は supabase.ts 生成型で | null 許容確定 (requirements.md §5)。 🔵
    return data
  })
}
```

---

## 3. セキュリティレビュー結果

| 観点 | 結果 |
|------|------|
| 入力値検証 | ✅ uid は `user.value?.sub` で JWT から取得、外部入力なし |
| SQL インジェクション | ✅ PostgREST クエリビルダー使用、文字列連結なし |
| 認証ガード | ✅ uid 未定義時の早期 return 実装済 |
| RLS | ✅ `is_member_of(group_id)` が data-foundation で適用済（DB 側保護） |
| データ漏洩 | ✅ RLS + `.eq('user_id', uid)` の二重フィルタ |

重大な脆弱性なし。

---

## 4. パフォーマンスレビュー結果

| 観点 | 結果 |
|------|------|
| クエリ数 | ✅ 固定キー 'current-group' により 1 ナビゲーション 1 クエリ保証 (NFR-002) |
| N+1 問題 | ✅ groups 埋め込み SELECT で JOIN を 1 回のクエリで解決 |
| キャッシュ | ✅ Nuxt useAsyncData のキャッシュ機構を活用 |
| 不要処理 | ✅ uid 未定義時の早期 return でクエリ発行を回避 |

重大な性能課題なし。

---

## 5. テスト実行結果

```
 Test Files  13 passed (13)
      Tests  45 passed (45)
   Start at  17:47:08
   Duration  505ms (transform 538ms, setup 191ms, import 725ms, tests 182ms, environment 3ms)
```

- TC1（所属あり）: PASS
- TC2（未所属）: PASS
- pnpm typecheck: エラーなし
- pnpm lint: 対象外エラー（docs/design/video-playback/interfaces.ts 既存エラー）のみ

---

## 6. 品質判定

| 項目 | 結果 |
|------|------|
| テスト結果 | ✅ 全 45 件通過 |
| セキュリティ | ✅ 重大な脆弱性なし |
| パフォーマンス | ✅ 重大な性能課題なし |
| リファクタ品質 | ✅ 型注釈明示・設計契約との対応明記 |
| コード品質 | ✅ lint / typecheck エラーなし（スコープ内） |
| ファイルサイズ | ✅ 68 行（500 行制限を大幅に下回る） |
| 信頼性レベル | 🔵 全箇所（推測なし） |

**判定: ✅ 高品質**
