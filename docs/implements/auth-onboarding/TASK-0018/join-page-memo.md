# TDD 開発メモ: join-page (buildLoginRedirect)

## 概要

- **機能名**: 招待リンク着地ページ / `buildLoginRedirect` 純粋関数
- **開発開始**: 2026-06-01
- **現在のフェーズ**: ✅ verify-complete 完了 (2026-06-01)

## 🎯 最終結果 (2026-06-01)

- **実装率**: 100% (2/2 テストケース)
- **品質判定**: ✅ 合格（スコープ外問題あり）
- **TODO更新**: ✅ 完了マーク追加

### 最終テスト状況
- スコープ内テスト (tests/unit/utils/redirect.test.ts): 2/2 ✅
- useJoinGroup.test.ts (TC1-TC4): 4/4 ✅
- auth.global middleware (TC1-TC7): 7/7 ✅
- スコープ外失敗: video-playback/youtube-adapter.test.ts の 5件 (タイムアウト、youtube-adapter 未実装モジュール)

### 静的解析
- `pnpm typecheck`: エラーなし ✅
- `pnpm exec eslint` (対象ファイル): エラーなし ✅

## 関連ファイル

- 元タスクファイル: `docs/tasks/auth-onboarding/TASK-0018.md`
- 要件定義: `docs/implements/auth-onboarding/TASK-0018/join-page-requirements.md`
- テストケース定義: `docs/implements/auth-onboarding/TASK-0018/join-page-testcases.md`
- Red フェーズ記録: `docs/implements/auth-onboarding/TASK-0018/join-page-red-phase.md`
- 実装ファイル（予定）: `app/utils/redirect.ts`
- テストファイル: `tests/unit/utils/redirect.test.ts`

---

## Red フェーズ（失敗するテスト作成）

### 作成日時

2026-06-01

### テストケース概要

- **TC-D2-1** (正常系): `/join/ABC12345` → `/login?redirect=%2Fjoin%2FABC12345` （REQ-108 / EDGE-001）
- **TC-D2-2** (境界値): `/join/a b&c` → `/login?redirect=%2Fjoin%2Fa%20b%26c` （EDGE-005 / EDGE-106）

### 期待された失敗

`app/utils/redirect.ts` 未実装のため `Cannot find module '~/utils/redirect'` でモジュール解決エラー → 2 ケースともに red 確認済。

### 次のフェーズへの要求事項

- `app/utils/redirect.ts` 新規作成
- `export function buildLoginRedirect(path: string): string` を実装
- 実装内容: `return '/login?redirect=' + encodeURIComponent(path)`

---

## Green フェーズ（最小実装）

### 実装日時

2026-06-01

### 実装方針

- `app/utils/redirect.ts` 新規作成: `buildLoginRedirect(path: string): string` を `return '/login?redirect=' + encodeURIComponent(path)` で実装
- `app/pages/join/[code].vue` 新規作成: `onMounted` で認証判定 → 未ログイン時 `navigateTo(buildLoginRedirect(route.fullPath))`、ログイン済時 `useJoinGroup().join(code)` を実行
- `i18n/locales/ja.json` / `en.json`: `join.description` キーを追加

### 型エラー修正

`route.params.code` の型が `string | string[] | undefined` のため、配列ガード + `??` フォールバックで `string` に正規化（空文字列フォールバック時は DB が `invitation_not_found` を返す）

### テスト結果

```
Test Files  23 passed (23)
    Tests  86 passed (86)
```

- TC-D2-1 / TC-D2-2 両方 ✅
- 既存 84 ケース全て継続 ✅
- typecheck: エラーなし ✅
- eslint --fix: エラーなし ✅

### 課題・改善点

- `onMounted` → `watch` ベースへの変更検討（リアクティブ性向上）
- `route.params.code` 正規化ロジックの共通ユーティリティ化検討
- `redirect.ts` と `query.ts` の統合検討

---

## Refactor フェーズ（品質改善）

### 実施日時

2026-06-01

### 採用した改善

#### 1. `onMounted` → `watch(user, ..., { immediate: true, once: true })` パターン (🔵)

**変更ファイル**: `app/pages/join/[code].vue`

- `confirm.vue` と統一したリアクティブパターンへ変更
- ページリロード直後などで `useSupabaseUser()` の値が非同期に確定するケース（Nuxt CSR hydration タイミング）でも正しく動作するよう改善
- `once: true` で join の二重呼び出しを防止（Vue 3.4+ 対応）
- コールバックは `async` 関数として継続利用

### 不採用にした候補とその理由

#### 2. `route.params.code` の配列正規化を共通 util 化 (🟡 → 不採用)

- `resolveQueryParam` は `LocationQueryValue`（null を含む）型を対象とし、`route.params` の型（`string | string[]`、null なし）と異なる
- 使用箇所が 1 か所のみで DRY の実益が薄い
- 過剰抽象化を避けインラインを維持

#### 3. `redirect.ts` と `query.ts` の統合 (🔵 → 不採用)

- 両ファイルとも 40 行未満で責務が明確に分離されている
- `query.ts`: クエリパラメータ値の型正規化
- `redirect.ts`: リダイレクト URL の生成
- 統合することで責務が混在し可読性が下がる

### テスト結果

```
Test Files  23 passed (23) [TASK-0018 関連]
    Tests  86 passed (86)
```

- TC-D2-1 / TC-D2-2 継続 ✅
- 既存 86 ケース全て継続 ✅（video-playback の 6 ケース失敗は別タスク TASK-0018 外）
- typecheck: エラーなし ✅
- eslint --fix: エラーなし ✅

### 品質評価

- セキュリティ: 重大な脆弱性なし（認証判定・URL エンコードは適切）
- パフォーマンス: 重大な課題なし（O(1) 処理のみ）
- コード品質: confirm.vue との一貫性が向上、リアクティブ性の堅牢性向上
