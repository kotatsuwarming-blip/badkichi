# TASK-0009: useCurrentGroup（Read）— TDD 開発ノート

**作成日**: 2026-06-01  
**タスク ID**: TASK-0009  
**要件名**: auth-onboarding

---

## 1. 技術スタック

### フレームワーク・ライブラリ
- **Nuxt 4.4** / Vue 3 + TypeScript strict mode
- **@nuxtjs/supabase 2.x**: `useSupabaseClient<Database>()` / `useSupabaseUser()`
- **Vitest**: 単体テスト (ADR-012 D5)
- **Vue Test Utils**: コンポーネント単体テスト（本タスク外）

### 参照元
- docs/spec/auth-onboarding/note.md
- docs/design/auth-onboarding/architecture.md
- docs/design/auth-onboarding/interfaces.ts
- docs/design/cross-cutting/error-handling.md

---

## 2. 開発ルール

### composable 基本ルール（ADR-007）
- 実装ファイル: `app/composables/useCurrentGroup.ts`
- 戻り値型: `UseCurrentGroupReturn = AsyncState<CurrentGroup>` (interfaces.ts に定義)
- `useAsyncData('current-group', ...)` の固定キーで実装（ADR-008 D4、NFR-002）
- middleware と page で同一キーを共有し、1 ナビゲーション 1 クエリ保証
- 型ファイル: `app/types/supabase.ts`（自動生成）/ `app/types/error-codes.ts`

### データアクセスルール（architecture.md §既存 API マッピング）
- **クエリ**: `from('group_members').select('group_id, groups(id, name)').eq('user_id', uid).maybeSingle()`
- **uid 取得**: `useSupabaseUser().value?.sub` (memory `project_mvp_revised_scope`: uid は `user.sub`、`user.id` ではない)
- **未所属**: `.maybeSingle()` の 0 行 → `{ data: null, error: null }` を正常値として扱う
- **エラー**: クエリエラーは throw（error.vue フォールバックに委譲）

### 型チェック（ADR-006 + supabase.ts）
- **groups embed の null 許容**: supabase.ts の生成型を真とする
- **ADR-006 で 1 user = 1 group が保証**: 複数行は発生しない（`.maybeSingle()` 確定）
- CurrentGroup インターフェース: `{ group_id: string, groups: { id, name } | null }`
  - `groups` が null 許容かは supabase.ts の `group_members.Row` の relationships で確認必須

### テスト戦略（ADR-012 D5）
- テストファイル: `tests/unit/composables/useCurrentGroup.test.ts`
- mock 対象: `useSupabaseClient()` / `useSupabaseUser()` / `useAsyncData()`
- `:maybeSingle()` チェーンの mock: `{ data, error }` オブジェクト返却
- 最小カバレッジ: 所属あり / 未所属の 2 ケース（境界値）
- vi.mock('#imports') で import エイリアス経由の差し替え（vitest.config.ts 実測）
- vi.clearAllMocks() で テスト間の汚染防止

### i18n・Sentry（cross-cutting）
- 本タスク: エラーは throw → error.vue で処理（useErrorMessage など cross-cutting は別タスク）
- ユーザーメッセージ: 不要（composable の責務は data 取得のみ）

---

## 3. 関連実装

### 既存 composable パターン
- **useErrorMessage**: tests/unit/composables/useErrorMessage.test.ts
  - vi.hoisted / vi.mock 使用パターン確認可
  - error-handling.md §5.1 の `captureException` fallthrough パターン
- **useFormErrors / useNoticeErrors / useToastErrors**: error-handling.md §6.4
  - cross-cutting composable（参考のみ、本タスク外）

### 既存テストの mock 実装パターン
- **useErrorMessage.test.ts**: vue-i18n / @sentry/nuxt mock
- **vi.hoisted + vi.fn / vi.returnValue**: ファクトリ変数参照パターン
- **beforeEach + vi.clearAllMocks**: テスト間隔離

