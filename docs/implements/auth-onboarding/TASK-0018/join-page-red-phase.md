# Red フェーズ記録: /join/[code] ページ (TASK-0018)

- **機能名**: 招待リンク着地ページ (`buildLoginRedirect` 純粋関数)
- **タスクID**: TASK-0018
- **要件名**: auth-onboarding
- **作成日**: 2026-06-01
- **フェーズ**: Red（失敗テスト作成完了）

---

## 作成したテストケース一覧

| ID | 分類 | 入力 | 期待値 | 信頼性 | カバー要件 |
|---|---|---|---|---|---|
| TC-D2-1 | 正常系 | `/join/ABC12345` | `/login?redirect=%2Fjoin%2FABC12345` | 🔵 | REQ-108 / EDGE-001 |
| TC-D2-2 | 境界値 | `/join/a b&c` | `/login?redirect=%2Fjoin%2Fa%20b%26c` | 🔵 | EDGE-005 / EDGE-106 |

- **合計**: 2 ケース（全テストケース定義を網羅）
- **信頼性分布**: 🔵 2 / 🟡 0 / 🔴 0

---

## テストファイル

- **配置**: `tests/unit/utils/redirect.test.ts`

---

## 期待される失敗内容（Red 確認済）

```
FAIL  |node| tests/unit/utils/redirect.test.ts
Error: Cannot find module '~/utils/redirect'
```

`app/utils/redirect.ts` が未実装のためモジュール解決エラーで失敗。2 ケースともテスト実行されない状態で red を確認した。

---

## Green フェーズで実装すべき内容

- `app/utils/redirect.ts` を新規作成
- `buildLoginRedirect(path: string): string` を export
- 実装内容: `return '/login?redirect=' + encodeURIComponent(path)`
- page 側 (`app/pages/join/[code].vue`) での結線: `navigateTo(buildLoginRedirect(route.fullPath))`（E2E 委譲）

---

## 品質判定

- **判定**: ✅ 高品質
- テスト実行: 失敗確認済（モジュール未存在による期待通りの red）
- 期待値: 完全一致の具体文字列
- アサーション: `toBe` で適切
- 実装方針: `encodeURIComponent` 一本で明確
- 既存テスト影響: なし（`tests/unit/utils/rule-engine/` 15 ケース全通過）
