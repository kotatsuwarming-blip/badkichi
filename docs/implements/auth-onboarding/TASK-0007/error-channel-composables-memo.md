# TDD開発完了記録: error-channel-composables

## 確認すべきドキュメント

- `docs/tasks/auth-onboarding/TASK-0007.md`
- `docs/implements/auth-onboarding/TASK-0007/error-channel-composables-requirements.md`
- `docs/implements/auth-onboarding/TASK-0007/error-channel-composables-testcases.md`

## 🎯 最終結果 (2026-06-01)
- **実装率**: 100% (6/6テストケース)
- **品質判定**: 合格（高品質）
- **TODO更新**: ✅完了マーク追加
- **テスト結果**: 全 40 テスト成功 (Test Files 11 passed, Tests 40 passed)
- **型チェック**: pnpm typecheck 通過（exit code 0）

## 概要

- 機能名: error-channel-composables（useErrorMessage / useFormErrors / useNoticeErrors / useToastErrors）
- 開発開始: 2026-06-01
- 現在のフェーズ: verify-complete 完了

## 関連ファイル

- 元タスクファイル: `docs/tasks/auth-onboarding/TASK-0007.md`
- 要件定義: `docs/implements/auth-onboarding/TASK-0007/error-channel-composables-requirements.md`
- テストケース定義: `docs/implements/auth-onboarding/TASK-0007/error-channel-composables-testcases.md`
- 実装ファイル（未作成）:
  - `app/composables/useErrorMessage.ts`
  - `app/composables/useFormErrors.ts`
  - `app/composables/useNoticeErrors.ts`
  - `app/composables/useToastErrors.ts`
- テストファイル:
  - `tests/unit/composables/useErrorMessage.test.ts` (TC1/TC2/TC3)
  - `tests/unit/composables/useFormErrors.test.ts` (TC4-a)
  - `tests/unit/composables/useNoticeErrors.test.ts` (TC4-b)
  - `tests/unit/composables/useToastErrors.test.ts` (TC4-c)

## Redフェーズ（失敗するテスト作成）

### 作成日時

2026-06-01

### テストケース概要

| TC | 観点 | 信頼性 |
|-----|------|--------|
| TC1 | App 識別子 INVALID_GROUP_NAME → flat キー 1:1 変換 | 🔵 |
| TC2 | 未マッピング fallthrough → errors.generic + Sentry 1回 | 🔵 |
| TC3 | UNIQUE_VIOLATION context 出し分け（te 真/偽の境界） | 🔵 |
| TC4-a | setFieldError → fieldErrors state 反映 + clear 単一 | 🔵 |
| TC4-b | setNotice → notice state 反映 + clear → null | 🔵 |
| TC4-c | showError → toast.add({ title, color: 'red' }) 1回 | 🔵 |

### 期待される失敗（実際の実行結果）

```
 FAIL  tests/unit/composables/useErrorMessage.test.ts
 FAIL  tests/unit/composables/useFormErrors.test.ts
 FAIL  tests/unit/composables/useNoticeErrors.test.ts
 FAIL  tests/unit/composables/useToastErrors.test.ts

Error: Cannot find module '~/composables/use{Xxx}' (実装ファイル未存在)
Test Files  4 failed (4)
```

Red フェーズとして正しい失敗（実装未存在起因）。

### #imports auto-import mock 解決方式

`vi.mock('#imports', factory)` でファクトリを直書きする方式を採用。

```typescript
vi.mock('#imports', () => ({
  useI18n: () => ({ t: tMock, te: teMock }),
  useErrorMessage: () => ({ errorToMessage: errorToMessageMock }),
  useToast: () => ({ add: toastAddMock }),
  ref: (v: unknown) => ({ value: v }),
}))
```

- `t`: キー透過（`(key) => key`）
- `te`: `vi.fn()` で各テストで `mockReturnValue` 切替
- `captureException`: `vi.mock('@sentry/nuxt')` で別途スパイ
- `ref`: 簡易実装（非リアクティブ）— Green 後に動作確認要

### 次のフェーズへの要求事項（Green フェーズで実装すべき内容）

1. `app/composables/useErrorMessage.ts` を作成（error-handling.md §5.1 の実装コードそのまま + ALREADY_IN_GROUP 分岐追加）
2. `app/composables/useFormErrors.ts` を作成（error-handling.md §6.4）
3. `app/composables/useNoticeErrors.ts` を作成（error-handling.md §6.4）
4. `app/composables/useToastErrors.ts` を作成（error-handling.md §6.4）
5. Green 後に `ref` 簡易実装の reactivity 問題を確認する

## Greenフェーズ（最小実装）

### 実施日時

2026-06-01

### 実装方針

- `error-handling.md §5.1` / `§6.4` の実装コードをそのまま採用 (🔵)
- `ALREADY_IN_GROUP` 分岐を `useErrorMessage` に追加 (設計書旧版のため未記載だが error-codes.ts 実装済)
- `useToastErrors` の `useToast()` を `showError` 関数内で遅延評価 (テスト mock 対応)

### テスト実行結果

```
Test Files  11 passed (11)
     Tests  40 passed (40)
```

