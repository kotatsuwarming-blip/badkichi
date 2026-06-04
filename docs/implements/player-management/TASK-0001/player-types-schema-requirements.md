# TASK-0001 詳細要件定義書: 型定義 player.ts + Zod player-name.ts

**機能名**: player-types-schema（選手ドメイン型 + 選手名バリデーション）
**タスクID**: TASK-0001
**要件名**: player-management
**作成日**: 2026-06-02
**出力ファイル**: `docs/implements/player-management/TASK-0001/player-types-schema-requirements.md`

> 本書は TDD（テスト駆動開発）のための詳細要件定義書である。TASK-0001 は
> player-management ユニットの **型契約と入力バリデーションの基盤**を作るタスクであり、
> ランタイムテスト対象は `playerNameSchema` の境界値のみ（型はコンパイル時保証）。

---

## 1. 機能の概要（EARS要件定義書・設計文書ベース）

- 🔵 **何をする機能か**: player-management ユニットの **型契約と入力バリデーションの基盤**を提供する。具体的には (a) 選手ドメイン型 `app/types/player.ts`（`Handedness` / `Player` / `CreatePlayerInput` / `UpdatePlayerInput`）と (b) 選手名 Zod スキーマ `app/schemas/player-name.ts`（`playerNameSchema`）を定義する。
- 🔵 **どのような問題を解決するか**: 後続の全 composable（TASK-0002〜0005）および page/component（Phase 2）が共有する型契約・入力検証を、`interfaces.ts §1` の契約と DB の `players_name_length_check`（trim 後 1〜50 字）に **1:1 で一致**させることで、レイヤー間の型不整合・検証ロジック重複を防ぐ。
- 🔵 **想定されるユーザー**: 直接のエンドユーザーは持たない（UI なし）。利用者は本ユニットの後続実装タスク（TASK-0002〜0006）であり、これらが本タスクの型・スキーマを import して使用する。
- 🔵 **システム内での位置づけ**: レイヤード構造（page → domain composable → PostgREST/RLS）の **最下層の共有契約**。Phase 1「基盤 + composable 層」の起点であり、前提タスクなし・全 composable の依存元。新規 DB スキーマ・新規 API・新規エラーコードは作らず、data-foundation 生成済みの `~/types/supabase` を参照する。
- **参照したEARS要件**: REQ-002 / REQ-003 / REQ-101 / REQ-102 / EDGE-001 / EDGE-002 / NFR-202
- **参照した設計文書**: `docs/design/player-management/interfaces.ts` §1（ドメイン型）/ §4（バリデーション）、`docs/design/player-management/architecture.md`（composable 構成 / ディレクトリ構造）

---

## 2. 入力・出力の仕様（EARS機能要件・TypeScript型定義ベース）

### 2-1. ドメイン型 `app/types/player.ts` 🔵

| 型 | 内容 | 出典 |
|---|---|---|
| `Handedness` | `'right' \| 'left' \| 'unknown'` の union 型 | 🔵 interfaces.ts §1 / players.handedness CHECK |
| `Player` | `id` / `name` / `handedness` の3フィールドを持つ interface。`id` / `name` は `Database['public']['Tables']['players']['Row']` 由来、`handedness` のみ `Handedness` に narrow | 🔵 interfaces.ts §1 |
| `CreatePlayerInput` | `name: string`（必須）/ `handedness?: Handedness`（任意）。`group_id` は composable が `useCurrentGroup` から付与するため含めない | 🔵 interfaces.ts §1 / REQ-002 |
| `UpdatePlayerInput` | `name: string`（必須）/ `handedness: Handedness`（必須） | 🔵 interfaces.ts §1 / REQ-003 |

- 🔵 **入力**: なし（型定義そのものに実行時入力はない。`import type { Database } from '~/types/supabase'` のみを取り込む）。
- 🔵 **出力**: 4つの型エクスポート（`Handedness` / `Player` / `CreatePlayerInput` / `UpdatePlayerInput`）。すべて `export`。
- 🔵 **入出力の関係性**: `Player.id` / `Player.name` は生成型 Row を真とし、ハードコードした `string` を書かない。`handedness` のみ生成型の `string` を `Handedness` union に narrow する。

### 2-2. Zod スキーマ `app/schemas/player-name.ts` 🔵

```typescript
export const playerNameSchema = z
  .string()
  .trim()
  .min(1, { message: 'invalid_player_name' })
  .max(50, { message: 'invalid_player_name' })
export type PlayerName = z.infer<typeof playerNameSchema>
```

- 🔵 **入力**: `playerNameSchema.safeParse(value: unknown)` に渡す任意値。想定は `string`。
- 🔵 **出力**: Zod の `SafeParseReturnType`。
  - 成功時: `{ success: true, data: string }`（`data` は trim 後の文字列）
  - 失敗時: `{ success: false, error: ZodError }`。`error.issues[0].message === 'invalid_player_name'`
