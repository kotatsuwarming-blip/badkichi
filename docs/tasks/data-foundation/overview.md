# data-foundation タスク概要

**作成日**: 2026-05-13
**プロジェクト期間目安**: 2026-07-01 〜 2026-08-31 (副業 10-15h/週で 5-8 週)
**推定工数**: 58-89h (中央 ≒ 73h)
**総タスク数**: 17 件
**フェーズ数**: 4

## 関連文書

- **要件定義書**: [📋 requirements.md](../../spec/data-foundation/requirements.md)
- **設計文書**: [📐 architecture.md](../../design/data-foundation/architecture.md)
- **API 仕様**: [🔌 api-endpoints.md](../../design/data-foundation/api-endpoints.md)
- **データベース設計**: [🗄️ database-schema.sql](../../design/data-foundation/database-schema.sql)
- **インターフェース定義**: [📝 interfaces.ts](../../design/data-foundation/interfaces.ts)
- **データフロー図**: [🔄 dataflow.md](../../design/data-foundation/dataflow.md)
- **コンテキストノート**: [📝 note.md](../../spec/data-foundation/note.md)
- **準備タスク**: [🔧 prep.md](../../spec/data-foundation/prep.md)
- **ADR**:
  - [ADR-002: 要件の分割方針](../../decisions/002-requirements-splitting.md)
  - [ADR-003: ハーネス整備アプローチ](../../decisions/003-harness-engineering-approach.md)
  - [ADR-004: auth-onboarding 単位の追加](../../decisions/004-add-auth-onboarding-unit.md)
  - [ADR-005: エラーハンドリング戦略](../../decisions/005-error-handling-strategy.md)

## フェーズ構成

