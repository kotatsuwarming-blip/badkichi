# Refactor フェーズ: グループ設定画面 (`/groups/[id]/settings`)

- **機能名**: グループ設定画面 (group-settings-page)
- **タスクID**: TASK-0019
- **要件名**: auth-onboarding
- **Refactor フェーズ実施日**: 2026-06-01

---

## リファクタリング概要

Green フェーズで実装した 3 ファイルを対象に、以下の改善を実施した。
機能的な変更は一切行っておらず、全テスト通過を維持している。

---

## 改善項目

### 1. 空状態メッセージの i18n 追加 🔵

**対象ファイル**: `i18n/locales/ja.json`, `i18n/locales/en.json`, `app/pages/groups/[id]/settings.vue`

**変更前**: 招待リンク一覧・メンバー一覧の空状態 `<div>` にコメントのみ記載、テキストなし

**変更後**: i18n キーを追加してユーザーに案内メッセージを表示

追加キー:
- `groups.settings.noInvitations`: 「まだ招待リンクがありません。「招待リンクを発行」ボタンで発行してください」
- `groups.settings.noMembers`: 「メンバーがいません」

### 2. profiles テーブル将来対応の TODO コメント追加 🟡

**対象ファイル**: `app/composables/useListGroupMembers.ts`, `app/pages/groups/[id]/settings.vue`

**変更内容**:
- `GroupMember` 型定義に「profiles テーブル追加後に display_name / avatar_url を型へ追加し、JOIN クエリで全メンバーの表示名を取得できるよう拡張する」旨の TODO を追加
- `getMemberDisplayName()` 関数に「profiles テーブル追加後は member.display_name を直接参照する形にリファクタリングする」旨の TODO を追加
- `getMemberAvatarUrl()` 関数に「profiles テーブル追加後は全メンバーの avatar_url を返せるよう拡張する」旨の TODO を追加
- user_id 末尾8文字フォールバック行にインラインの TODO コメントを追加

### 3. ClientOnly ガードのコメント明示化 🔵

**対象ファイル**: `app/pages/groups/[id]/settings.vue`

**変更前**: 「ブラウザ API のため SSR 時は ClientOnly で保護 (template 側で対応)」と記載するのみ

**変更後**: `copyInvitationUrl` の JSDoc に「コピーボタンが `<ClientOnly>` でラップ済みのため SSR 時にこの関数が呼ばれることはない」と明記し、関数内の `navigator.clipboard` 呼び出し行のコメントにも「呼び出し元ボタンが `<ClientOnly>` でガード済みのため SSR 時は到達しない」を追記。意図を明確に文書化した。

---

## 品質確認結果

| 項目 | 結果 |
|---|---|
| `pnpm test --run` (全ユニットテスト) | ✅ 26 ファイル / 102 テスト全 PASS |
| `pnpm typecheck` | ✅ 成功 (Exit: 0) |
| `pnpm exec eslint` (対象3ファイル) | ✅ 成功 (Exit: 0) |
| 機能的変更なし | ✅ |
| 実装コードにモック・スタブなし | ✅ |
| ファイルサイズ (<500行) | ✅ (settings.vue: ~315行) |

---

## セキュリティレビュー結果

- **認可**: middleware + RLS で当該グループのメンバーのみアクセス可能 (data-foundation 実装済) ✅
- **RLS**: group_invitations / group_members テーブルとも他グループのデータを見えない設計 ✅
- **入力検証**: URL 組立は composable の RPC 返値 (8 hex) のみを使用 ✅
- **重大脆弱性**: なし

---

## パフォーマンスレビュー結果

- **クエリ数**: useAsyncData で SSR 時に 2 クエリ (invitations / members) で抑制済み (NFR-002) ✅
- **クリップボード**: `copyInvitationUrl` は非同期でトーストと独立 ✅
- **重大なパフォーマンス課題**: なし

---

## 残存 TODO 一覧

| TODO | 場所 | 優先度 |
|---|---|---|
| profiles テーブル追加後に `GroupMember` 型に display_name / avatar_url を追加 | `app/composables/useListGroupMembers.ts` | 将来 (profiles 実装時) |
| profiles テーブル追加後に `getMemberDisplayName` を削除して member.display_name 参照へ変更 | `app/pages/groups/[id]/settings.vue` | 将来 (profiles 実装時) |
| profiles テーブル追加後に `getMemberAvatarUrl` を削除して member.avatar_url 参照へ変更 | `app/pages/groups/[id]/settings.vue` | 将来 (profiles 実装時) |

---

## 信頼性分布

- 🔵 約 80% (空状態 i18n・ClientOnly コメント整理)
- 🟡 約 20% (profiles TODO 箇所: RLS 制約対応の実装時確定方針に基づく)
- 🔴 0%