- 🔵 **入出力の関係性**:
  - `.trim()` を `.min()` / `.max()` の **前** に置く（DB CHECK が trim 後の `char_length` を見るため、Zod 側も trim 後の文字数で判定）。
  - `message` は文言そのものではなく **locale キー**（`invalid_player_name`）。表示は呼び出し側で `t()`。
  - `type PlayerName = z.infer<typeof playerNameSchema>`（= `string`）を併せてエクスポート。
- 🔵 **データフロー**: UI inline（Phase 2 のフォーム）と各 Write composable（TASK-0002/0003）が本スキーマを共有して検証。DB の `players_name_length_check` はすり抜け時の最終防衛として二重に機能する。

- **参照したEARS要件**: REQ-101 / REQ-102 / EDGE-001 / EDGE-002 / NFR-202
- **参照した設計文書**: `interfaces.ts` §1 `Player` / `CreatePlayerInput` / `UpdatePlayerInput` / `Handedness`、§4 バリデーション

---

## 3. 制約条件（EARS非機能要件・アーキテクチャ設計ベース）

- 🔵 **パフォーマンス要件**: 本タスク固有の数値目標はなし（型・純粋関数スキーマのみ）。NFR-001（一覧取得のインデックス利用）は後続 composable タスクの範囲。
- 🔵 **セキュリティ要件**: 本タスク固有のセキュリティ要件はなし。NFR-101（RLS による Group 分離）は composable/RLS の範囲。Zod スキーマはあくまでクライアント側の第一次防衛であり、DB CHECK が最終防衛である点を前提とする。
- 🔵 **互換性要件 / 型契約**:
  - `Player.id` / `Player.name` は `Database['public']['Tables']['players']['Row']` を真とする（生成型参照、ハードコード禁止）。
  - `Handedness` は `players.handedness CHECK (handedness IN ('right','left','unknown'))` と 1:1。
  - `playerNameSchema` は DB `players_name_length_check`（trim 後 1〜50 字）と 1:1。
  - `app/schemas/group-name.ts` と **完全同型**（`invalid_group_name` → `invalid_player_name` のキー置換のみ）。
- 🔵 **アーキテクチャ制約**: TypeScript strict mode、ESLint（1tbs brace style, no comma dangle）に準拠。Vue SFC ではないため Composition API 制約は非該当。`pnpm typecheck` / `pnpm lint` が通ること。
- 🔵 **データベース制約**: `players.handedness CHECK IN ('right','left','unknown')`、`players_name_length_check CHECK char_length(trim(name)) BETWEEN 1 AND 50`、`handedness DEFAULT 'unknown'`。新規 DB スキーマ・新規 API・新規エラーコードは作らない。
- 🔵 **国際化制約**: `message` は locale キー（`invalid_player_name`）。`locales/ja.json` / `en.json` へのキー追加は本タスクでは行わず Phase 2 のフォームタスクで実施（本タスクではキー未存在でも OK）。

- **参照したEARS要件**: REQ-101 / NFR-202 / REQ-404
- **参照した設計文書**: `interfaces.ts` §1・§4・§5（エラーコード方針）、`architecture.md`（ディレクトリ構造）、`CLAUDE.md`（Coding Conventions）、data-foundation `initial_schema.sql`（players CHECK 制約）

---

## 4. 想定される使用例（EARS Edgeケース・データフローベース）

### 4-1. 基本的な使用パターン 🔵
- `CreatePlayerInput` を組み立てて `useCreatePlayer().createPlayer(input)` に渡す（TASK-0002）。
- `UpdatePlayerInput` を組み立てて `useUpdatePlayer().updatePlayer(id, input)` に渡す（TASK-0003）。
- 一覧表示で `Player[]` を受け取り `id` / `name` / `handedness` を描画（TASK-0004 / Phase 2）。
- フォーム入力値を `playerNameSchema.safeParse()` で検証（Phase 2 / Write composable）。

### 4-2. `playerNameSchema` 境界値（ランタイムテスト対象） 🔵

| ケース | 入力 | 期待結果 | 出典 |
|---|---|---|---|
| TC1: 下限境界（trim 後 1 字） | `'a'` | `success === true` / `data === 'a'` | 🔵 EDGE-001 / CHECK 下限 |
| TC2: 空白のみ（trim 後 0 字） | `'   '` | `success === false` / `issues[0].message === 'invalid_player_name'` | 🔵 EDGE-001 / min(1) |
| TC3: 上限境界（trim 後 50 字） | `'a'.repeat(50)` | `success === true` | 🔵 EDGE-002 / CHECK 上限 |
| TC4: 上限超過（trim 後 51 字） | `'a'.repeat(51)` | `success === false` / `issues[0].message === 'invalid_player_name'` | 🔵 EDGE-002 / max(50) |