| フェーズ | 期間目安 | 成果物 | タスク数 | 工数 | リンク |
|---------|---------|--------|:---:|:---:|--------|
| Phase 1 | 1 週 | Supabase プロジェクト + Nuxt 接続基盤 | 4 件 | 9-14h | [TASK-0001〜0004](#phase-1-環境基盤構築) |
| Phase 2 | 2 週 | スキーマ + RLS + RPC + 型生成 (dev 適用済) | 5 件 | 19-28h | [TASK-0005〜0009](#phase-2-スキーマ認証rpc-実装) |
| Phase 3 | 1 週 | seed / db:reset / CI 改変検出 / prd 自動デプロイ | 3 件 | 10-14h | [TASK-0010〜0012](#phase-3-開発ci-運用整備) |
| Phase 4 | 2-3 週 | 統合テスト + /confirm スタブ + prd 適用 + NFR-001 実測 | 5 件 | 20-29h | [TASK-0013〜0017](#phase-4-統合テスト検証) |

## タスク番号管理

- **使用済みタスク番号**: TASK-0001 〜 TASK-0017 (data-foundation 専用)
- **次回開始番号**: TASK-0018 (data-foundation 内で追加が必要になった場合)
- **他単位との分離**: rule-engine は `docs/tasks/rule-engine/` に独立 (TASK 番号は単位毎に独立)

## 全体進捗

- [x] Phase 1: 環境基盤構築 ✅ 完了 (2026-05-19)
- [x] Phase 2: スキーマ・認証・RPC 実装 ✅ 完了 (2026-05-19)
- [x] Phase 3: 開発・CI 運用整備 ✅ 完了 (2026-05-20)
- [ ] Phase 4: 統合テスト・検証

## マイルストーン

- **M1: 環境基盤完成** (Phase 1 終了時): Supabase dev/prd プロジェクト + Nuxt 接続設定 + CLI リンク
- **M2: スキーマ完成** (Phase 2 終了時): 11 テーブル + RLS + 3 RPC が dev DB に適用済 + 型生成パイプライン動作
- **M3: 運用基盤完成** (Phase 3 終了時): seed/reset + マイグレーション改変検出 + prd 自動適用 GitHub Actions
- **M4: data-foundation 単位完了** (Phase 4 終了時): 統合テスト pass + Google ログインスモークテスト pass + prd 初回適用 + NFR-001 実測

---

## Phase 1: 環境基盤構築

**期間**: 約 1 週
**目標**: Supabase Cloud 上に dev/prd プロジェクトを構築し、Nuxt から接続可能な状態にする
**成果物**: Supabase プロジェクト 2 つ、`nuxt.config.ts` modules 設定、`.env.*` テンプレート、`supabase/config.toml`

### タスク一覧

- [x] [TASK-0001: Supabase プロジェクト作成 + Google OAuth 有効化](TASK-0001.md) ✅ 完了 (2026-05-18, user manual) — 2-4h (DIRECT) 🔵
- [x] [TASK-0002: Nuxt 依存パッケージ追加 + nuxt.config 設定](TASK-0002.md) ✅ 完了 (2026-05-17, commit edac2d0) — 2-3h (DIRECT) 🔵
- [x] [TASK-0003: 環境変数管理 (.env.* + runtimeConfig)](TASK-0003.md) ✅ 完了 (2026-05-19, commits 94405e7 + 22c75c2) — 2-3h (DIRECT) 🔵
- [x] [TASK-0004: Supabase CLI 初期化 + プロジェクトリンク](TASK-0004.md) ✅ 完了 (2026-05-19, commit 68b04d2) — 3-4h (DIRECT) 🔵

### 依存関係

```
TASK-0001 ──┐
            ├─→ TASK-0004
TASK-0002 ──┴─→ TASK-0003 ──┘
```

TASK-0001 と TASK-0002 は並行可能。

---

## Phase 2: スキーマ・認証・RPC 実装

**期間**: 約 2 週
**目標**: 全 11 テーブル + RLS + 3 RPC を dev DB に適用し、TypeScript 型生成パイプラインを完成させる
**成果物**: `supabase/migrations/*.sql`、`types/supabase.ts`、`package.json` の `db:push` / `db:types` scripts

### タスク一覧

- [x] [TASK-0005: 初回マイグレーション — 全 11 テーブル DDL](TASK-0005.md) ✅ 完了 (2026-05-19) — 6-8h (DIRECT) 🔵
- [x] [TASK-0006: RLS ヘルパー関数 + 全テーブル RLS ポリシー](TASK-0006.md) ✅ 完了 (2026-05-19) — 4-6h (DIRECT) 🔵
- [x] [TASK-0007: RPC 関数定義 (3 RPC)](TASK-0007.md) ✅ 完了 (2026-05-19) — 4-6h (DIRECT) 🔵
- [x] [TASK-0008: 型自動生成パイプライン + npm scripts](TASK-0008.md) ✅ 完了 (2026-05-19) — 3-4h (DIRECT) 🔵
- [x] [TASK-0009: dev マイグレーション初回適用 + 動作確認](TASK-0009.md) ✅ 完了 (2026-05-19) — 2-4h (DIRECT) 🔵

### 依存関係

```
TASK-0004 → TASK-0005 → TASK-0006 → TASK-0007 → TASK-0008 → TASK-0009
```

直列実行。マイグレーション SQL は **B1 確定により 1 ファイル統合** (`{timestamp}_initial_schema.sql`)。TASK-0006 / TASK-0007 は TASK-0005 と同じファイルに追記する形で実装。

---

## Phase 3: 開発・CI 運用整備

**期間**: 約 1 週
**目標**: seed/reset 運用、マイグレーション改変ガード、prd 自動デプロイの仕組みを整備
**成果物**: `supabase/seed.sql` (枠)、`scripts/db-reset-guard.sh`、`scripts/check-migration-integrity.sh`、`.husky/`、`.github/workflows/ci.yml`、`.github/workflows/migrate-prd.yml`

### タスク一覧

- [x] [TASK-0010: seed.sql + db:reset スクリプト + prd 誤操作ガード](TASK-0010.md) ✅ 完了 (2026-05-19) — 3-4h (DIRECT) 🔵
- [x] [TASK-0011: マイグレーション改変検出 (pre-commit + GitHub Actions)](TASK-0011.md) ✅ 完了 (2026-05-20) — 4-6h (DIRECT) 🔵
- [x] [TASK-0012: prd 自動マイグレーション GitHub Actions](TASK-0012.md) ✅ 完了 (2026-05-20) — 3-4h (DIRECT) 🔵

### 依存関係

```
TASK-0009 ──┬─→ TASK-0010
            └─→ TASK-0011 → TASK-0012
```

TASK-0010 と TASK-0011 は並行可能。TASK-0012 は TASK-0011 完了後。

---

## Phase 4: 統合テスト・検証

**期間**: 約 2-3 週
**目標**: RLS / RPC 統合テストを CI で自動化し、Google ログインスモークテスト + prd 初回適用 + NFR-001 実測を完了させる
**成果物**: `tests/setup/create-test-users.ts`、`tests/integration/rls.test.ts`、`tests/integration/rpc.test.ts`、`app/pages/confirm.vue`、prd 環境のスキーマ適用済 DB

### タスク一覧

- [x] [TASK-0013: テストユーザ作成セットアップスクリプト](TASK-0013.md) ✅ 完了 (2026-05-23) — 4-6h (TDD) 🔵
- [ ] [TASK-0014: RLS 統合テスト](TASK-0014.md) — 6-8h (TDD) 🔵
- [ ] [TASK-0015: RPC 統合テスト](TASK-0015.md) — 6-8h (TDD) 🔵
- [ ] [TASK-0016: /confirm.vue 最小スタブ + スモークテスト](TASK-0016.md) — 2-3h (DIRECT) 🔵
- [ ] [TASK-0017: prd 初回マイグレーション適用 + NFR-001 実測](TASK-0017.md) — 2-4h (DIRECT) 🔵

### 依存関係

```
TASK-0009 ──┬─→ TASK-0013 ──┬─→ TASK-0014 ──┐
            │               └─→ TASK-0015 ──┤
            └─→ TASK-0016 ──────────────────┤
TASK-0012 ──────────────────────────────────┴─→ TASK-0017
```

TASK-0013 完了後、TASK-0014 と TASK-0015 は並行可能。TASK-0016 は TASK-0009 完了後すぐ着手可。

---

## 信頼性レベルサマリー

### 全タスク統計

| 指標 | 値 |
|------|---:|
| 総タスク数 | 17 件 |
| 総項目数 (信頼性レベル付き) | 約 511 項目 |
| 🔵 青信号 | 約 423 項目 (82.8%) |
| 🟡 黄信号 | 約 88 項目 (17.2%) |
| 🔴 赤信号 | 0 項目 (0%) |

### フェーズ別信頼性

| フェーズ | 🔵 青 | 🟡 黄 | 🔴 赤 | 合計 | 🔵 率 |
|---------|------:|------:|------:|------:|------:|
| Phase 1 | 85 | 35 | 0 | 120 | 71% |
| Phase 2 | 108 | 6 | 0 | 114 | 95% |
| Phase 3 | 66 | 21 | 0 | 87 | 76% |
| Phase 4 | 164 | 26 | 0 | 190 | 86% |

**品質評価**: ✅ **高品質**
- 🔴 (推測のみ) 項目はゼロ
- 🔵 (確定資料に裏付け) 比率 82.8% が全フェーズで安定。特に Phase 2 は B1 (マイグレーション統合) / B2 (search_path) 確定で 95% に到達
- 🟡 は主に運用判断点 (Supabase CLI バージョン依存、husky/lefthook 選択、GitHub Environments 利用範囲、Slack 通知の後付け、リトライテスト再現方法詳細化等) に集中

### 直近の方針確定 (2026-05-13)

B 群 4 項目の確定方針を反映:

- **B1: マイグレーション 1 ファイル統合** — TASK-0005 / TASK-0006 / TASK-0007 を `{timestamp}_initial_schema.sql` 1 ファイルに統合
- **B2: 全 SECURITY DEFINER 関数に `SET search_path = public` 必須 + CI lint 二重防御** — TASK-0006 / TASK-0007 で必須、TASK-0011 で `supabase db lint` を CI に追加
- **B3: テストユーザは `globalSetup` で 1 回作成** — TASK-0013 で確定、`afterEach` で User データのみ cleanup
- **B4: 招待コード衝突リトライ全敗のみテスト** — TASK-0015 で確定、「4 回衝突 → 5 回目成功」は省略

## クリティカルパス

```
TASK-0001 / TASK-0002 (並行)
  → TASK-0003 → TASK-0004 → TASK-0005 → TASK-0006 → TASK-0007 → TASK-0008
  → TASK-0009 → TASK-0011 → TASK-0012 → TASK-0017
```

- **クリティカルパス工数**: 約 38-55h
- **並行作業可能工数**: 約 20-34h (P1 内、P4 内の並行枝)

## 次のステップ

タスクを実装するには:

- **全タスク順番に実装**: `/tsumiki:kairo-implement`
- **特定タスクを実装**: `/tsumiki:kairo-implement TASK-0001` のように指定
- **kairo-loop で自動進行**: `/tsumiki:kairo-loop TASK-0001..TASK-0009` のように範囲指定 (推奨、`feedback_kairo_loop_workflow` 準拠)

実装中に発生する設計判断・運用判断 (🟡 項目に関わる選択) はその都度ユーザに確認を取る方針。
