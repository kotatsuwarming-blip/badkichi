# Green フェーズ記録: cross-cutting エラーチャネル composable 4本

- **機能名**: error-channel-composables（useErrorMessage / useFormErrors / useNoticeErrors / useToastErrors）
- **タスクID**: TASK-0007
- **要件名**: auth-onboarding
- **作成日**: 2026-06-01
- **フェーズ**: Green（最小実装完了 + テスト全件成功）

---

## 1. 実装ファイル

| ファイル | 行数 | 状態 |
|---|---|---|
| `app/composables/useErrorMessage.ts` | 77行 | ✅ 作成済 |
| `app/composables/useFormErrors.ts` | 53行 | ✅ 作成済 |
| `app/composables/useNoticeErrors.ts` | 46行 | ✅ 作成済 |
| `app/composables/useToastErrors.ts` | 48行 | ✅ 作成済 |

---

## 2. テスト実行結果

```
Test Files  11 passed (11)
     Tests  40 passed (40)
  Start at  16:53:22
  Duration  400ms
```

**composable 4ファイルのテスト (TC1〜TC4)**:
- TC1: App 識別子 INVALID_GROUP_NAME → flat i18n キー変換 ✅
- TC2: 未マッピング fallthrough → errors.generic + Sentry 1回 ✅
- TC3: UNIQUE_VIOLATION te 真→ctx / 偽→.generic ✅
- TC4-a: setFieldError → fieldErrors state / clear(field) で削除 ✅
- TC4-b: setNotice → notice state / clear で null ✅
- TC4-c: showError → toast.add({ title, color: 'red' }) 1回 ✅

---

## 3. 実装方針と判断理由

### 3.1 useErrorMessage.ts (中核)

- 設計書 `error-handling.md §5.1` の実装コードをそのまま採用 (🔵)
- `ALREADY_IN_GROUP` 分岐を追加 (設計書は旧版で未記載、TASK-0003 で error-codes.ts に追加済のため対応)
- `tWithContext` で PG SQLSTATE の context 出し分け: `te()` で存在確認後 ctx キー or `.generic` を選択

### 3.2 3チャネルラッパ (useFormErrors / useNoticeErrors / useToastErrors)

- `error-handling.md §6.4` の実装コードをそのまま採用 (🔵)
- `useToastErrors` は `useToast()` を composable 初期化時ではなく `showError` 関数内で遅延評価するよう変更
  - 理由: Nuxt インスタンス不在テスト環境でのエラー回避 + mock 注入タイミングの確保

---

## 4. テスト側の調整点 (Red フェーズからの変更)

### 4.1 vi.mock '#imports' → 直接 mock への変更

**問題**: `vi.mock('#imports')` で `useI18n` / `useErrorMessage` / `useToast` を差し替えても、
composable 内の auto-import に効かなかった。

**解決**:
- `useI18n`: `vi.mock('vue-i18n')` で直接差し替え (`useErrorMessage.test.ts`)
- `useErrorMessage`: `vi.mock('~/composables/useErrorMessage')` で直接差し替え (3チャネルテスト)
- `useToast`: `vi.mock('@nuxt/ui/composables/useToast')` で直接差し替え (`useToastErrors.test.ts`)

### 4.2 vi.hoisted() の導入

**問題**: `vi.mock` ファクトリは hoisting されるため、外部 `const` 変数を参照すると TDZ エラーが発生する。

**解決**: `vi.hoisted()` 内で `tFn` / `teFn` / `errorToMessageMock` / `toastAddMock` を定義し、
ファクトリから参照可能にした。

### 4.3 ref の扱い

**問題**: `vi.mock('#imports', () => ({ ref: (v) => ({ value: v }) }))` の非リアクティブ簡易 `ref` が
`useFormErrors` / `useNoticeErrors` の state 更新に干渉する懸念があった。

**解決**: `vi.mock('#imports', () => { const { ref } = require('vue'); return { ref, ... } })` で
vue の実際の `ref` を使うことで reactivity を確保した。

### 4.4 useToastErrors.ts の実装変更

**問題**: `const toast = useToast()` を composable トップレベルで呼ぶと、Nuxt インスタンスが
テスト環境に存在しないためエラーになる。

**解決**: `useToast()` を `showError` 関数内に移動して遅延評価にした。
これにより mock が `showError` 呼び出し前に注入されるタイミングで有効化される。

---

## 5. 品質判定

```
✅ 高品質:
- テスト結果: 全 40 テスト成功 (composable 4ファイル + 既存テスト全件)
- 実装品質: error-handling.md §5.1/§6.4 のコードをそのまま採用 (シンプル)
- ファイルサイズ: 全ファイル 800行以下 (最大77行)
- モック使用: 実装コードにモック・スタブなし
- 文言リテラル: TS コードに文言直書きなし (NFR-204 準拠)
```

---

## 6. Refactor フェーズへの注意点

- `useToastErrors.ts` の `useToast()` 遅延評価は意図的な変更。Refactor で元の設計 (トップレベル) に戻すと
  テストが壊れる可能性があるため、現行の遅延評価方式を維持すること
- テストの `vi.mock('vue-i18n')` / `vi.mock('@nuxt/ui/composables/useToast')` / `vi.mock('~/composables/useErrorMessage')`
  の mock パスは正確に解決されているため変更しないこと
- `ALREADY_IN_GROUP` 分岐は `error-handling.md` 設計書に記載なし (旧版) だが、
  `error-codes.ts` と `locales/ja.json` に定義済のため実装に含める (このままで正しい)
