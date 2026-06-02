# TASK-0017: /groups/new ページ Red フェーズ記録

**作成日**: 2026-06-01  
**タスク**: TASK-0017 — /groups/new ページ実装  
**フェーズ**: Red → Green へ

---

## 1. Red フェーズ判定サマリー

**新規失敗テストは作成しない（0 件）。**

理由: `docs/implements/auth-onboarding/TASK-0017/groups-new-testcases.md` §0 結論サマリーおよび §7 の判定に基づき、本 page (`app/pages/groups/new.vue`) に固有の新規 unit テストは不要と確定している。

- NFR-301「page UI 見た目テストを書かない」
- フォーム検証ロジック (Zod) は TASK-0006 テストで検証済
- `create` / `fieldErrors` / `pending` 制御は TASK-0010 テストで検証済
- navigateTo 分岐: 自明な結線・同型パターン実証済・基盤コスト過大・E2E 担保の 4 点から不要（§4.2 詳述）
- 通し動作は TASK-0020 (E2E) に委譲

---

## 2. 依存層テスト緑確認（本タスクで実施した唯一の検証アクション）

### 実行コマンド

```bash
pnpm vitest run tests/unit/schemas/group-name.test.ts tests/unit/composables/useCreateGroup.test.ts
```

### 実行結果

```
 RUN  v4.1.4 /path/to/badkichi

 Test Files  2 passed (2)
       Tests  8 passed (8)
    Start at  20:53:38
    Duration  183ms
```

**結果: ✅ 全 8 テスト GREEN**

| ファイル | テスト数 | 結果 | 確認内容 |
|---|---|---|---|
| `tests/unit/schemas/group-name.test.ts` | 複数 | ✅ GREEN | EDGE-101〜105 境界値 (Zod group-name) |
| `tests/unit/composables/useCreateGroup.test.ts` | 複数 | ✅ GREEN | TC1 成功 (refresh) / TC2 失敗 (setFieldError) |

---

## 3. 新規失敗テスト不要の根拠

### 3.1 テストケース定義の結論（§7 参照）

| 分類 | 件数 | 備考 |
|---|---|---|
| 正常系 | 0 | 依存層 (Zod / useCreateGroup) + E2E で検証 |
| 異常系 | 0 | `invalid_group_name` は useCreateGroup 検証済、同名重複は存在せず |
| 境界値 | 0 | EDGE-101〜105 は Zod スキーマテストで検証済 |
| page 固有 (navigateTo 分岐) | 0 | 不要（§4.2、自明結線 / 同型実証済 / 基盤コスト過大 / E2E 担保） |
| **合計 (本 page 新規)** | **0** | NFR-301 + 冗長ケース禁止 |

### 3.2 navigateTo 分岐（L5）不要の根拠（testcases.md §4.2 から引用）

1. **分岐ロジックが自明かつ最小**: `error === null` 単一条件の通過/非通過のみ
2. **同パターンが依存層で実証済**: `useLogin.test.ts` TC2/TC3 で同型分岐確認済
3. **テスト基盤コストが見合わない**: `.vue` マウント基盤未導入、NFR-301 の中での新規導入はコスト過大
4. **通し検証が E2E で担保**: TASK-0020 (E2E / NFR-302) でカバー予定

---

## 4. Green フェーズで実装すべき内容

`app/pages/groups/new.vue` の実装:

```vue
<script setup lang="ts">
// useCreateGroup (TASK-0010) / groupNameSchema (TASK-0006) を結線
// 成功時 navigateTo('/') / エラー時 fieldErrors inline 表示 / pending disabled
</script>
<template>
  <!-- <UForm :schema="groupNameSchema"> + <UFormField> + <UInput> + <UButton :disabled="pending"> -->
</template>
```

実装詳細は `note.md` §6 参照。

---

## 5. 品質評価

- **新規失敗テスト**: 0 件（意図的、根拠あり）
- **依存層テスト緑**: ✅ 2 ファイル 8 テスト GREEN
- **信頼性レベル**: 🔵 大半（testcases.md §信頼性レベルサマリー参照）
- **Red フェーズ品質判定**: ✅ 高品質
  - 「テスト不要」の判定根拠が NFR・ADR・実装パターン実証の 🔵 情報に支えられている
  - 🔴 推測なし
