# Red フェーズ記録: useJoinGroup

**機能名**: useJoinGroup  
**タスクID**: TASK-0011  
**要件名**: auth-onboarding  
**作成日**: 2026-06-01  
**フェーズ**: Red (失敗テスト作成完了)

---

## 作成したテストケース一覧

| TC | テスト名 | 信頼性 | 区分 |
|---|---|---|---|
| TC1 | join 成功時に RPC を正しい引数で呼び、所属状態を refresh し、notice を null に保ち group_id を返す | 🔵 | 正常系 |
| TC2 | DB が invitation_not_found を返したとき明示変換で INVITATION_NOT_FOUND_BY_LINK に詰め替え、notice が errors.invitation_not_found_by_link に解決され refresh を呼ばない | 🔵 | 異常系（核心） |
| TC3 | DB が already_in_group を返したとき詰め替え不要で notice が errors.already_in_group に解決され refresh を呼ばない | 🔵 | 異常系 |
| TC4 | DB が invitation_expired を返したとき詰め替え不要で notice が errors.invitation_expired に解決され refresh を呼ばない | 🔵 | 異常系 |

---

## テストファイルパス

`tests/unit/composables/useJoinGroup.test.ts`

---

## mock 依存チェーン解決方式 (方式 A)

| 対象 | 扱い |
|---|---|
| `useSupabaseClient().rpc` | `vi.hoisted` + `vi.mock('#imports')` + `vi.mock('#supabase-client')` でスパイ |
| `useCurrentGroup().refresh` | `vi.mock('#imports')` + `vi.mock('~/composables/useCurrentGroup')` でスパイ |
| `useNoticeErrors` / `useErrorMessage` | **実物** (#imports mock に含めない = 方式 A の肝) |
| `useI18n` の `t` / `te` | `vi.mock('vue-i18n')` 経由で mock (`t` はキー透過 / `te` は常に false) |
| `@sentry/nuxt` `captureException` | `vi.mock('@sentry/nuxt')` でスパイ |
| `ref` | `importOriginal<typeof import('vue')>()` で vue 実物を使用 |

---

## 期待される失敗内容

```
FAIL tests/unit/composables/useJoinGroup.test.ts
Error: Cannot find module '~/composables/useJoinGroup' imported from ...
```

`app/composables/useJoinGroup.ts` が未存在のため、モジュール解決エラーで失敗する。

---

## Green フェーズで実装すべき内容

### 実装ファイル
`app/composables/useJoinGroup.ts`

### 実装が必要な契約
- `useJoinGroup()` を export する composable
- 戻り値: `{ join, pending, notice }` (interfaces.ts §5 `UseJoinGroupReturn`)
  - `join(inviteCode: string): Promise<ActionResult<string>>`
  - `pending: Ref<boolean>` (EDGE-003: 二重送信防止)
  - `notice: Ref<string | null>` (招待リンク着地の永続通知)

### 最重要: EDGE-005 明示変換ロジック
DB メッセージ `'invitation_not_found'` → App 識別子 `'invitation_not_found_by_link'` への詰め替え:

```ts
const msg = (error as { message?: string }).message ?? ''
const mapped = msg.includes('invitation_not_found') && !msg.includes('invitation_not_found_by_link')
  ? { ...error, message: APP_ERROR_CODES.INVITATION_NOT_FOUND_BY_LINK }
  : error
setNotice(mapped)  // 詰め替え後のエラーを setNotice に渡す
```

### join の実装フロー
1. `clear()` で前回 notice をリセット
2. `pending.value = true`
3. `rpc('join_group_with_code', { invite_code: inviteCode })` を呼ぶ
4. エラー時: 明示変換後 `setNotice(mapped)` を呼ぶ、refresh は呼ばない
5. 成功時: `useCurrentGroup().refresh()` を呼ぶ
6. `pending.value = false` (finally で確実に)
7. `return { data, error }` (戻り値の error は元のエラーのまま、詰め替えは setNotice 用)