### Supabase client の composable 用法
- `useSupabaseClient<Database>()` で型付き client を取得
- `useSupabaseUser()` で認証 user Ref を取得
- RPC・PostgREST は同じ client API で統一

---

## 4. 設計文書

### 型定義（interfaces.ts）
```typescript
// CurrentGroup: useCurrentGroup の SELECT 結果
interface CurrentGroup {
  group_id: string
  groups: { id: string, name: string } | null
}

// UseCurrentGroupReturn: useAsyncData の AsyncState ラッパー
type UseCurrentGroupReturn = AsyncState<CurrentGroup>

// AsyncState: Nuxt useAsyncData の共通戻り値型
interface AsyncState<T> {
  data: Ref<T | null>
  pending: Ref<boolean>
  error: Ref<Error | null>
  refresh: () => Promise<void>
}
```

参照元: docs/design/auth-onboarding/interfaces.ts

### アーキテクチャ (architecture.md §既存 API マッピング)
- composable は RLS で保護された PostgREST SELECT をラップ
- `is_member_of(group_id)` RLS (data-foundation で実装済)
- uid は JWT token の `sub` claim から取得
- 未認証: uid が undefined → null を返す（middleware で catch）
- クエリエラー: throw（error.vue グローバルフォールバック）

### スキーマ（supabase.ts 実測）
- **group_members.Row**:
  - id: string
  - user_id: string (auth.users.id、実は user.sub)
  - group_id: string
  - created_at, joined_at, updated_at, deleted_at: timestamps
- **groups.Row**: id / name / timestamps
- **relationship**: group_members → groups は FK (必須、non-null)

参照元: app/types/supabase.ts

---

## 5. テスト関連情報

### テストフレームワーク設定
- **Vitest**: tests/unit/ に集約、integration は別ファイル名 (*.integration.test.ts)
- **vitest.config.ts**: alias 設定で #nuxt-router / #supabase-client の安定化実装
- **@nuxt/test-utils**: defineVitestConfig で auto-import / SSR 対応
- **Vi.mock 注意**: Nuxt auto-import 経由の場合、#imports ではなく元モジュール (vue-i18n など) を mock すること

### 既存テストディレクトリ構成
```
tests/
├── unit/
│   ├── composables/
│   │   ├── useErrorMessage.test.ts
│   │   ├── useFormErrors.test.ts
│   │   ├── useNoticeErrors.test.ts
│   │   └── useToastErrors.test.ts
│   ├── middleware/
│   │   └── (auth.global.ts テストなど)
│   └── schemas/
│       └── (Zod 検証テストなど)
└── integration/
    ├── rpc.integration.test.ts
    └── rls.integration.test.ts
```

### mock パターン（実装時参考）
1. **vi.hoisted**: ファクトリ関数で mock 用スパイ生成（ファイル先頭で hoisted）
2. **vi.mock**: 実モジュール指定（vue-i18n / @sentry/nuxt など）
3. **beforeEach**: vi.clearAllMocks() で テスト間隔離
4. **チェーン mock**: `.from()` `.select()` `.eq()` `.maybeSingle()` を `.mockReturnValue()` で返す

### supabase-js のクライアント mock パターン（参考）
```typescript
const mockSupabaseClient = {
  from: vi.fn(() => ({
    select: vi.fn(() => ({
      eq: vi.fn(() => ({
        maybeSingle: vi.fn().mockResolvedValue({ data: ..., error: null })
      }))
    }))
  }))
}
```

### テストユーティリティ
- **vi.fn()**: スパイ関数
- **vi.mock / mockImplementation / mockReturnValue**: 差し替え・仕様変更
- **vi.clearAllMocks()**: リセット
- **beforeEach / afterEach**: テスト前後の処理

