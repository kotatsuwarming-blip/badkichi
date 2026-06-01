# Green フェーズ記録: useGenerateInvitation + useListInvitations

**機能名**: 招待リンク 一覧表示 (Read) + 発行 (Write RPC) composable
**タスクID**: TASK-0012
**要件名**: auth-onboarding
**フェーズ**: Green（最小実装）
**作成日**: 2026-06-01

---

## 1. 実装した内容

### app/composables/useListInvitations.ts（新規作成）

- `useAsyncData('invitations-list:' + groupId, handler)` でラップ
- SELECT: `id, code, created_at, expires_at` (status 列なし、UI 派生)
- フィルタ: `.eq('group_id', groupId).is('deleted_at', null)`
- エラー: `throw error` → error.vue グローバルフォールバック
- 戻り値: `AsyncState<Invitation[]>` (Nuxt useAsyncData の戻り)

### app/composables/useGenerateInvitation.ts（新規作成）

- `pending` / `supabase` / `useI18n().t` / `useToastErrors().showError` / `useToast().add` を **setup レベル**で取得
  - ※ `useI18n` は `generate` 関数内（setup 外）では呼べないため setup レベルで取得する設計に変更
- `generate(targetGroupId)`:
  1. `pending.value = true`
  2. `supabase.rpc('generate_invitation_code', { target_group_id: targetGroupId })`
  3. error あれば `showError(error)` → `return { data: null, error }`
  4. 成功: `await useListInvitations(targetGroupId).refresh()` (D5-4)
  5. 成功: `toast.add({ title: t('groups.settings.invitationGenerated') })` (NFR-204)
  6. `finally: pending.value = false` (EDGE-003)

### i18n/locales/ja.json

```diff
  "groups": {
    "settings": {
      "generateInvitation": "招待リンクを発行",
+     "invitationGenerated": "招待リンクを発行しました"
    }
  }
```

### i18n/locales/en.json

```diff
  "groups": {
    "settings": {
      "generateInvitation": "",
+     "invitationGenerated": ""
    }
  }
```

---

## 2. テストの修正内容

Red フェーズの `useGenerateInvitation.test.ts` で `vi.mock('#imports')` により差し替えていた `useI18n` / `useToastErrors` / `useToast` が実際には効かなかったため、Green フェーズで以下の修正を実施した。

### 修正の根拠

Nuxt Vite transform が各 composable/ライブラリを `#imports` バーチャルモジュール経由ではなく実パスに直接解決するため、`#imports` mock だけでは差し替えが効かない。これは既存テスト（`useErrorMessage.test.ts` / `useJoinGroup.test.ts` / `useToastErrors.test.ts`）で確立済みの知見に基づく。

### 追加した mock

| 追加 mock | 差し替え対象 |
|---|---|
| `vi.mock('vue-i18n')` | `useI18n: () => ({ t: (key) => key })` キー透過スタブ |
| `vi.mock('@nuxt/ui/composables/useToast')` | `useToast: () => ({ add: toastAddMock })` |
| `vi.mock('~/composables/useToastErrors')` | `useToastErrors: () => ({ showError: showErrorMock })` |

### 削除した #imports mock 内エントリ

`useToastErrors`, `useToast`, `useI18n`, `useListInvitations` を `#imports` から削除（代わりに個別直接 mock で対処）。`useSupabaseClient` と `ref` のみ `#imports` に残した。

---

## 3. テスト実行結果

```
Test Files  17 passed (17)
     Tests  54 passed (54)
```

**全テスト通過確認済み**

---

## 4. typecheck / i18n:check 結果

```
pnpm typecheck: 正常終了（エラーなし）
pnpm i18n:check: OK: ja/en のキー構造一致 + メッセージ書式 (8 top-level keys)
```

---

## 5. 品質判定

```
✅ 高品質:
- テスト結果: 全 54 件成功 (17 ファイル)
- 実装品質: シンプルかつ動作する
- リファクタ箇所: 明確に特定可能（ActionResult 型重複 / Invitation 型集約候補）
- 機能的問題: なし
- コンパイルエラー: なし
- ファイルサイズ: useListInvitations.ts 約 50 行 / useGenerateInvitation.ts 約 80 行（800 行制限内）
- モック使用: 実装コードにモック・スタブ含まず
```

---

## 6. Refactor フェーズへの注意点

1. **`ActionResult<T>` 型の重複**: `useCreateGroup.ts` / `useJoinGroup.ts` / `useGenerateInvitation.ts` に同名インターフェースが分散。将来 `app/types/interfaces.ts` への集約を検討（既存テストを壊さない慎重な作業が必要）
2. **`UseGenerateInvitationReturn` 型**: composable ファイル内ローカル定義。`interfaces.ts` 設計文書との統一候補
3. **`Invitation` 型**: `useListInvitations.ts` ローカル定義と `interfaces.ts` 設計文書の重複。集約候補
4. **`useToast` 取得タイミング**: setup レベル取得に変更した（🟡 推測あり）。`useToastErrors` の遅延取得パターンと異なるが、機能的には同等。Refactor フェーズで統一ポリシーの検討が望ましい
