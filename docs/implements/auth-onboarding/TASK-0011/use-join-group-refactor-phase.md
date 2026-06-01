# Refactor フェーズ記録: useJoinGroup

**機能名**: useJoinGroup  
**タスクID**: TASK-0011  
**要件名**: auth-onboarding  
**作成日**: 2026-06-01  
**フェーズ**: Refactor (品質改善完了)

---

## リファクタリング概要

Green フェーズで作成した実装コードの品質改善を実施。機能的な変更は一切なし。

---

## レビュー結果

### セキュリティレビュー ✅

- **RLS + RPC で認可完結**: server route 不使用、クライアント直結 BaaS。ADR-010 D2 に準拠
- **入力値**: `inviteCode` は文字列としてそのまま RPC 引数に渡すのみ。SQL インジェクション不可
- **エラー情報漏洩なし**: DB エラーは useNoticeErrors 経由で i18n キーに変換後に表示。生メッセージは UI に出ない
- **重大な脆弱性**: なし

### パフォーマンスレビュー ✅

- **refresh は成功時のみ**: エラー時に不要な `useCurrentGroup().refresh()` を呼ばない設計
- **不要処理なし**: ループや重複クエリなし
- **非同期処理**: `try/finally` パターンで確実な `pending` リセット、メモリリークなし
- **重大な性能課題**: なし

---

## 改善内容

### 1. 型定義コメントに TODO 注記を追加 🔵🟡

**改善内容**: `ActionResult<T>` と `UseJoinGroupReturn` の型宣言コメントに将来の集約先と TODO を追記。

**根拠**: `useCreateGroup.ts` に同名インターフェースが重複定義されている。設計上の共通定義は
`docs/design/auth-onboarding/interfaces.ts §3/§5` にある。実際の集約は既存 composable のテストを
壊さず移行するための慎重な作業が必要なため、本タスクスコープ外とし TODO コメントで記録するに留めた。

**信頼性**: 🔵 設計文書 interfaces.ts §3/§5 の存在確認済み、🟡 集約方針は将来判断

### 2. EDGE-005 コメントに「意図的な二重条件」説明を追加 🔵

**改善内容**: `msg.includes('invitation_not_found') && !msg.includes('invitation_not_found_by_link')` の
二重条件が一見冗長に見えるが意図的である理由を詳述した。

**追加した説明**:
- `invitation_not_found_by_link` は `invitation_not_found` を includes するため、否定条件がないと詰め替え後の App 識別子を誤って再変換してしまう
- 将来 DB 側が識別子を変更した場合の安全弁としても機能する
- 削除・簡略化しないこと、を明記

**信頼性**: 🔵 TASK-0011.md §実装詳細、architecture.md 注2 (EDGE-005) に基づく意図確認済み

---

## 変更なし (維持した判断)

| 項目 | 判断 | 理由 |
|---|---|---|
| `import type { Ref } from 'vue'` | 維持 | `useCreateGroup.ts` と同一パターン。片方のみ削除は不整合を招く |
| EDGE-005 明示変換ロジック | 維持 | 機能的に正確。削除・簡略化禁止の制約あり |
| try/finally パターン | 維持 | EDGE-003 二重送信防止として正確に機能 |
| テストコード | 変更なし | Refactor フェーズで機能変更なし |

---

## 改善後のコード全文

```ts
/**
 * 【機能概要】: グループ参加 RPC を実行する Write 系 composable
 * ...（ファイル本文参照）
 */
```

→ `app/composables/useJoinGroup.ts` 参照（122行）

---

## テスト実行結果

```
Test Files  15 passed (15)
     Tests  51 passed (51)
  Duration  ~600ms
```

- **useJoinGroup.test.ts**: TC1〜TC4 全て通過 (4/4)
- **全スイート**: 15 ファイル・51 テスト全通過
- **lint**: video-playback/interfaces.ts の既存エラーのみ（スコープ外）
- **typecheck**: 通過（エラーなし）

---

## 品質判定

✅ **高品質**

| 基準 | 状態 |
|---|---|
| テスト結果 | 全 51 テスト成功 |
| セキュリティ | 重大な脆弱性なし |
| パフォーマンス | 重大な性能課題なし |
| リファクタ品質 | 目標達成 |
| コード品質 | 適切なレベル |
| ファイルサイズ | 122 行（500 行制限内） |
| 日本語コメント | 詳細かつ意図が明確 |

---

## 残課題

- `ActionResult<T>` / `UseJoinGroupReturn` の複数 composable 間の型重複 → 将来 `app/types/interfaces.ts` 集約 TODO (本タスクスコープ外)
