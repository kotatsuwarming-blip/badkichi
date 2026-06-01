# TASK-0019 コンテキストノート: `/groups/[id]/settings` 画面実装

**作成日**: 2026-06-01  
**対象タスク**: TASK-0019 (Phase 3 - UI層, 8時間, 🔵 6/🟡 2)  
**関連ファイル**: docs/tasks/auth-onboarding/TASK-0019.md

---

## 1. 技術スタック

### フレームワーク・UI ライブラリ
- **Nuxt 4.4** (Vue 3 + TypeScript strict mode, SSR デフォルト)
- **Nuxt UI v4.5** — `<UButton>`, `<UForm>`, `<UFormField>`, `<UAlert>`, `<USkeleton>`, `useToast()` など
- **Tailwind CSS** — スタイリング
- **@nuxtjs/i18n v10.4** — 多言語対応 (ja のみ本実装, en はハコ)
- **@nuxtjs/supabase v2.0.8** — Supabase BaaS クライアント
- **Zod v4.4** — フォーム入力検証 (auth-onboarding で初登場)
- **@sentry/nuxt v10.55** — エラー監視 (error-handling.md §8)

### 参照元
- docs/design/auth-onboarding/architecture.md §フロントエンド
- docs/design/auth-onboarding/architecture.md §アーキテクチャパターン
- package.json (実測: Nuxt 4.4 / Nuxt UI v4.5)

---

## 2. 開発ルール

### アーキテクチャ原則
1. **page からの Supabase 直接呼び禁止** — 必ず composable 経由 (REQ-406, ADR-005 D1)
2. **「1 ユースケース = 1 composable」パターン** (ADR-007 D2)
   - useListInvitations: 招待リンク一覧取得 (Read)
   - useGenerateInvitation: 招待リンク生成 (Write)
3. **state 管理**: useAsyncData / useState のみ (Pinia 不採用, ADR-010 D7)
4. **レイアウト**: 無指定で `default.vue` を自動継承 (ADR-011 D1, page 側で definePageMeta 不要)

