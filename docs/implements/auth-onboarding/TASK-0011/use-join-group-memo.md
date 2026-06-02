# useJoinGroup TDD開発完了記録

## 確認すべきドキュメント

- `docs/tasks/auth-onboarding/TASK-0011.md`
- `docs/implements/auth-onboarding/TASK-0011/use-join-group-requirements.md`
- `docs/implements/auth-onboarding/TASK-0011/use-join-group-testcases.md`

## 最終結果 (2026-06-01)

- **実装率**: 100% (4/4 テストケース)
- **品質判定**: 合格 (高品質)
- **TODO更新**: ✅ 完了マーク追加済み

## 重要な技術学習

### 実装パターン

- **EDGE-005 明示変換**: DB の `'invitation_not_found'` と App 識別子 `'invitation_not_found_by_link'` は文字列が異なる。`isAppError` は `message.includes(code)` で判定するため、詰め替えなしでは fallthrough して `errors.generic + Sentry` になる。`useJoinGroup` 内で明示判定し App 識別子へ詰め替えてから `setNotice` に渡すことで解決。
- **意図的な二重条件**: `msg.includes('invitation_not_found') && !msg.includes('invitation_not_found_by_link')` — 後者の否定がないと詰め替え後 App 識別子を誤って再変換するため意図的に保持する。削除・簡略化禁止。
- **try/finally パターン**: EDGE-003 二重送信防止で `pending` を成功・エラー問わず確実にリセット。

### テスト設計

- **方式 A (useNoticeErrors / useErrorMessage 実物)**: `notice.value` の実解決結果（`errors.xxx` キー文字列）を直接 assert できるため、EDGE-005 の詰め替え成否を明確に区別できる。
- **Sentry 二重証明**: TC2 で `notice.value === 'errors.invitation_not_found_by_link'` (肯定) と `Sentry.captureException` 非呼び出し (否定) の両方を assert し、詰め替えの成功を二重に担保。
- **戻り値の error は元のまま**: 詰め替えは `setNotice` 専用で、`return { data, error }` の `error` は RPC が返した元エラーを返す契約（TC2 の assert で確認）。

### 品質保証

- スコープ内テスト (useJoinGroup.test.ts): TC1〜TC4 全通過 (4/4)
- 全テストスイート: 15 ファイル・51 テスト全通過
- typecheck: エラーなし
- 実行時間: 約 600ms（30 秒未満、問題なし）

## 残課題

- `ActionResult<T>` / `UseJoinGroupReturn` が `useCreateGroup.ts` との間で型重複 → 将来 `app/types/interfaces.ts` 集約 TODO (本タスクスコープ外)
