# TDD開発メモ: useGenerateInvitation + useListInvitations

## 🎯 最終結果 (2026-06-01)

- **現在のフェーズ**: verify-complete 完了
- **実装率**: 100% (3/3 テストケース)
- **品質判定**: ✅ 合格（高品質）
- **TODO更新**: ✅ 完了マーク追加

## 概要

- 機能名: 招待リンク 一覧表示 (Read) + 発行 (Write RPC) composable
- 開発開始: 2026-06-01
- 現在のフェーズ: verify-complete 完了

## 関連ファイル

- 元タスクファイル: `docs/tasks/auth-onboarding/TASK-0012.md`
- 要件定義: `docs/implements/auth-onboarding/TASK-0012/auth-onboarding-requirements.md`
- テストケース定義: `docs/implements/auth-onboarding/TASK-0012/auth-onboarding-testcases.md`
- 実装ファイル(予定): `app/composables/useListInvitations.ts` / `app/composables/useGenerateInvitation.ts`
- テストファイル:
  - `tests/unit/composables/useListInvitations.test.ts` (TC1)
  - `tests/unit/composables/useGenerateInvitation.test.ts` (TC2/TC3)

---

## Redフェーズ（失敗するテスト作成）

### 作成日時

2026-06-01

### テストケース

| TC | 概要 | 信頼性 |
|---|---|---|
| TC1 | `useListInvitations('g1')` → `eq('group_id','g1')` + `is('deleted_at', null)` + `data.value` が `Invitation[]` | 🔵 |
| TC2 | `generate('g1')` 成功 → RPC 引数 `target_group_id` + `refresh` 1回 + 成功 toast `groups.settings.invitationGenerated` | 🔵 |
| TC3 | `generate('g1')` `not_a_member` → `showError(error)` のみ / `refresh` + 成功 toast は非呼出 | 🔵 |

### テスト実行結果

```
 FAIL  tests/unit/composables/useGenerateInvitation.test.ts
Error: Cannot find module '~/composables/useGenerateInvitation'

 FAIL  tests/unit/composables/useListInvitations.test.ts
Error: Cannot find module '~/composables/useListInvitations'

Test Files  2 failed / 既存テスト 4 passed（影響なし）
```

### mock 解決方式

**useListInvitations.test.ts**:
- `vi.hoisted()` + `vi.mock('#imports')` / `#supabase-client` / `#async-data` の 3 点セット
- `useAsyncData` スタブ: handler 即時実行（`data.value` null 回避のための必須対応）
- `isMock.mockResolvedValue` を `beforeEach` で毎回再設定（clearAllMocks 対策）

**useGenerateInvitation.test.ts**:
- `vi.hoisted()` + `vi.mock('#imports')` / `#supabase-client` の 2 点 + `vi.mock('~/composables/useListInvitations')` 直接 mock
- `useI18n: () => ({ t: (key) => key })` キー透過スタブ（ja.json 未追記でもアサート可能）
- `refreshMock.mockResolvedValue(undefined)` を `beforeEach` で毎回再設定

### 期待される失敗

`~/composables/useListInvitations` / `~/composables/useGenerateInvitation` が存在しないため `Cannot find module` エラーで失敗。Redフェーズとして正常な失敗状態。

### 次のフェーズへの要求事項（Green フェーズ）

1. **`app/composables/useListInvitations.ts` の実装**:
   - `useAsyncData('invitations-list:' + groupId, ...)` でキャッシュ
   - `select('id, code, created_at, expires_at').eq('group_id', groupId).is('deleted_at', null)`
   - SELECT エラーは `throw`（error.vue グローバルフォールバック）

2. **`app/composables/useGenerateInvitation.ts` の実装**:
   - `rpc('generate_invitation_code', { target_group_id })` で RPC 呼出
   - 成功: `useListInvitations(targetGroupId).refresh()` → `toast.add({ title: t('groups.settings.invitationGenerated') })`
   - エラー: `useToastErrors().showError(error)` → return
   - `pending` は try/finally で制御（EDGE-003）

3. **i18n キー追加**（必須）:
   - `i18n/locales/ja.json` に `groups.settings.invitationGenerated: "招待リンクを発行しました"` を追加
   - `i18n/locales/en.json` にも対応キーを追加
   - ⚠️ Red テストは `t` をキー透過スタブにしているため未追記でも通るが、実装では `t()` が呼ばれるため追記必須

---

## Greenフェーズ（最小実装）

### 実施日時

2026-06-01

### 実装方針