### エラーハンドリング
- **NOT_A_MEMBER**: `useToastErrors.showError()` で一過性 toast チャネル (error-handling.md §6.3 #5)
- **INVITATION_CODE_COLLISION_AFTER_RETRY**: toast + 再試行ボタン (EDGE-008)
- 識別子は `app/types/error-codes.ts` の `APP_ERROR_CODES` 定数で集約 (ADR-005 D2)
- i18n キーは `i18n/locales/ja.json` の `errors.*` セクションで管理

### 文言管理
- 全ての UI 文言は `i18n/locales/ja.json` 経由 (NFR-204)
- コード内に文字列リテラル禁止: `const { t } = useI18n()` + `t('groups.settings.invitationGenerated')` パターン
- 既存キー: `groups.settings.title`, `groups.settings.invitationsTitle`, `groups.settings.generateInvitation`, `groups.settings.invitationGenerated` など (ja.json 実測)

### UI/UX 規約
1. **ローディング状態** (NFR-202, interfaces.ts AsyncState.pending): `pending=true` 時は `<USkeleton>` / ボタン disabled
2. **エラー表示**: `useToast()` は一過性通知 (2秒), `<UAlert>` は永続表示
3. **コピー完了**: `useToast().add({ ... })` で「コピーしました」を 2 秒表示 (NFR-203)
4. **モバイル対応**: Nuxt UI v4 コンポーネント + Tailwind でレスポンシブ設計

### 参照元
- docs/design/auth-onboarding/architecture.md §アーキテクチャパターン
- docs/design/cross-cutting/error-handling.md §設計原則 (9 項目)
- docs/design/cross-cutting/error-handling.md §識別子の集約
- CLAUDE.md §Coding Conventions

---

## 3. 関連実装パターン

### 類似 page の実装例
**`app/pages/groups/new.vue`** (TASK-0010 実装済):
- Zod スキーマで送信前同期検証 (NFR-201): `<UForm :schema="formSchema" @submit="onSubmit">`
- composable 経由の RPC 呼び出し: `useCreateGroup().create(name)`
- pending ガード: `pending=true` 中はボタン disabled (EDGE-003 二重送信防止)
- RPC エラーは fieldErrors → `<UFormField :error>` で inline 表示
- 成功時遷移: `error === null` のとき `navigateTo('/')`
- レイアウト無指定: layout 自動継承 (ADR-011 D1)
- i18n キー透過: `const { t } = useI18n()`

### 関連 composable パターン

**`app/composables/useListInvitations.ts`** (TASK-0012 実装済):
```ts
export function useListInvitations(groupId: string) {
  const supabase = useSupabaseClient<Database>()
  return useAsyncData<Invitation[]>('invitations-list:' + groupId, async () => {
    const { data, error } = await supabase
      .from('group_invitations')
      .select('id, code, created_at, expires_at')
      .eq('group_id', groupId)
      .is('deleted_at', null)
    if (error) throw error
    return data ?? []
  })
}

// 型定義 (ローカル定義、将来 interfaces.ts に集約予定):
type Invitation = Pick<
  Database['public']['Tables']['group_invitations']['Row'],
  'id' | 'code' | 'created_at' | 'expires_at'
>
```
- **特記**: status 列は DB に存在しない。有効/期限切れは `expires_at < now()` で UI が派生算出

**`app/composables/useGenerateInvitation.ts`** (TASK-0012 実装済):
```ts
export function useGenerateInvitation(): UseGenerateInvitationReturn {
  const pending = ref(false)
  const supabase = useSupabaseClient<Database>()
  const { t } = useI18n()
  const { showError } = useToastErrors()
  const toast = useToast()

  async function generate(targetGroupId: string): Promise<ActionResult<string>> {
    pending.value = true
    try {
      const { data, error } = await supabase.rpc('generate_invitation_code', {
        target_group_id: targetGroupId
      })
      if (error) {
        showError(error)
        return { data: null, error }
      }
      // D5-4: 成功時は同一キー refresh で一覧自動更新
      await useListInvitations(targetGroupId).refresh()
      toast.add({ title: t('groups.settings.invitationGenerated') })
      return { data, error: null }
    } finally {
      pending.value = false
    }
  }
  return { generate, pending }
}

interface ActionResult<T> { data: T | null; error: unknown }
interface UseGenerateInvitationReturn { generate: (id: string) => Promise<ActionResult<string>>; pending: Ref<boolean> }
```
- **特記**: 成功時に `useListInvitations(targetGroupId).refresh()` を呼ぶ (dataflow.md §5 D5-4)
- URL 組立は **page 責務** (RPC は code の 8 hex のみ返す)

**`app/composables/useToastErrors.ts`** (既存):
- `showError(error)` で error オブジェクトを受け取り, `useErrorMessage` 経由で文言変換
- 自動的に `useToast().add({ ... })` で一過性 toast 表示 (error-handling.md §6.3)

**`app/layouts/default.vue`** (TASK-0014 実装済):
```ts
// ユーザアバター: Google identity の display_name + avatar_url (REQ-006 read only)
const user = useSupabaseUser()
const userDisplayName = computed(() => {
  return user.value?.user_metadata?.full_name
    ?? user.value?.user_metadata?.name
    ?? user.value?.email
    ?? ''
})
const userAvatarUrl = computed<string | undefined>(() => {
  return user.value?.user_metadata?.avatar_url ?? undefined
})
```
- layout は `<UApp>` / `<UHeader>` / `<UMain>` + `<slot />` で構成
- ログアウトボタンは layout 1 箇所で集約 (REQ-008, ADR-011 D2)

### 参照元
- app/pages/groups/new.vue (実装例)
- app/composables/useListInvitations.ts (実装済)
- app/composables/useGenerateInvitation.ts (実装済)
- app/composables/useToastErrors.ts (既存)
- app/layouts/default.vue (実装済)

---

## 4. 設計文書

### 招待リンク一覧表示
- **データソース**: `useListInvitations(groupId)` の AsyncData<Invitation[]>
- **列**: id / code / created_at / expires_at
- **状態派生**: `expires_at < now()` で UI が「有効」「期限切れ」を算出 (DB に status 列なし, interfaces.ts 注, EDGE-107)
- **参照**: docs/design/auth-onboarding/dataflow.md §5

### 招待リンク発行
1. ボタン押下 → `useGenerateInvitation().generate(groupId)`
2. RPC `generate_invitation_code` 実行 (TASK-0012 実装済)
3. 戻値: 8 hex code (例: `"a1b2c3d4"`)
4. **URL 組立** (page 責務): `${useRequestURL().origin}/join/${code}`
   - SSR 環境での host 取得に `useRequestURL()` を使う (REQ-408, architecture.md §既存 API マッピング)
5. 成功 toast: `t('groups.settings.invitationGenerated')` で「招待リンクを発行しました」(NFR-204)
6. 一覧自動更新: composable 内で `useListInvitations(groupId).refresh()` が呼ばれる (dataflow.md §5 D5-4)
7. エラー (`not_a_member`): `useToastErrors.showError()` で一過性 toast (REQ-110, error-handling.md §6.3 #5)
8. エラー (`invitation_code_collision_after_retry`): toast + 再試行ボタン (EDGE-008)

**参照**: 
- docs/design/auth-onboarding/dataflow.md §5 招待リンク発行
- docs/tasks/auth-onboarding/TASK-0019.md §実装詳細 §1 groups/[id]/settings.vue

### メンバー一覧表示 (🟡 実装時クエリ確定)
- **表示内容**: Google アカウントの表示名 + avatar (REQ-006 read only)
- **表示名取得元**: `user_metadata.full_name` / `user_metadata.name` / `email` フォールバック (default.vue 参照)
- **avatar_url取得元**: `user_metadata.avatar_url` (default.vue 参照)
- **取得方法**: 🟡 **実装時クエリ確定**
  - `group_members` テーブルから他メンバーの user_id を取得
  - Supabase RLS で他メンバーの identity・metadata を取得可能か確認 (RLS と Supabase identity 公開範囲に依存)
  - 必ず domain composable 経由 (REQ-406, page から直接 `supabase.from(...)` 禁止)
- **参照**: docs/tasks/auth-onboarding/TASK-0019.md §2 メンバー一覧取得 🟡

### エラーチャネル集約
| エラー | チャネル | composable |
|--------|---------|-----------|
| NOT_A_MEMBER | useToast() 一過性 | useToastErrors |
| INVITATION_CODE_COLLISION_AFTER_RETRY | useToast() + 再試行 | useToastErrors |

**参照**:
- docs/design/cross-cutting/error-handling.md §6 エラーチャネルの集約ビュー

---

## 5. テスト関連情報

### テストフレームワーク
- **Unit**: Vitest 4.1 + @nuxt/test-utils 4.0 (mock unit, `tests/unit/**/*.test.ts`)
- **Integration**: Vitest + vitest.integration.config.ts (CI 専用, `**/*.integration.test.ts`)
- **設定ファイル**: `vitest.config.ts`, `vitest.integration.config.ts`

### 既存テストディレクトリ構成
```
tests/
  ├── unit/
  │   ├── composables/
  │   │   ├── useGenerateInvitation.test.ts
  │   │   ├── useListInvitations.test.ts  (TASK-0012 実装)
  │   │   ├── useCreateGroup.test.ts
  │   │   ├── useErrorMessage.test.ts
  │   │   ├── useFormErrors.test.ts
  │   │   ├── useNoticeErrors.test.ts
  │   │   └── useToastErrors.test.ts
  │   └── middleware/
  │       └── auth.test.ts
  └── integration/
      ├── rpc.integration.test.ts
      └── rls.integration.test.ts
```

### テスト命名規則
- Unit テスト: `**/*.test.ts` (Vitest 自動検出, vitest.config.ts include フィルタ)
- Integration テスト: `**/*.integration.test.ts` (exclude フィルタで unit から分離)
- 実行: `pnpm test` (unit のみ, CI 自動実行), `pnpm test:integration` (integration, CI 専用)

### Mock 戦略 (ADR-012 D4, useGenerateInvitation.test.ts 参照)
**vi.hoisted() パターン**:
```ts
const { rpcMock, refreshMock, showErrorMock, toastAddMock } = vi.hoisted(() => ({
  rpcMock: vi.fn(),
  refreshMock: vi.fn().mockResolvedValue(undefined),
  showErrorMock: vi.fn(),
  toastAddMock: vi.fn()
}))

// 【#imports mock】: Nuxt auto-import 差し替え (ref / useSupabaseClient)
vi.mock('#imports', () => ({
  ref: (await import('vue')).ref,
  useSupabaseClient: () => ({ rpc: rpcMock })
}))

// 【vue-i18n mock】: useI18n キー透過スタブ
vi.mock('vue-i18n', () => ({
  useI18n: () => ({ t: (key: string) => key })
}))

// 【@nuxt/ui mock】: useToast 差し替え
vi.mock('@nuxt/ui/composables/useToast', () => ({
  useToast: () => ({ add: toastAddMock })
}))

// 【composable 直接 mock】: useListInvitations / useToastErrors
vi.mock('~/composables/useListInvitations')
vi.mock('~/composables/useToastErrors')
```

### テストユーティリティ
- **alias 安定化**: vitest.config.ts の `resolve.alias` (シンボリックリンク + バージョン番号隠蔽, ADR-012 D4)
  - `'#nuxt-router'`, `'#supabase-client'`, `'#supabase-user'`, `'#async-data'`
- **global setup**: 未使用 (provide/inject は worker process 分離対策, feedback_vitest_provide_inject.md)
- **fileParallelism**: false (integration テスト用, shared DB の cross-file 干渉対策, feedback_vitest_file_parallelism.md)

### 関連テストファイル (参考実装)
- tests/unit/composables/useGenerateInvitation.test.ts (i18n キー透過, refresh スパイ, error 分岐)
- tests/unit/composables/useCreateGroup.test.ts (composable 直接 mock パターン)

### 参照元
- vitest.config.ts (フレームワーク・alias・include フィルタ)
- tests/unit/composables/useGenerateInvitation.test.ts (mock パターン解説)
- docs/feedback/feedback_test_coverage.md (最小テスト原則)

---

## 6. 注意事項

### データベース設計
- **group_invitations テーブル**: id / code / created_at / expires_at / group_id / deleted_at
  - **status 列なし**: 有効/期限切れは UI が `expires_at < now()` で派生算出 (interfaces.ts 注, EDGE-107)
  - **削除**: 論理削除 (MVP では削除機能なし, future ready で `deleted_at is null` フィルタ)
- **group_members テーブル**: user_id / group_id / created_at (メンバー一覧の結合元)

### 実装時の確認事項

1. **メンバー一覧取得クエリ** (🟡): 実装時に以下を確定する
   - group_members との結合方法
   - auth.users の identity (email / name / avatar) の公開範囲を RLS で確認
   - composable 経由の必須性 (REQ-406)

2. **URL 組立**: `${useRequestURL().origin}/join/${code}` の形式 (SSR 環境対応, REQ-408)

3. **状態派生**: `expires_at < now()` の境界値 (EDGE-107):
   - テストケース: 有効 / 期限切れ / 境界 `expires_at == now()`

4. **i18n キーの完全性**: ja.json に以下が存在するか確認
   - `groups.settings.title`
   - `groups.settings.invitationsTitle`
   - `groups.settings.membersTitle`
   - `groups.settings.generateInvitation`
   - `groups.settings.invitationGenerated`
   - `errors.not_a_member`
   - `errors.invitation_code_collision_after_retry`

5. **RLS ガード**: middleware の `not_a_member` / RLS 拒否が正しく 403 → toast で流れるか (error-handling.md §6.3 #5)

### セキュリティ・パフォーマンス

1. **認可**: 該当 Group のメンバーのみアクセス可 (middleware + RLS)
   - middleware が未認証 → `/login` / 未所属 → `/onboarding` にリダイレクト
   - RLS で他 Group の invitations を見えなくする (data-foundation 実装済)

2. **有効期限**: 固定 7 日 (REQ-405, RPC で自動設定)

3. **コード衝突**: RPC の retry loop + `invitation_code_collision_after_retry` エラー (EDGE-008, data-foundation 実装済)

4. **NFR-002 (1 ナビゲーション 1 クエリ)**: useAsyncData キーの共有で refresh 時のみ再フェッチ (ADR-008 D4)

### 参照元
- docs/tasks/auth-onboarding/TASK-0019.md §注意事項
- docs/design/auth-onboarding/architecture.md §既存 API の利用マッピング
- docs/design/cross-cutting/error-handling.md §エラーハンドリング戦略

---

## 7. 実装チェックリスト

### ファイル構成
- [ ] `app/pages/groups/[id]/settings.vue` を作成
- [ ] 必要に応じて メンバー一覧取得 composable (🟡) を作成
- [ ] i18n キー追加 (ja.json に `groups.settings.*` / `errors.*` キーが全て存在)

### 実装要件
- [ ] 招待リンク一覧表示 (created_at / expires_at / 状態)
- [ ] 発行ボタン → `useGenerateInvitation().generate(id)` → URL 組立 → 一覧自動更新
- [ ] URL コピーボタン → toast「コピーしました」2秒
- [ ] メンバー一覧表示 (表示名 + avatar, read only)
- [ ] `not_a_member` toast 表示 (REQ-110)
- [ ] pending 中のローディング状態 (NFR-202)
- [ ] layout 無指定で `default.vue` 自動継承 (ADR-011 D1)

### テスト
- [ ] 状態派生 (`expires_at < now()`) が純関数の場合のみ最小テスト (有効 / 期限切れ / 境界)
- [ ] composable のテストは TASK-0012 で検証済なため page 見た目テストは書かない (NFR-301)

### 品質確認
- [ ] `pnpm typecheck` 成功
- [ ] `pnpm lint` 成功
- [ ] `pnpm test` (unit) 全緑
- [ ] 依存テスト (TASK-0012 composable) 緑を確認
- [ ] layout (TASK-0014) 動作確認

---

**記作成者**: tsumiki:tdd-tasknote スキル (2026-06-01)