参照元:
- vitest.config.ts
- tests/unit/composables/useErrorMessage.test.ts
- tests/integration/*.integration.test.ts

---

## 6. 注意事項

### 🔵 確定事項（実装時自信あり）
1. **uid**: `useSupabaseUser().value?.sub` で取得（memory `project_mvp_revised_scope` 確定）
2. **useAsyncData キー**: 必ず固定文字列 `'current-group'`（ADR-008 D4）
3. **.maybeSingle()**: 0 行で `null`（ADR-006 で 1 user = 1 group）
4. **クエリエラー**: throw（error.vue で処理）
5. **mock 対象**: useSupabaseClient / useSupabaseUser / useAsyncData

### 🟡 実装時に確認（確定待ち）
1. **groups embed の null 許容**:
   - supabase.ts の `group_members.Row` を見て `groups` 型が `| null` を含むか確認
   - FK 必須なら non-null になる可能性
   - interface CurrentGroup の groups 型を supabase.ts に合わせる

### ⚠️ よくある罠
- uid は `user.id` ではなく `user.sub`（混同リスク）
- `.maybeSingle()` は「複数行は例外」という意味なので、0 行は正常値
- `useAsyncData` キーを動的にすると、middleware と page で重複クエリ発生
- middleware は `/confirm` ページで未認証 user で走る可能性（uid undefined 時は null 返す）

---

## 7. 次フェーズへの注意点

### requirements フェーズ（tsumiki:tdd-requirements）
- **supabase.ts の groups embed null 許容を確認済**: interfaces.ts の CurrentGroup 型が確定する
- **ADR-006 migration 実装状況確認**: 1 user = 1 group が DB で保証されているか
- **RLS 検証**: `is_member_of(group_id)` が data-foundation で適用済か確認

### testcases フェーズ（tsumiki:tdd-testcases）
- **テストケース 2 つ（最小）**: 所属あり / 未所属 の境界値
- **mock 戦略**: useSupabaseClient / useSupabaseUser / useAsyncData の差し替え仕様書
- **uid undefined の扱い**: 未認証時は composable が null を返す（middleware で catch）

### green / refactor フェーズ
- **error-handling.md 不適用**: 本タスクのエラーは throw のみ（チャネル分岐なし）
- **cross-cutting composable 未使用**: useErrorMessage などは後続タスクで実装

---

## 参照ファイル一覧

| ファイル | 用途 |
|---------|------|
| docs/tasks/auth-onboarding/TASK-0009.md | タスク定義（完了条件・実装詳細） |
| docs/spec/auth-onboarding/note.md | 単位概要・スコープ・決定事項 |
| docs/design/auth-onboarding/architecture.md | アーキテクチャ・API マッピング・レイアウト |
| docs/design/auth-onboarding/interfaces.ts | 型定義（CurrentGroup / AsyncState） |
| docs/design/cross-cutting/error-handling.md | エラーハンドリング戦略（参考） |
| docs/decisions/006-single-group-per-user-mvp.md | ADR-006（1 user = 1 group） |
| docs/decisions/008-middleware-strategy.md | ADR-008（middleware + useAsyncData キー） |
| app/types/supabase.ts | 生成型（group_members / groups） |
| app/types/error-codes.ts | エラー識別子（本タスク不使用） |
| vitest.config.ts | Vitest 設定・alias 定義 |
| tests/unit/composables/useErrorMessage.test.ts | mock パターン参考 |

---

## 🎯 要点まとめ

**実装**: `useAsyncData('current-group', async () => { ... })` で group_members.select() をラップ

**uid**: `useSupabaseUser().value?.sub` （user.id ではない）

**戻り値**: `AsyncState<CurrentGroup>` （data / pending / error / refresh）

**テスト**: mock useSupabaseClient/useSupabaseUser/useAsyncData、2 ケース（所属あり・未所属）

**注意**: groups embed の null 許容を supabase.ts で確認、useAsyncData キーは固定『current-group』