- `useListInvitations.ts`: `useAsyncData('invitations-list:' + groupId)` で PostgREST SELECT をラップ
- `useGenerateInvitation.ts`: setup レベルで `useI18n` / `useToastErrors` / `useToast` / `useSupabaseClient` を取得、`generate` 関数内で RPC 実行
- i18n: `groups.settings.invitationGenerated` を ja.json（値: 「招待リンクを発行しました」）と en.json（値: 空ハコ）に追加

### mock 戦略修正（Green フェーズで発見した問題）

Red フェーズの `useGenerateInvitation.test.ts` は `vi.mock('#imports')` で `useI18n` / `useToastErrors` / `useToast` を差し替える想定だったが、実際には以下の直接 mock が必要だった：

| composable/library | 正しい mock パス | 根拠 |
|---|---|---|
| `useI18n` | `vi.mock('vue-i18n')` | `useErrorMessage.test.ts` / `useJoinGroup.test.ts` で確立済み |
| `useToast` | `vi.mock('@nuxt/ui/composables/useToast')` | `useToastErrors.test.ts` で確立済み |
| `useToastErrors` | `vi.mock('~/composables/useToastErrors')` | composable ファイル直接 mock（`useCreateGroup.test.ts` 同型） |

これは Nuxt Vite transform が各 composable を `#imports` バーチャルモジュール経由ではなく各ライブラリ/ファイルの実パスに直接解決するためである。

### 実装ファイル

- `app/composables/useListInvitations.ts` — 新規作成
- `app/composables/useGenerateInvitation.ts` — 新規作成
- `i18n/locales/ja.json` — `groups.settings.invitationGenerated` 追記
- `i18n/locales/en.json` — `groups.settings.invitationGenerated` 追記（空ハコ）
- `tests/unit/composables/useGenerateInvitation.test.ts` — mock 戦略修正（Green フェーズで修正）

### テスト実行結果

```
Test Files  17 passed (17)
     Tests  54 passed (54)
```

### typecheck / i18n:check

```
pnpm typecheck: OK（エラーなし）
pnpm i18n:check: OK: ja/en のキー構造一致 + メッセージ書式 (8 top-level keys)
```

### 信頼性レベル分布

- useListInvitations.ts: 🔵 全体（元資料の仕様通り）
- useGenerateInvitation.ts: 🔵 RPC/refresh/toast ロジック / 🟡 `useToast` 取得タイミング（setup 内取得に変更）

### 課題・改善点（Refactor フェーズ候補）

1. **`ActionResult<T>` 型の重複**: `useCreateGroup.ts` / `useJoinGroup.ts` / `useGenerateInvitation.ts` に同名インターフェースが分散。将来 `app/types/interfaces.ts` への集約を検討
2. **`UseGenerateInvitationReturn` / `UseListInvitationsReturn` 型**: 現在 composable ファイル内のローカル型定義。`interfaces.ts` 設計文書と統一する場合は `app/types/interfaces.ts` への移動候補
3. **`Invitation` 型**: `useListInvitations.ts` ローカル定義と `interfaces.ts` 設計文書の重複。同様に集約候補

---

## Refactorフェーズ（品質改善）

### 実施日時

2026-06-01

### 実施内容

1. **brace-style 修正** 🔵
   - `tests/unit/composables/useListInvitations.test.ts` L43-46 の `try {} \n catch {}` → `try {} catch {}` に修正
   - ESLint `@stylistic/brace-style` (1tbs ルール) 準拠

2. **`useToast` 取得タイミング コメント補強** 🟡
   - `app/composables/useGenerateInvitation.ts` の `useToast` 取得コメントを強化
   - useToastErrors.ts 遅延取得パターンとの設計差異と理由を明記

3. **型集約 TODO コメント化** 🔴（実装はスコープ外）
   - `ActionResult<T>` / `UseGenerateInvitationReturn` / `Invitation` の将来集約先を TODO コメントで追跡可能にした
   - 既存テストを壊さないため Refactor スコープ内での実装は見送り

### 品質チェック結果

```
pnpm test:   Test Files  17 passed (17) / Tests  54 passed (54)
pnpm lint:   対象ファイルのエラーなし（video-playback 既存エラーは対象外）
pnpm typecheck: OK（エラーなし）
pnpm i18n:check: OK: ja/en のキー構造一致 (8 top-level keys)
```

### 残課題

1. `ActionResult<T>` / `UseGenerateInvitationReturn` / `Invitation` の `app/types/interfaces.ts` への集約（TODO コメントで追跡）
2. `useToast` 取得ポリシー（setup レベル vs 遅延取得）の ADR 等での統一

### 品質判定

✅ 高品質（全チェック通過 / 重大問題なし）
