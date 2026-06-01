# Green フェーズ: グループ設定画面 (`/groups/[id]/settings`)

- **機能名**: グループ設定画面 (group-settings-page)
- **タスクID**: TASK-0019
- **要件名**: auth-onboarding
- **Green フェーズ実施日**: 2026-06-01

---

## 実装ファイル一覧

| ファイル | 種別 | 内容 |
|---|---|---|
| `app/utils/invitation.ts` | 新規作成 | `deriveInvitationStatus` 純関数 |
| `app/composables/useListGroupMembers.ts` | 新規作成 | メンバー一覧取得 composable |
| `app/pages/groups/[id]/settings.vue` | 新規作成 | グループ設定ページ |
| `i18n/locales/ja.json` | 更新 | `groups.settings.*` 不足キー追加 |
| `i18n/locales/en.json` | 更新 | `groups.settings.*` 不足キー追加 (空文字) |

---

## 実装方針と判断理由

### 1. `app/utils/invitation.ts`

- `expires_at < now` の厳密未満比較で `'expired'`、それ以外 `'active'` を返す純関数
- 境界 `expires_at == now` は `<` 比較のため `'active'` (EDGE-107 確定仕様)
- ms 数値の比較のみを担当し、ISO 文字列パース責務は呼び出し側に委譲 (単一責任)

### 2. `app/composables/useListGroupMembers.ts` (🟡)

- Supabase RLS 制約により、他ユーザーの `auth.users.user_metadata` (full_name / avatar_url) をクライアントから直接取得できないため、`group_members` テーブルから `user_id` / `joined_at` のみを取得
- 表示名・avatar の補完は UI 側で `useSupabaseUser()` と照合して現在ユーザーのみ適用
- 将来 `profiles` テーブル追加後にこの composable を拡張可能な設計にした

### 3. `app/pages/groups/[id]/settings.vue`

- `definePageMeta` 無指定 → `default.vue` 自動継承 (ADR-011 D1)
- `route.params.id` でグループ UUID を取得
- `useListInvitations(groupId.value)` / `useGenerateInvitation()` / `useListGroupMembers(groupId.value)` を composable 経由で呼ぶ (REQ-406)
- 招待 URL: `useRequestURL().origin + '/join/' + code` (SSR 対応, REQ-408)
- コピー完了: `useToast().add({ title: t('groups.settings.urlCopied'), duration: 2000 })` (NFR-203)
- pending 中 Skeleton 表示 + ボタン disabled (NFR-202, EDGE-003)
- `navigator.clipboard.writeText()` は `<ClientOnly>` で SSR 時のエラーを回避

### 4. i18n キー追加

追加したキー:
- `groups.settings.urlCopied`: コピー完了 toast
- `groups.settings.copyUrl`: コピーボタンラベル
- `groups.settings.statusActive` / `statusExpired`: 招待状態ラベル
- `groups.settings.issuedAt` / `expiresAt`: 発行日・期限ラベル

---

## テスト実行結果

```
Test Files  3 passed (3) [invitation.test.ts + useListInvitations + useGenerateInvitation + auth]
Tests  13 passed (13)
```

- `tests/unit/utils/invitation.test.ts`: TC-01 / TC-02 / TC-03 全て PASS ✅
- 既存 auth-onboarding テスト (TASK-0012 composable + TASK-0013 middleware): 全て PASS ✅
- video-playback の `useVideoPlayer.test.ts` 失敗: 別フィーチャーの問題で本タスクと無関係 (タスク指示通り無視)

---

## 品質チェック

| 項目 | 結果 |
|---|---|
| `pnpm typecheck` | ✅ 成功 (Exit: 0) |
| `pnpm exec eslint --fix` (対象ファイル) | ✅ 成功 (Exit: 0) |
| `pnpm test --run` (auth-onboarding 関連) | ✅ 全 PASS |
| 実装コードにモック・スタブなし | ✅ |
| 800 行制限 | ✅ (settings.vue: ~190行) |

---

## 課題・改善点 (Refactor フェーズ候補)

1. **メンバー一覧の表示名問題** (🟡): 現在は現在ユーザーのみ表示名+avatarを表示。他メンバーは `user_id` 末尾 8 文字の暫定表示。将来の `profiles` テーブル追加時に `useListGroupMembers` を拡張して解決する
2. **`buildInvitationUrl` の再利用性**: page ローカルの関数のため `app/utils/invitation.ts` に移動しても良い
3. **空状態メッセージ**: 空状態の `<div>` に i18n テキストを追加して UX を向上させる候補
4. **`useListGroupMembers` の型**: `GroupMember` 型は将来 `interfaces.ts` に集約する

---

## 信頼性分布

- 🔵 約 70% (招待リンク一覧・状態派生・URL 組立・コピー・i18n・ローディング・layout)
- 🟡 約 30% (メンバー一覧取得クエリ・表示名フォールバック・useListGroupMembers 実装方針)
- 🔴 0%