> テスト方針: 最小境界値 + 分岐網羅のみ（冗長ケース禁止）。複数スペースの trim・日本語文字などの追加ケースは作らない（Memory `feedback_test_coverage`）。
> テストファイル: `tests/unit/schemas/player-name.test.ts`（`tests/unit/schemas/` は本タスクで新規作成）。

### 4-3. エッジケース / エラーケース 🔵
- 🔵 **EDGE-001**: `name` が前後空白のみ → `.trim()` 後 0 字 → `min(1)` で拒否（TC2）。
- 🔵 **EDGE-002**: trim 後ちょうど 50 字 → 許可（TC3）/ 51 字 → 拒否（TC4）。
- 🔵 **EDGE-003**: `handedness` 未選択 → `CreatePlayerInput.handedness` 省略可（`?`）。型レベルで `unknown` を既定とする運用は composable 側（DB DEFAULT）。本タスクは型定義で省略可能性のみ保証。
- 🔵 **型契約の整合（コンパイル時保証）**: `Player.id` / `Player.name` が `players` Row 由来であること、`handedness` が `Handedness` union であることは `pnpm typecheck` で静的に保証される。専用統合テストは設けず、後続 composable の単体テストおよび Phase 2 受入検証で実使用を通じて検証する。

- **参照したEARS要件**: EDGE-001 / EDGE-002 / EDGE-003
- **参照した設計文書**: `dataflow.md`（Write フロー）、`interfaces.ts` §4、TASK-0001.md §単体テスト要件 TC1-TC4

---

## 5. EARS要件・設計文書との対応関係

- **参照したユーザストーリー**: player-management ロスター管理（選手の追加・編集・削除の基盤型/検証）
- **参照した機能要件**:
  - REQ-002（新規追加 name 必須・handedness 任意 → `CreatePlayerInput`）
  - REQ-003（編集 name / handedness → `UpdatePlayerInput`）
  - REQ-101（name 空 / trim 後 50 字超は拒否 → `playerNameSchema`）
  - REQ-102（同名許可 → name 非UNIQUE。型/スキーマでは重複制約を設けない）
  - REQ-404（全文言 i18n → message は locale キー）
- **参照した非機能要件**:
  - NFR-202（handedness 3択 / 既定 unknown → `Handedness` union + `?` 任意）
- **参照したEdgeケース**: EDGE-001（空白のみ拒否）/ EDGE-002（50字 OK・51字 NG 境界）/ EDGE-003（handedness 未選択 → unknown 既定）
- **参照した受け入れ基準**:
  - `playerNameSchema` の境界（trim 後 1 字 OK / 0 字 NG / 50 字 OK / 51 字 NG）の単体テストが通る
  - `Player.id` / `name` が Row 由来、`handedness` が `Handedness` に narrow
  - `pnpm typecheck` / `pnpm lint` が通る
- **参照した設計文書**:
  - **アーキテクチャ**: `docs/design/player-management/architecture.md`（composable 構成 / ディレクトリ構造 / バリデーション）
  - **データフロー**: `docs/design/player-management/dataflow.md`（Write フローでのスキーマ共有）
  - **型定義**: `docs/design/player-management/interfaces.ts` §1（`Handedness` / `Player` / `CreatePlayerInput` / `UpdatePlayerInput`）/ §4（`playerNameSchema`）/ §5（エラーコード方針）
  - **データベース**: data-foundation `initial_schema.sql`（`players` テーブル / `handedness` CHECK / `players_name_length_check` / `handedness DEFAULT 'unknown'`）— 本単位は新規作成せず消費のみ
  - **API仕様**: なし（本単位は新規 API を作らず PostgREST + RLS を消費）
  - **実装参照**: `app/schemas/group-name.ts`（同型 Zod 実装）

---

## 6. 品質判定

```
✅ 高品質:
- 要件の曖昧さ: なし（型契約・境界値が interfaces.ts / DB CHECK と 1:1 で確定）
- 入出力定義: 完全（4型 + 1スキーマの入出力・境界値を明記）
- 制約条件: 明確（生成型参照・trim 位置・locale キー・group-name 同型）
- 実装可能性: 確実（group-name.ts 同型コピー + interfaces.ts 落とし込み）
- 信頼性レベル: 🔵 青信号が全項目（100%）
```

### 信頼性サマリー
| カテゴリ | 🔵 青 | 🟡 黄 | 🔴 赤 |
|---|---|---|---|
| 機能概要 | 4 | 0 | 0 |
| 入出力仕様 | 2 | 0 | 0 |
| 制約条件 | 6 | 0 | 0 |
| 使用例 / Edge | 4 | 0 | 0 |
| **合計** | **16** | **0** | **0** |

**総合**: 🔵 100% — 高品質（出典は requirements.md 🔵100% + interfaces.ts + 確定 DB スキーマ + group-name.ts 実装）

---

## 次のステップ

次のお勧めステップ: `/tsumiki:tdd-testcases player-management TASK-0001` でテストケースの洗い出しを行います。
