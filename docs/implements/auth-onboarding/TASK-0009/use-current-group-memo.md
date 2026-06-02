# useCurrentGroup TDD開発完了記録

## 確認すべきドキュメント

- `docs/tasks/auth-onboarding/TASK-0009.md`
- `docs/implements/auth-onboarding/TASK-0009/use-current-group-requirements.md`
- `docs/implements/auth-onboarding/TASK-0009/use-current-group-testcases.md`

## 🎯 最終結果 (2026-06-01)
- **実装率**: 100% (2/2 テストケース)
- **品質判定**: 合格（高品質）
- **TODO更新**: ✅ 完了マーク追加済み

## 💡 重要な技術学習

### 実装パターン
- `useAsyncData<T | null>('fixed-key', handler)` による固定キーラップが middleware/page 間の重複クエリ防止（NFR-002 / ADR-008 D4）に有効
- uid は `user.value?.sub`（`user.id` ではない）— memory `project_mvp_revised_scope` 確定ルール
- `.maybeSingle()` の 0 行は `{ data: null, error: null }` で正常値、例外ではない（ADR-006）
- クエリエラーは `if (error) throw error` のみ（error.vue グローバルフォールバック委譲）
- `groups` embed の null 許容は supabase.ts 生成型を真とし `| null` 維持（isOneToOne: false の推論仕様）

### テスト設計
- `vi.hoisted()` + 複数 alias mock の組み合わせパターン:
  - `vi.mock('#imports')` — Nuxt auto-import 全体差し替え
  - `vi.mock('#supabase-client')` — Nuxt Vite transform が直接パス変換する場合の安定エイリアス
  - `vi.mock('#supabase-user')` — useSupabaseUser 安定エイリアス
  - `vi.mock('#async-data')` — Nuxt core useAsyncData 安定エイリアス（vitest.config.ts に alias 追加）
- `useAsyncData` スタブは handler を即時 await 実行して `data: ref(result)` に詰めること（忘れると TC1 が data.value=null で失敗）
- `beforeEach(vi.clearAllMocks())` 後に各 TC 冒頭で `maybeSingleMock.mockResolvedValue(...)` を再設定する（clearAllMocks で実装が消えるため）
- `from().select().eq().maybeSingle()` チェーン mock: 各段を `vi.fn()` で返し `eq` 引数をスパイ検証可能にする

### 品質保証
- テストケース 2 つ（所属あり / 未所属）で境界値 + 分岐網羅を達成（memory `feedback_test_coverage` 準拠）
- TypeScript 型パラメータ `useAsyncData<CurrentGroup | null>` を明示することで呼び出し側の型推論を確定
- Refactor では `CurrentGroup` 型を composable 内にローカル定義し、supabase.ts 生成型を直接参照する形に改善

## テスト実行結果（verify-complete 時点）

```
 Test Files  13 passed (13)
      Tests  45 passed (45)
   Duration  543ms
```

- TC1（所属あり）: PASS
- TC2（未所属）: PASS
- `pnpm typecheck`: エラーなし
- `pnpm lint`: スコープ外エラー（docs/design/video-playback/interfaces.ts 既存エラー）のみ

## スコープ外の既知エラー
- `docs/design/video-playback/interfaces.ts` の lint エラー — 設計文書の未実装スコープ外ファイル。本タスクと無関係。
