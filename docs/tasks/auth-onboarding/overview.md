# auth-onboarding タスク概要

**作成日**: 2026-06-01
**プロジェクト期間**: 2026-06-01 - 2026-06-19（実働 約15日）
**推定工数**: 114時間
**総タスク数**: 20件

## 関連文書

- **要件定義書**: [📋 requirements.md](../../spec/auth-onboarding/requirements.md)
- **設計文書**: [📐 architecture.md](../../design/auth-onboarding/architecture.md)
- **データフロー図**: [🔄 dataflow.md](../../design/auth-onboarding/dataflow.md)
- **インターフェース定義**: [📝 interfaces.ts](../../design/auth-onboarding/interfaces.ts)
- **設計ヒアリング**: [💬 design-interview.md](../../design/auth-onboarding/design-interview.md)
- **エラー実装規約**: [⚠️ error-handling.md](../../design/cross-cutting/error-handling.md)
- **受け入れ基準**: [✅ acceptance-criteria.md](../../spec/auth-onboarding/acceptance-criteria.md)
- **コンテキストノート**: [📝 note.md](../../spec/auth-onboarding/note.md)

> **本単位は新規 DB スキーマも新規 API も作らない**。data-foundation の既存 3 RPC
> (`create_group_with_owner` / `join_group_with_code` / `generate_invitation_code`) +
> PostgREST + Auth を「消費」する UI 層。そのため `database-schema.sql` / `api-endpoints.md` は無し。

## フェーズ構成

