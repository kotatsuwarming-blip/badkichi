# Refactor フェーズ記録: useGenerateInvitation + useListInvitations

**機能名**: 招待リンク 一覧表示 (Read) + 発行 (Write RPC) composable
**タスクID**: TASK-0012
**要件名**: auth-onboarding
**フェーズ**: Refactor（品質改善）
**作成日**: 2026-06-01

---

## 1. Refactor 前テスト確認

```
Test Files  17 passed (17)
     Tests  54 passed (54)
```

全テスト通過を確認してから Refactor を開始した。

---

## 2. セキュリティレビュー

- `useListInvitations`: Supabase RLS で group_members 権限チェック済み（data-foundation 検証済）。composable 側は groupId をクエリ引数に渡すのみ。直接の入力検証は不要（RLS が第一防衛線）。
- `useGenerateInvitation`: RPC `generate_invitation_code` 側で RLS 権限チェック済み。pending フラグによる二重送信防止あり（EDGE-003）。エラーオブジェクトを showError に素通しで渡すのみ（ログ漏洩なし）。
- **重大な脆弱性なし** 🔵

---

## 3. パフォーマンスレビュー

- `useAsyncData` キャッシュで 1 ナビゲーション 1 クエリ保証（NFR-002）。
- SELECT は必要列 4 列のみ（over-fetching なし）。
- pending try/finally で確実リセット（リソースリーク防止）。
- **重大な性能課題なし** 🔵

---

## 4. 改善計画と実施内容

### 4-1. テストファイル brace-style 修正 🔵（実施）

**対象**: `tests/unit/composables/useListInvitations.test.ts` L43-46

**問題**: ESLint `@stylistic/brace-style` (1tbs ルール) 違反。`try { } \n catch (e) {` の形式で改行が入っていた。

**修正内容**:
```diff
- try {
-   data = await handler()
- }
- catch (e) {
+ try {
+   data = await handler()
+ } catch (e) {
    errorRef.value = e as Error
  }
```

**信頼性**: 🔵 ESLint ルール (1tbs) に完全準拠

---

### 4-2. `useGenerateInvitation.ts` — `useToast` 取得タイミングのコメント補強 🟡（実施）

**対象**: `app/composables/useGenerateInvitation.ts` `useToast` 取得コメント

**問題**: setup レベル取得と useToastErrors の遅延取得パターンの差異について「なぜこの設計か」の説明が不足していた。

**修正内容**: コメントを以下のように強化：
- useToastErrors.ts は showError() 内で useToast() を遅延取得するパターン
- 本 composable では成功 toast を直接呼ぶため setup レベルで取得して Vue コンポーネントコンテキストを確実に確保
- テストでは vi.mock('@nuxt/ui/composables/useToast') で差し替え済みのため機能的に等価

**信頼性**: 🟡 既存 useToastErrors.ts の遅延パターンとの対比から妥当な推測

---

### 4-3. `ActionResult<T>` / `UseGenerateInvitationReturn` / `Invitation` 型集約 → TODO コメント化 🔴（スコープ外）

**対象**: 
- `app/composables/useGenerateInvitation.ts` — `ActionResult<T>`, `UseGenerateInvitationReturn`
- `app/composables/useListInvitations.ts` — `Invitation` 型

**判断**: 型集約は useCreateGroup / useJoinGroup / useGenerateInvitation の既存テストを巻き込む横断的変更。既存テストを壊すリスクが高いため本 Refactor スコープを超えると判断し、TODO コメントのみ追加した。

**追加した TODO コメント**:
- `ActionResult<T>`: 将来 `app/types/interfaces.ts` または `app/types/action-result.ts` に集約する旨
- `UseGenerateInvitationReturn`: 型集約時に `app/types/interfaces.ts` からインポートする形に変更する旨  
- `Invitation`: 将来 `app/types/interfaces.ts` に集約して `useListInvitations` からインポートする形に変更する旨

**信頼性**: 🔴 設計文書 interfaces.ts の集約方針から推測、本タスクスコープ外

---

## 5. Refactor 後テスト結果

### 全テスト

```
Test Files  17 passed (17)
     Tests  54 passed (54)
```

### pnpm typecheck

```
正常終了（エラーなし）
```

### pnpm lint

```
対象ファイルのエラーなし
残存エラー: docs/design/video-playback/interfaces.ts (既存・本タスク対象外)
```

### pnpm i18n:check

```
OK: ja/en のキー構造一致 + メッセージ書式 (8 top-level keys)
```

---

## 6. 品質判定

```
✅ 高品質:
- テスト結果: 全 54 件成功 (17 ファイル) — Refactor 前後で変化なし
- セキュリティ: 重大な脆弱性なし
- パフォーマンス: 重大な性能課題なし
- リファクタ品質: brace-style 修正 / コメント補強 / TODO コメント化 完了
- コード品質: ESLint (対象ファイル) / typecheck / i18n:check 全通過
- ファイルサイズ: useListInvitations.ts 64 行 / useGenerateInvitation.ts 117 行 (500 行未満)
- モック使用: 実装コードにモック・スタブ含まず
```

---

## 7. 残課題（次フェーズ以降）

1. **型集約**: `ActionResult<T>` / `UseGenerateInvitationReturn` / `Invitation` を `app/types/interfaces.ts` に集約。既存テストを全通過させながら実施（TODO コメントで追跡可能）。
2. **`useToast` 取得ポリシー**: プロジェクト全体で setup レベル vs 遅延取得の統一ポリシーを ADR 等で確定する。

---

## 8. verify-complete フェーズへの注意点

1. 全テスト (54 件) が通過しているため、verify-complete での動作確認は lint ・typecheck ・全テスト一括実行で十分。
2. brace-style 修正はテストファイルのみ（実装ファイルはもともと問題なし）。
3. docs/design/video-playback/interfaces.ts の lint エラーは既存問題で本タスク対象外のため、verify-complete でも除外確認すること。
