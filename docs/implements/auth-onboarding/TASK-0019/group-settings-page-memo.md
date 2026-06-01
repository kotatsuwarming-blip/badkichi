# TDD 開発メモ: グループ設定画面 (`/groups/[id]/settings`)

- **機能名**: group-settings-page
- **タスクID**: TASK-0019
- **要件名**: auth-onboarding

---

## Red フェーズ

- **実施日**: 2026-06-01
- **作成テスト**: `tests/unit/utils/invitation.test.ts` (3 ケース: TC-01/TC-02/TC-03)
- **対象関数**: `deriveInvitationStatus(expiresAt: number, now: number): 'active' | 'expired'`
- **テスト状態**: `app/utils/invitation.ts` が未作成のため FAIL (予定通り)

---

## Green フェーズ

- **実施日**: 2026-06-01
- **実装方針**:
  - `app/utils/invitation.ts` に `deriveInvitationStatus` 純関数を実装
  - `app/composables/useListGroupMembers.ts` を新規作成 (🟡 RLS 制約により user_id のみ取得)
  - `app/pages/groups/[id]/settings.vue` を新規作成
  - i18n キー不足分を `ja.json` / `en.json` に追加
- **テスト結果**: TC-01/02/03 全て PASS ✅
- **typecheck**: 成功 ✅
- **lint**: 成功 ✅

### メンバー一覧の重要決定事項 (🟡)

**問題**: `group_members` テーブルに `user_id` しか存在せず、Supabase RLS により他ユーザーの `auth.users.user_metadata` をクライアントから取得できない。`profiles` テーブルも未作成。

**確定方針**:
- `useListGroupMembers` は `user_id` / `joined_at` のみを返す
- UI 側で `useSupabaseUser().sub` と照合し、現在ユーザーのみ `user_metadata` から表示名+avatarを表示
- 他メンバーは `user_id` 末尾 8 文字を暫定表示

**将来の解決策**: `profiles` テーブル追加後に `useListGroupMembers` を拡張して他メンバーの表示名・avatarを取得可能にする。

---

## Refactor フェーズ

- **実施日**: 2026-06-01
- **改善内容**:
  1. 空状態メッセージを i18n 化 (`groups.settings.noInvitations` / `groups.settings.noMembers` を ja.json/en.json に追加し settings.vue で表示)
  2. profiles テーブル将来対応の TODO コメントを `useListGroupMembers.ts` と `settings.vue` の関連箇所に追記
  3. `copyInvitationUrl` の `<ClientOnly>` ガード意図をコメントで明示化
- **テスト結果**: 26 ファイル / 102 テスト 全 PASS ✅
- **typecheck**: 成功 ✅
- **lint**: 成功 ✅
- **現在のフェーズ**: 完了 → 次は `tdd-verify-complete`

## Verify Complete フェーズ

- **実施日**: 2026-06-01
- **テスト結果**: 26 ファイル / 102 テスト 全 PASS ✅ (スコープ内 3 ケース含む)
- **typecheck**: 成功 ✅ (Exit: 0)
- **lint**: 対象 4 ファイル全て成功 ✅ (Exit: 0)
- **判定**: ✅ タスク完了 (スコープ外問題あり)
  - スコープ内 (auth-onboarding 由来) テスト: 全 PASS
  - スコープ外失敗: video-playback 関連 (useVideoPlayer / youtube-adapter 等) — 別フィーチャの未実装。auth-onboarding スコープ外として扱う。現時点では別フィーチャが実装前のためスコープ外失敗もなし (全 102 テスト PASS)
  - 完了条件 7 項目: 全 [x] チェック済 (メンバー一覧は暫定実装+TODO明記で許容)
- **タスクファイル更新**: docs/tasks/auth-onboarding/TASK-0019.md 完了マーク追加済み ✅

## 残存 TODO

- `GroupMember` 型 / `getMemberDisplayName` / `getMemberAvatarUrl` は profiles テーブル追加後に実装を差し替える (コード内 TODO コメントで明記済み)
