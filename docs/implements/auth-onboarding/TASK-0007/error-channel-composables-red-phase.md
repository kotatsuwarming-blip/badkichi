# Red フェーズ記録: cross-cutting エラーチャネル composable 4本

- **機能名**: error-channel-composables（useErrorMessage / useFormErrors / useNoticeErrors / useToastErrors）
- **タスクID**: TASK-0007
- **要件名**: auth-onboarding
- **作成日**: 2026-06-01
- **フェーズ**: Red（失敗するテスト作成 完了）

---

## 1. 作成したテストケース一覧

| TC | ファイル | 観点 | 失敗理由 |
|-----|---------|------|---------|
| TC1 | `tests/unit/composables/useErrorMessage.test.ts` | App 識別子 INVALID_GROUP_NAME → flat i18n キー変換 | 実装ファイル未存在 |
| TC2 | `tests/unit/composables/useErrorMessage.test.ts` | 未マッピング fallthrough → errors.generic + Sentry 1回 | 実装ファイル未存在 |
| TC3 | `tests/unit/composables/useErrorMessage.test.ts` | PG SQLSTATE context 出し分け（te 真→ctx / 偽→.generic） | 実装ファイル未存在 |
| TC4-a | `tests/unit/composables/useFormErrors.test.ts` | setFieldError で fieldErrors に文言が載り clear で削除 | 実装ファイル未存在 |
| TC4-b | `tests/unit/composables/useNoticeErrors.test.ts` | setNotice で notice に文言が載り clear で null | 実装ファイル未存在 |
| TC4-c | `tests/unit/composables/useToastErrors.test.ts` | showError で toast.add({ title, color: 'red' }) 1回 | 実装ファイル未存在 |

---

## 2. テスト実行結果（pnpm vitest run）

```
 FAIL  tests/unit/composables/useErrorMessage.test.ts
Error: Cannot find module '~/composables/useErrorMessage'

 FAIL  tests/unit/composables/useFormErrors.test.ts
Error: Cannot find module '~/composables/useFormErrors'

 FAIL  tests/unit/composables/useNoticeErrors.test.ts
Error: Cannot find module '~/composables/useNoticeErrors'

 FAIL  tests/unit/composables/useToastErrors.test.ts
Error: Cannot find module '~/composables/useToastErrors'

 Test Files  4 failed (4)
      Tests  no tests
```

**失敗理由確認**: 全テスト「実装ファイル未存在（Cannot find module）」であり、Red フェーズとして期待する失敗。

---

## 3. #imports auto-import mock の解決方式

### 採用方式: `vi.mock('#imports')` ファクトリ直書き

```typescript
vi.mock('#imports', () => ({
  useI18n: () => ({ t: tMock, te: teMock }),
  useErrorMessage: vi.fn(),
  useToast: vi.fn(),
  ref: (v: unknown) => ({ value: v }),
}))
```

**選定理由**:
- Nuxt auto-import は `#imports` 仮想モジュールを通じて composable を提供する
- `vi.mock('#imports', factory)` で factory を直接指定することで、auto-import 経由の依存を完全にコントロールできる
- `ref` も `#imports` から取得されるため、簡易実装（`(v) => ({ value: v })`）を差し替え
- 既存テスト (`group-name.test.ts`) は `~/schemas` 直接インポートのため `#imports` mock 不要だったが、composable は auto-import が入るため今回の方式が必要

**注意**: Green フェーズで実装後、この `ref` 簡易実装がリアクティビティを持たないため、`fieldErrors.value['name']` の参照が正しく追跡されるかを確認すること。必要なら `vue` から直接 `ref` を import する形に調整する。

---

## 4. テストコード全文

### 4.1 useErrorMessage.test.ts

```
tests/unit/composables/useErrorMessage.test.ts
```

TC1 / TC2 / TC3 を 1 ファイルに集約。`vi.mock('#imports')` で `useI18n`（t: キー透過, te: vi.fn()）を差し替え、`vi.mock('@sentry/nuxt')` で captureException をスパイ。

### 4.2 useFormErrors.test.ts

```
tests/unit/composables/useFormErrors.test.ts
```

TC4-a。`vi.mock('#imports')` で `useErrorMessage` を差し替え（`errorToMessage` → `'mocked_message'` 固定）。state の set / clear（単一フィールド）のみ検証。

### 4.3 useNoticeErrors.test.ts

```
tests/unit/composables/useNoticeErrors.test.ts
```

TC4-b。useFormErrors と同様に `useErrorMessage` を mock。初期値 null・set 後文言・clear 後 null の 3 アサート。

### 4.4 useToastErrors.test.ts

```
tests/unit/composables/useToastErrors.test.ts
```

TC4-c。`useErrorMessage` と `useToast`（`{ add: vi.fn() }`）を両方 mock。`add` の呼び出し引数 `{ title: 'mocked_message', color: 'red' }` と回数（1 回）を検証。

---

## 5. Green フェーズで実装すべき内容

### 5.1 実装ファイル 4 本（`app/composables/` に作成）

1. **`app/composables/useErrorMessage.ts`**
   - `import * as Sentry from '@sentry/nuxt'`（auto-import 外）
   - `useI18n()` の `t` / `te` を取得（auto-import）
   - `tWithContext(base, ctx)`: `te(ctxKey)` 真→ctx キー / 偽→`.generic`
   - `errorToMessage(error, pgContext = 'generic')`: App 識別子 7種 + PG SQLSTATE 4種 + fallthrough（Sentry + errors.generic）
   - 戻り値: `{ errorToMessage }`

2. **`app/composables/useFormErrors.ts`**
   - `useErrorMessage()` を呼び `errorToMessage` を取得
   - `fieldErrors = ref<Record<string, string>>({})` で state 初期化
   - `setFieldError(field, error, pgContext?)`: `fieldErrors.value[field] = errorToMessage(error, pgContext)`
   - `clear(field?)`: フィールド指定→`delete`、未指定→`{}`
   - 戻り値: `{ fieldErrors, setFieldError, clear }`

3. **`app/composables/useNoticeErrors.ts`**
   - `notice = ref<string | null>(null)` で state 初期化
   - `setNotice(error, pgContext?)`: `notice.value = errorToMessage(error, pgContext)`
   - `clear()`: `notice.value = null`
   - 戻り値: `{ notice, setNotice, clear }`

4. **`app/composables/useToastErrors.ts`**
   - `useToast()` と `useErrorMessage()` を呼ぶ
   - `showError(error, pgContext?)`: `toast.add({ title: errorToMessage(error, pgContext), color: 'red' })`
   - 戻り値: `{ showError }`

### 5.2 Green フェーズの注意点

- **`ref` の reactivity**: テスト内 `#imports` mock の `ref` は簡易実装（非リアクティブ）。Green 実装後にテストが通るか確認し、もし `fieldErrors.value['name']` の参照がずれる場合は `vi.mock('#imports')` の `ref` を `vue` の本物 `ref` に差し替える
- **`ALREADY_IN_GROUP` の分岐追加**: `error-handling.md §5.1` のコードには記載なし（設計書が旧版）。`app/types/error-codes.ts` には実装済のため `useErrorMessage` に `if (isAppError(error, APP_ERROR_CODES.ALREADY_IN_GROUP))` 分岐を追加すること
- **ESLint**: 1tbs brace style / no comma dangle の規約に従う
- **TypeScript strict**: `unknown` 型をそのまま渡す（`as any` 禁止）
