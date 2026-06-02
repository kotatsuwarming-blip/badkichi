# useLogin TDD開発完了記録

## 確認すべきドキュメント

- `docs/tasks/auth-onboarding/TASK-0008.md`
- `docs/implements/auth-onboarding/TASK-0008/useLogin-requirements.md`
- `docs/implements/auth-onboarding/TASK-0008/useLogin-testcases.md`

## 🎯 最終結果 (2026-06-01)
- **実装率**: 100% (3/3テストケース)
- **品質判定**: 合格（高品質）
- **TODO更新**: ✅完了マーク追加
- **全体テスト**: 12ファイル・43件全通過 / duration 467ms

---

## 💡 重要な技術学習

### 実装パターン
- **auto-import mock 2段構成**: `vi.mock('#imports')` だけでは Nuxt Vite transform が解決した実パスには効かない。`vitest.config.ts` に `resolve.alias` を定義し、`#supabase-client` / `#nuxt-router` の安定エイリアスを使う
- **alias 定義方法**: `new URL('.', import.meta.url).pathname` でプロジェクトルートを取得し、`node_modules/nuxt/...` などシンボリックリンクパスを組み立てる（`node:fs`/`node:path` は TS 型エラーになるため不使用）
- **try/finally による pending 管理**: `pending.value = true` → try { ... } finally { pending.value = false } で成功・失敗両方を確実にリセット（EDGE-003）
- **useNoticeErrors 直接 mock**: composable ファイルを `vi.mock('~/composables/useNoticeErrors')` で直接差し替え（`useErrorMessage` の直接 mock と同アプローチ）

### テスト設計
- **vi.hoisted + vi.mock('#imports') + 直接パス mock の 3 層構成**: TDZ を回避しつつ Nuxt の auto-import 解決を全カバー
- **invocationCallOrder で順序検証**: `toHaveBeenCalledWith` では順序を保証できない。`mock.invocationCallOrder[0]` の大小比較で signOut → navigateTo の順序を検証（TC2）
- **部分一致（toContain）で redirectTo 検証**: 絶対/相対 URL 扱いの実装判断に依存しないよう `/confirm?redirect=` の部分一致に留める
- **setNotice 呼び出し事実で代替検証**: notice.value の直接検証ではなく `setNoticeMock.toHaveBeenCalledWith(error)` で責務分離を維持（文言変換は useNoticeErrors 担当）

### 品質保証
- **brace-style 1tbs**: `} finally {` / `} else {` を同一行に置く。独立行にすると ESLint `@stylistic/brace-style: 1tbs` 違反
- **vitest.config.ts alias の単一管理**: pnpm の `.pnpm` バージョン入りパスをテストコードから分離し、パッケージ更新時は config 1 箇所だけ変更

---

## ⚠️ 残課題（次サイクル・スコープ外）

- **`clear()` 呼び出し未検証**: login 冒頭で前回 notice をクリアしているが TC では未検証（最小カバレッジ方針・動作は正しい）
- **`pending` 遷移未検証**: true/false 遷移テストは最小カバレッジ方針で見送り（finally で確実に false に戻す実装済み）
- **Windows パス互換**: `new URL`.pathname は macOS/Linux 前提（プロジェクト想定環境内）
- **`docs/design/video-playback/interfaces.ts` の lint エラー**: lint 実行時に報告されるが本タスクのスコープ外。auto-debug を推奨

---

*Redフェーズ・Greenフェーズ・Refactorフェーズの経過記録は統合・削除し、最終状態のみ保持*