TC1〜TC4 全件成功。

### テスト側の主な調整点

1. **vi.mock '#imports' → 直接 mock に変更**:
   - `useI18n`: `vi.mock('vue-i18n')` に変更 (実際の解決パス)
   - `useErrorMessage`: `vi.mock('~/composables/useErrorMessage')` に変更
   - `useToast`: `vi.mock('@nuxt/ui/composables/useToast')` に変更
2. **vi.hoisted() の導入**: TDZ エラー回避のため mock 変数を `vi.hoisted()` 内で初期化
3. **ref の扱い**: `vi.mock('#imports', () => { const { ref } = require('vue'); ... })` で vue の実際の ref を使用

## Refactorフェーズ（品質改善）

### 実施日時

2026-06-01

### 改善内容

1. **型安全性修正**: `useToastErrors.ts` の `color: 'red'` → `color: 'error'`
   - Nuxt UI v4 の toast color 型に `'red'` が存在しないため型エラーを解消
   - 設計書は旧 `'red'` だが型安全性を優先 (🔴)
   - テストのアサーション値も合わせて更新

2. **コメント修正**: `useFormErrors.ts` の `clear()` JSDoc
   - 「`delete でキー削除`」→「`オブジェクトスプレッドで当該キーを除いた新オブジェクトを生成`」に修正
   - `@typescript-eslint/no-dynamic-delete` 対応の注記を追加

### テスト実行結果

```
Test Files  11 passed (11)
     Tests  40 passed (40)
```

### pnpm lint

本タスク対象ファイルに新規エラーなし（`docs/design/video-playback/interfaces.ts` の既存エラーのみ、本タスク対象外）

### pnpm typecheck

通過（color 型エラー解消）

### 品質評価

✅ 高品質 — 全テスト継続成功 + typecheck 通過 + Green フェーズ引き継ぎ制約を全て維持

## verify-completeフェーズ（品質確認）

### 実施日時

2026-06-01

### テスト実行結果（最終確認）

```
Test Files  11 passed (11)
     Tests  40 passed (40)
  Start at  17:01:53
  Duration  401ms
```

スコープ内テスト（TC1〜TC4）: 全件成功
スコープ外テスト: 全件成功（失敗なし）

### pnpm typecheck（最終確認）

exit code: 0（型エラーなし）

### 完了条件チェックリスト

- [x] `useErrorMessage().errorToMessage` が App 識別子 7 種を 1:1 変換（INVALID_GROUP_NAME 代表でTC1確認）
- [x] PG SQLSTATE は `pgContext` で context 出し分け、context キーなければ `.generic` フォールバック（TC3確認）
- [x] 未マッピングエラーは `errors.generic` 返却 + `Sentry.captureException({ tags: { reason: 'unmapped_error_code' } })` 1回呼び出し（TC2確認）
- [x] `useFormErrors()` が `{ fieldErrors, setFieldError, clear }` を返す（TC4-a確認）
- [x] `useNoticeErrors()` が `{ notice, setNotice, clear }` を返す（TC4-b確認）
- [x] `useToastErrors()` が `{ showError }` を返す（TC4-c確認）
- [x] 4 本の戻り値が interfaces.ts §4 と一致（ErrorMessageApi / FormErrorsApi / NoticeErrorsApi / ToastErrorsApi）

### 意図的な設計差異（承認済）

- `color: 'red'` → `color: 'error'`: Nuxt UI v4.5 の toast color 型対応。設計書(error-handling.md §6.4)は旧 `'red'` だが型安全性を優先（🔴）
- `useToast()` の遅延評価: `showError` 関数内で評価することで mock 差し替えを可能にした（🔵）

## 💡 重要な技術学習

### 実装パターン

- **vi.mock パス解決**: `vi.mock('#imports')` は Nuxt auto-import に効かない。実際の解決パスを直接 mock する
  - useI18n → `vi.mock('vue-i18n')`
  - useToast → `vi.mock('@nuxt/ui/composables/useToast')`
  - useErrorMessage → `vi.mock('~/composables/useErrorMessage')`
- **vi.hoisted() 必須**: `vi.mock` ファクトリ内で変数を参照するには `vi.hoisted()` で TDZ エラーを回避する
- **useToast 遅延評価**: composable の最上位ではなく関数内で `useToast()` を呼ぶと、テスト環境での mock 差し替えが可能

### テスト設計

- **最小カバレッジ戦略**: App 識別子 7 種を代表 1 件（INVALID_GROUP_NAME）でカバー、PG SQLSTATE 4 種を代表 1 件（UNIQUE_VIOLATION）でカバー
- **境界値分岐**: `te()` の真/偽を同一 `it` 内で `mockReturnValue` 切替により両側を検証
- **ラッパテストの分離**: state 反映のみを検証、変換ロジックは useErrorMessage を mock で固定化

### 品質保証

- **ESLint no-dynamic-delete 対応**: `delete fieldErrors.value[field]` の代わりにオブジェクトスプレッドで当該キーを除外
- **Nuxt UI v4 型対応**: toast color は文字列型ではなくユニオン型。`'error'` が正しい選択
