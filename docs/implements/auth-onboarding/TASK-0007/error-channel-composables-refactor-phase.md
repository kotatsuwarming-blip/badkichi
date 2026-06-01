# Refactor フェーズ記録: cross-cutting エラーチャネル composable 4本

- **機能名**: error-channel-composables（useErrorMessage / useFormErrors / useNoticeErrors / useToastErrors）
- **タスクID**: TASK-0007
- **要件名**: auth-onboarding
- **作成日**: 2026-06-01
- **フェーズ**: Refactor（コード品質改善 完了）

---

## 1. リファクタリング内容

### 1.1 型安全性修正: useToastErrors.ts — color: 'red' → 'error' 🔴

**問題**: `toast.add({ color: 'red' })` が `pnpm typecheck` で型エラー。
```
app/composables/useToastErrors.ts(28,7): error TS2322:
  Type '"red"' is not assignable to type '"error" | "primary" | "secondary" |
  "success" | "info" | "warning" | "neutral" | undefined'.
```

**原因**: 設計書 `error-handling.md §6.4` は `color: 'red'` だが、Nuxt UI v4.5 の toast color 型には `'red'` が存在しない。

**修正内容**:
- `app/composables/useToastErrors.ts`: `color: 'red'` → `color: 'error'`
- `tests/unit/composables/useToastErrors.test.ts`: アサーション `color: 'red'` → `color: 'error'`（テスト名と説明コメントも更新）

**信頼性レベル**: 🔴 (設計書は旧 'red' だが Nuxt UI v4 型安全性を優先)

### 1.2 コメント修正: useFormErrors.ts — clear() の実装方針コメント 🔵

**問題**: `clear(field)` のJSDocコメントに「`delete でキー削除`」と記載されていたが、実装はオブジェクトスプレッドを使用している（`@typescript-eslint/no-dynamic-delete` 対応で Green フェーズで変更済）。

**修正内容**:
- 「`delete でキー削除`」→「`オブジェクトスプレッドで当該キーを除いた新オブジェクトを生成`」
- ESLint 対応の理由を JSDoc に追記

---

## 2. セキュリティレビュー結果

| 観点 | 評価 | 備考 |
|------|------|------|
| XSS 対策 | ✅ | composable は文言変換のみ。テンプレートは Vue のエスケープに委ねる |
| 入力値検証 | ✅ | isAppError / isPgError で型ガード済 |
| 認証・認可 | ✅ (対象外) | エラー表示層のため認証ロジックは持たない |
| Sentry 送信情報 | ✅ | error オブジェクトのみ送信。PII を含まない前提は domain 側の責務 |
| 重大な脆弱性 | なし | — |

---

## 3. パフォーマンスレビュー結果

| 観点 | 評価 | 備考 |
|------|------|------|
| errorToMessage の if 分岐 | ✅ | 7+4=11 分岐、線形探索だがフォーム操作頻度では問題なし |
| clear(field) のスプレッド | ✅ | フォームフィールド数は少なく O(n) で問題なし |
| useToast 遅延評価 | ✅ | 関数内評価でテスト対応済、実行時コストは微小 |
| 重大な性能課題 | なし | — |

---

## 4. 改善後ファイルの状態

| ファイル | 行数 | 変更点 |
|---|---|---|
| `app/composables/useErrorMessage.ts` | 97行 | 変更なし |
| `app/composables/useFormErrors.ts` | 49行 | clear() コメント修正のみ |
| `app/composables/useNoticeErrors.ts` | 40行 | 変更なし |
| `app/composables/useToastErrors.ts` | 37行 | color: 'red' → 'error' |
| `tests/unit/composables/useToastErrors.test.ts` | 70行 | アサーション color 値修正 |

---

## 5. テスト実行結果

```
Test Files  11 passed (11)
     Tests  40 passed (40)
  Start at  16:58:54
  Duration  395ms
```

TC1〜TC4 全件継続成功。

---

## 6. 品質判定

```
✅ 高品質:
- テスト結果: 全 40 テスト継続成功 (TC1〜TC4 含む)
- 型チェック: pnpm typecheck 通過 (color 型エラー解消)
- Lint: 本タスク対象ファイルに新規エラーなし (video-playback/interfaces.ts の既存エラーは対象外)
- セキュリティ: 重大な脆弱性なし
- パフォーマンス: 重大な性能課題なし
- ファイルサイズ: 全ファイル 100行以下 (500行制限を大きく下回る)
- コード品質: Green フェーズ引き継ぎ制約を全て維持
```

---

## 7. Green フェーズ引き継ぎ制約の維持確認

- [x] `useToastErrors.ts` の `useToast()` は `showError` 関数内で遅延評価を維持
- [x] テストの vi.mock パス (`vue-i18n`, `@nuxt/ui/composables/useToast`) 変更なし
- [x] `ALREADY_IN_GROUP` 分岐削除なし
- [x] `useFormErrors.ts` の `clear(field)` はオブジェクトスプレッド方式を維持
