# Red フェーズ記録: useGenerateInvitation + useListInvitations

**機能名**: 招待リンク 一覧表示 (Read) + 発行 (Write RPC) composable
**タスクID**: TASK-0012
**要件名**: auth-onboarding
**フェーズ**: Red（失敗するテスト作成）
**作成日**: 2026-06-01

---

## 1. 作成したテストケース一覧

| TC | テスト名 | ファイル | 信頼性 |
|---|---|---|---|
| TC1 | useListInvitations が group_id + deleted_at is null で絞り込み、Invitation[] を data.value に返す | `tests/unit/composables/useListInvitations.test.ts` | 🔵 |
| TC2 | generate 成功時に RPC を正しい引数で呼び、refresh を呼び、成功 toast を出す | `tests/unit/composables/useGenerateInvitation.test.ts` | 🔵 |
| TC3 | not_a_member エラー時に showError(error) を呼び、refresh と成功 toast を呼ばない | `tests/unit/composables/useGenerateInvitation.test.ts` | 🔵 |

**信頼性レベル分布**: 🔵 3 / 🟡 0 / 🔴 0

---

## 2. テストファイル

### tests/unit/composables/useListInvitations.test.ts

```typescript
// TC1: useListInvitations が group_id + deleted_at is null で絞り込み、Invitation[] を data.value に返す
// mock: selectMock / eqMock / isMock チェーン + useAsyncData 即時実行スタブ
// 失敗理由: ~/composables/useListInvitations が存在しない
```

### tests/unit/composables/useGenerateInvitation.test.ts

```typescript
// TC2: generate 成功 → RPC 引数検証 + refresh 呼出 + 成功 toast
// TC3: not_a_member → showError(error) / refresh と成功 toast は呼ばれない
// mock: rpcMock / refreshMock / showErrorMock / toastAddMock + useListInvitations 直接 mock
// 失敗理由: ~/composables/useGenerateInvitation が存在しない
```

---

## 3. テスト実行結果（失敗確認）

```
 FAIL  |node| tests/unit/composables/useGenerateInvitation.test.ts
Error: Cannot find module '~/composables/useGenerateInvitation'

 FAIL  |node| tests/unit/composables/useListInvitations.test.ts
Error: Cannot find module '~/composables/useListInvitations'

 Test Files  2 failed (2)
      Tests  no tests
```

**失敗理由**: 実装ファイル `app/composables/useListInvitations.ts` / `app/composables/useGenerateInvitation.ts` が未存在のため。既存テスト（useCreateGroup / useCurrentGroup）は全て通過済み。

---

## 4. mock 解決方式

### useListInvitations.test.ts (TC1)
- `vi.hoisted()` で `selectMock` / `eqMock` / `isMock` / `useAsyncDataMock` を先に定義
- チェーン構造: `selectMock → { eq: eqMock }` → `eqMock → { is: isMock }` → `isMock → { data, error }`
- `useAsyncData` スタブ: handler を即時 await 実行し `{ data: ref(result), ... }` を返す（`data.value` が null にならないための必須対応）
- `vi.mock('#imports')` / `vi.mock('#supabase-client')` / `vi.mock('#async-data')` の 3 点セット

### useGenerateInvitation.test.ts (TC2/TC3)
- `vi.hoisted()` で `rpcMock` / `refreshMock` / `showErrorMock` / `toastAddMock` を先に定義
- `vi.mock('#imports')` で `useI18n: () => ({ t: (key) => key })` キー透過スタブを設定
- `vi.mock('~/composables/useListInvitations')` で composable ファイルを直接 mock（useCreateGroup.test.ts の useCurrentGroup mock と同型）
- `beforeEach` で `vi.clearAllMocks()` + `refreshMock.mockResolvedValue(undefined)` 再設定

---

## 5. Green フェーズで実装すべき内容

### app/composables/useListInvitations.ts

```typescript
// useAsyncData('invitations-list:{groupId}', async () => {
//   const supabase = useSupabaseClient<Database>()
//   const { data, error } = await supabase
//     .from('group_invitations')
//     .select('id, code, created_at, expires_at')
//     .eq('group_id', groupId)
//     .is('deleted_at', null)
//   if (error) throw error
//   return data ?? []
// })
```

- 型: `AsyncState<Invitation[]>` を返す
- キー: `'invitations-list:' + groupId`（D5-4 同一キー refresh のため文字列連結明示）
- SELECT 列: `id, code, created_at, expires_at` のみ（status 列なし）
- フィルタ: `deleted_at is null` 明示（ソフトデリート前提）

### app/composables/useGenerateInvitation.ts

```typescript
// const generate = async (targetGroupId: string): Promise<ActionResult<string>> => {
//   pending.value = true
//   try {
//     const supabase = useSupabaseClient<Database>()
//     const { data, error } = await supabase.rpc('generate_invitation_code', {
//       target_group_id: targetGroupId
//     })
//     if (error) {
//       useToastErrors().showError(error)
//       return { data: null, error }
//     }
//     await useListInvitations(targetGroupId).refresh()
//     const { t } = useI18n()
//     useToast().add({ title: t('groups.settings.invitationGenerated') })
//     return { data, error: null }
//   } finally {
//     pending.value = false
//   }
// }
```

- 型: `UseGenerateInvitationReturn = { generate, pending: Ref<boolean> }`
- RPC 引数名: `target_group_id`（snake_case、`p_*` prefix 不要）
- エラー: `showError(error)` → toast 一過性表示（error をそのまま渡す、文言変換は useToastErrors 責務）
- 成功: `useListInvitations(targetGroupId).refresh()` → `toast.add({ title: t('groups.settings.invitationGenerated') })`
- pending: try/finally で制御（EDGE-003 二重送信防止）

### i18n キー追加（Green フェーズで必須）

- `i18n/locales/ja.json` に `groups.settings.invitationGenerated` を追加
  - 値: 「招待リンクを発行しました」（NFR-203/204）
- `i18n/locales/en.json` にも対応キーを追加（i18n 構造の整合性）
- **注意**: Red テストは `t` をキー透過スタブにしているため ja.json 未追記でも通るが、Green 実装時には実際の composable が `t()` を呼ぶため追記が必須

---

## 6. 品質判定

```
✅ 高品質:
- テスト実行: 「実装未存在による失敗」を確認済み（Module Not Found エラー）
- 期待値: 全 TC で具体的な値・引数・スパイ検証を定義
- アサーション: 正引数検証（toHaveBeenCalledWith）+ 否定アサーション（not.toHaveBeenCalled）を適切に配置
- 実装方針: Green フェーズで実装すべき内容を具体的に記載
- 信頼性レベル: 🔵 3 / 🟡 0 / 🔴 0（全 TC が元資料に直接対応）
- 既存テスト影響: なし（useCreateGroup / useCurrentGroup 全 4 件 pass 確認済）
```