| フェーズ | 期間(目安) | 成果物 | タスク数 | 工数 | ファイル |
|---------|------|--------|----------|------|----------|
| Phase 1 | 06-01〜06-03 | 依存追加・nuxt.config・横断基盤(error-codes / i18n / Sentry / Zod / test基盤) | 6 | 23h | [TASK-0001~0006](#phase-1-基盤構築) |
| Phase 2 | 06-04〜06-11 | composable 10本(domain6 + cross-cutting4) + middleware | 7 | 48h | [TASK-0007~0013](#phase-2-ドメインロジック層) |
| Phase 3 | 06-12〜06-18 | layouts 2枚 + pages 6画面 | 6 | 37h | [TASK-0014~0019](#phase-3-ui層) |
| Phase 4 | 06-19 | 結線・受入検証 | 1 | 6h | [TASK-0020](#phase-4-統合受入検証) |

## タスク番号管理

**使用済みタスク番号**: TASK-0001 ~ TASK-0020
**次回開始番号**: TASK-0021
（※ auth-onboarding ディレクトリ内の採番。data-foundation / rule-engine とは別系列）

## 全体進捗

- [x] Phase 1: 基盤構築
- [ ] Phase 2: ドメインロジック層
- [ ] Phase 3: UI層
- [ ] Phase 4: 統合・受入検証

## マイルストーン

- **M1: 基盤完成** (06-03): 依存・設定・横断基盤(error-codes / i18n / Sentry / Zod / test基盤)完了
- **M2: ドメイン層完成** (06-11): composable 10本 + middleware 実装・テスト完了
- **M3: UI完成** (06-18): layouts + 全6画面実装完了
- **M4: リリース準備完了** (06-19): 受入検証・全 mock unit 緑・リダイレクトチェーン確認完了

---

## Phase 1: 基盤構築

**期間**: 06-01〜06-03
**目標**: 依存パッケージ・nuxt.config・横断基盤を整備し、Phase 2 以降の実装土台を作る
**成果物**: @nuxtjs/i18n / @sentry/nuxt 導入、nuxt.config 更新、error-codes.ts、locales(ja/en) + キー一致チェック、Sentry + error.vue、Zod group-name schema、test基盤(tests/ 集約)

### タスク一覧

- [x] [TASK-0001: 依存パッケージ追加と nuxt.config 設定変更](TASK-0001.md) - 4h (DIRECT) 🔵
- [x] [TASK-0002: テスト基盤整備(vitest include + rule-engine 移動)](TASK-0002.md) - 3h (DIRECT) 🔵
- [x] [TASK-0003: エラー識別子定数 error-codes.ts](TASK-0003.md) - 2h (DIRECT) 🔵
- [x] [TASK-0004: i18n ロケール定義 + キー構造一致 CI チェック](TASK-0004.md) - 6h (TDD) 🔵
- [x] [TASK-0005: Sentry 設定 + error.vue グローバルフォールバック](TASK-0005.md) - 4h (DIRECT) 🔵
- [x] [TASK-0006: Zod schema group-name.ts](TASK-0006.md) - 4h (TDD) 🔵

### 依存関係

```
TASK-0001 → TASK-0004
TASK-0001 → TASK-0005
TASK-0002 (独立、全 TDD タスクの前提)
TASK-0003 (独立)
TASK-0006 (独立)
```

---

## Phase 2: ドメインロジック層

**期間**: 06-04〜06-11
**目標**: UI から分離したドメインロジック(composable)と認証 middleware を実装・テストする
**成果物**: cross-cutting composable 4本、domain composable 6本、auth.global.ts middleware

### タスク一覧

- [ ] [TASK-0007: cross-cutting composable 4本](TASK-0007.md) - 8h (TDD) 🔵
- [ ] [TASK-0008: useLogin(Auth)](TASK-0008.md) - 6h (TDD) 🔵
- [ ] [TASK-0009: useCurrentGroup(Read)](TASK-0009.md) - 4h (TDD) 🔵
- [ ] [TASK-0010: useCreateGroup(RPC)](TASK-0010.md) - 6h (TDD) 🔵
- [ ] [TASK-0011: useJoinGroup(RPC)](TASK-0011.md) - 8h (TDD) 🔵
- [ ] [TASK-0012: useGenerateInvitation + useListInvitations](TASK-0012.md) - 8h (TDD) 🔵
- [ ] [TASK-0013: middleware auth.global.ts](TASK-0013.md) - 8h (TDD) 🔵

### 依存関係

```
TASK-0003, TASK-0004, TASK-0005 → TASK-0007
TASK-0007 → TASK-0008, TASK-0009, TASK-0011, TASK-0012
TASK-0006, TASK-0007 → TASK-0010
TASK-0009 → TASK-0013
(全 TDD タスクは TASK-0002 のテスト基盤を前提)
```

---

## Phase 3: UI層

**期間**: 06-12〜06-18
**目標**: 2 レイアウト構成と 6 画面を実装し、Phase 2 の composable を結線する
**成果物**: auth.vue / default.vue、/login・/confirm・/onboarding・/groups/new・/join/[code]・/groups/[id]/settings

### タスク一覧

- [ ] [TASK-0014: layouts(auth.vue + default.vue)](TASK-0014.md) - 6h (DIRECT) 🔵
- [ ] [TASK-0015: /login + /confirm pages](TASK-0015.md) - 8h (TDD) 🔵
- [ ] [TASK-0016: /onboarding(静的)](TASK-0016.md) - 3h (DIRECT) 🔵
- [ ] [TASK-0017: /groups/new](TASK-0017.md) - 6h (TDD) 🔵
- [ ] [TASK-0018: /join/[code]](TASK-0018.md) - 6h (TDD) 🔵
- [ ] [TASK-0019: /groups/[id]/settings](TASK-0019.md) - 8h (TDD) 🔵

### 依存関係

```
TASK-0008 → TASK-0014
TASK-0008, TASK-0009, TASK-0014 → TASK-0015
TASK-0014 → TASK-0016
TASK-0006, TASK-0010, TASK-0014 → TASK-0017
TASK-0011, TASK-0014 → TASK-0018
TASK-0012, TASK-0014 → TASK-0019
```

---

## Phase 4: 統合・受入検証

**期間**: 06-19
**目標**: 全画面結線後の受入検証(リダイレクトチェーン / 保護漏れゼロ / NFR-001 実測ゲート / 全テスト緑)
**成果物**: 受入検証ログ、全 mock unit 緑確認

### タスク一覧

- [ ] [TASK-0020: 結線・受入検証](TASK-0020.md) - 6h (DIRECT) 🔵

### 依存関係

```
TASK-0013, TASK-0015, TASK-0016, TASK-0017, TASK-0018, TASK-0019 → TASK-0020
```

> **E2E (Playwright) は ADR-012 D10 で MVP 保留**。auth-onboarding 完了後に導入を再判断する。
> Google OAuth 実フローテストは行わない (bot 検出リスク、D10/G)。

---

## 信頼性レベルサマリー

### 全タスク統計

- **総タスク数**: 20件
- 🔵 **青信号**: 20件 (100%)
- 🟡 **黄信号**: 0件 (0%) ※タスク総合評価。item レベルでは TASK-0009(embed null 許容)/TASK-0019(メンバー一覧 SELECT)/TASK-0020(NFR-001 実測) に各1件の 🟡 があるが、いずれも「実装時に生成型/クエリで確定」「実測ゲート」であり設計の曖昧さではない
- 🔴 **赤信号**: 0件 (0%)

### フェーズ別信頼性

| フェーズ | 🔵 青 | 🟡 黄 | 🔴 赤 | 合計 |
|---------|-------|-------|-------|------|
| Phase 1 | 6 | 0 | 0 | 6 |
| Phase 2 | 7 | 0 | 0 | 7 |
| Phase 3 | 6 | 0 | 0 | 6 |
| Phase 4 | 1 | 0 | 0 | 1 |

**品質評価**: 高品質 (🔵 100%、🔴 0%)。設計が ADR-006〜012 + error-handling.md で高度に確定済 (architecture.md 🔵 97%) のため、タスクも要件定義・設計文書・ADR に直接の根拠を持つ。

## クリティカルパス

```
TASK-0001 → TASK-0004 → TASK-0007 → TASK-0008 → TASK-0014 → TASK-0019 → TASK-0020
```

**クリティカルパス工数**: 約44時間
**並行作業可能工数**: 約70時間（domain composable 群・各 page は前提さえ揃えば並列実装可能）

## 次のステップ

タスクを実装するには:
- 全タスク順番に実装: `/tsumiki:kairo-implement`
- 特定タスクを実装: `/tsumiki:kairo-implement TASK-0001`
- 範囲を自動進行(推奨): `/tsumiki:kairo-loop` で依存順に自動実装・品質確認
