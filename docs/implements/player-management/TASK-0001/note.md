# TASK-0001 コンテキストノート：型定義 player.ts + Zod player-name.ts

**作成日**: 2026-06-02  
**タスク**: player-management TASK-0001  
**要件名**: player-management  

---

## 1. 技術スタック

### 使用技術
- **フレームワーク**: Nuxt 4 (Vue 3) + Nuxt UI v4 + TypeScript
- **バリデーション**: Zod
- **DB**: Supabase (PostgREST + RLS)
- **国際化**: @nuxtjs/i18n (ja/en)

### 参照元
- `CLAUDE.md` — Nuxt UI 使用ルール、Vue SFC Composition API、TypeScript strict mode
- `docs/spec/player-management/note.md` — 技術スタック定義

### アーキテクチャパターン
- **レイヤード構造**: page → domain composable → PostgREST/RLS
- **型安全性**: 生成型（Supabase）をベースに、アプリケーション側で narrow
- **参照元**: `docs/design/player-management/architecture.md` (ADR-007 準拠)

---

## 2. 開発ルール

### 文書言語
- Project docs (spec / design / tasks / implements) は **日本語**
- CLAUDE.md 自体は英語

### テスト方針
- **対象**: `tests/unit/**/*.test.ts` (Vitest)
- **原則**: 最小境界値 + 分岐網羅のみ。冗長ケースは禁止
- **参照元**: Memory `feedback_test_coverage`

### コーディング規約
- ESLint: 1tbs brace style, no comma dangle
- TypeScript: strict mode
- Vue SFC: `<script setup lang="ts">` Composition API のみ

### 参照元
- `CLAUDE.md` — Coding Conventions
- `vitest.config.ts` — テスト設定（unit のみ、integration は別）
- `eslint.config.js` (プロジェクト)

---

## 3. 関連実装パターン

### Zod スキーマ参照実装
**ファイル**: `app/schemas/group-name.ts`

```typescript
import { z } from 'zod'

export const groupNameSchema = z
  .string()
  .trim()
  .min(1, { message: 'invalid_group_name' })
  .max(50, { message: 'invalid_group_name' })

export type GroupName = z.infer<typeof groupNameSchema>
```

**特徴**:
- `.trim()` は `.min()` / `.max()` **より前に位置**（trim 後の文字数を計算）
- `message` は locale キー（`invalid_group_name`）で、呼び出し側で `t()` で表示
- `.infer<typeof>` で型推論を自動化

**player-name.ts との同型性**: `invalid_group_name` を `invalid_player_name` に置換するだけ

### 単体テスト参照実装
**ファイル**: `tests/unit/composables/useCreateGroup.test.ts`（最初の 100 行）

**テスト特徴**:
- Vitest の `vi.hoisted()` + `vi.mock('#imports')` でモック依存性を隠蔽
- `beforeEach` で `vi.clearAllMocks()` と state 初期化
- RPC / composable / state を一貫して mock

**player-name.test.ts 適用パターン**:
- Zod schema テストは RPC / composable 不要（純粋な入力検証）
- `safeParse()` の成否判定 + エラーメッセージ検証が中核
- 参照: `docs/tasks/player-management/TASK-0001.md` §単体テスト要件 TC1-TC4

### 型参照実装
**ファイル**: `app/types/supabase.ts` (生成済み)

**利用方針**:
- `Database['public']['Tables']['players']['Row']` を取得元の真実とする
- handedness は Row 型では `string` のため、`Handedness = 'right' | 'left' | 'unknown'` union に narrow

**参照元**: `docs/design/player-management/interfaces.ts` §1 ドメイン型

---

## 4. 設計文書

### 型契約
**ファイル**: `docs/design/player-management/interfaces.ts`

**主要な型**:
- `Handedness`: `'right' | 'left' | 'unknown'` union（players.handedness CHECK と 1:1）
- `Player`: 一覧・表示用の部分集合（id / name / handedness）
- `CreatePlayerInput`: 追加入力（name / handedness?、group_id は composable が付与）
- `UpdatePlayerInput`: 編集入力（name / handedness 両方必須）
- `AsyncState<T>`: useAsyncData 戻り型（auth-onboarding 継承パターン）
- `ActionResult<T>`: Supabase native の `{ data, error }`

**信頼性**: 🔵 (requirements.md 🔵100% + ADR-007 + 確定スキーマ)

### 要件仕様
**ファイル**: `docs/spec/player-management/requirements.md`

**TASK-0001 関連要件**:
- REQ-101: name 検証（trim 後 1〜50字、DB CHECK と同期）
- EDGE-001: 前後空白のみ → trim 後 0字 → min(1) で拒否
- EDGE-002: trim 後ちょうど 50字 OK / 51字 NG（境界）
- NFR-202: handedness は3択、DEFAULT 'unknown'

### アーキテクチャ
**ファイル**: `docs/design/player-management/architecture.md`

**関連セクション**:
- §コンポーネント構成 → domain composable: usePlayers / useCreatePlayer / useUpdatePlayer / useDeletePlayer
- §ディレクトリ構造 → app/types/player.ts / app/schemas/player-name.ts の配置
- §バリデーション → Zod group-name.ts との同型性

### タスク定義
**ファイル**: `docs/tasks/player-management/TASK-0001.md`

**セクション**:
- 実装詳細: ドメイン型 / Zod スキーマ実装コード例
- 単体テスト要件: TC1-TC4（trim 後 1字 / 空白のみ / 50字 / 51字）
- 統合テスト要件: `pnpm typecheck` による型契約整合確認
- 注意事項: Database 生成型を真とする、message は locale キー

---

## 5. テスト関連情報

### テストフレームワーク設定

**ファイル**: `vitest.config.ts`

**重要な設定**:
- テスト対象: `tests/unit/**/*.test.ts` （integration は `.integration.test.ts` で除外）
- alias 安定化: #nuxt-router / #supabase-client / #supabase-user / #async-data
- passWithNoTests: true（テストがなくても pass）

**テストファイル命名**: `{feature}.test.ts`（unit）/ `{feature}.integration.test.ts`（integration）

### 既存テストディレクトリ構造
```
tests/unit/
├── composables/
│   ├── useCreateGroup.test.ts
│   ├── useErrorMessage.test.ts
│   ├── useFormErrors.test.ts
│   └── useVideoPlayer.test.ts
├── middleware/
│   └── auth.test.ts
└── schemas/
    (schemas テストディレクトリ = 未作成、TASK-0001 で新規作成)
```

### テストユーティリティ・モック設定

**参照実装**: `tests/unit/composables/useCreateGroup.test.ts`

**Mock 戦略** (ADR-012 D4):
1. `vi.hoisted()` ブロック: TDZ 回避のため mock 変数を先に定義
2. `vi.mock('#imports')` + `importOriginal<typeof import('vue')>()`: vue 実物取得 + import 差し替え
3. `vi.mock('#supabase-client')`: vitest alias 経由の安定 mock（Nuxt Vite transform 対策）
4. `vi.mock('~/composables/...')`: composable ファイル直接 mock

**state リセット**: `beforeEach` で `vi.clearAllMocks()` + state 初期化

### 既存テスト命名パターン
- describe: `'useCreateGroup'` （composable 名）
- it: `'TC1: ...'` または `'... (要件ID)'` 形式
- テスト実装は `vi.mock` → `import 対象` → `describe/it` の順序

---

## 6. 注意事項

### 実装時の留意点

1. **生成型を真とする**
   - `Player.id` / `Player.name` は `Database['public']['Tables']['players']['Row']` を参照
   - ハードコード型（`string` など）は避ける
   - `handedness` のみ union に narrow（`'right' | 'left' | 'unknown'`）

2. **Zod スキーマの `.trim()` 位置**
   - `.trim()` は `.min()` / `.max()` **より前に位置**（trim 後の文字数判定）
   - `z.string().trim().min(1).max(50)` の順序を厳守

3. **message は locale キー**
   - `{ message: 'invalid_player_name' }` は文言そのものではなくキー
   - 実装時に `locales/ja.json` / `en.json` へのキー追加は **Phase 2 フォームタスク（TASK-0006）で実施**
   - TASK-0001 では型・スキーマ定義のみで、キーは存在しなくても OK

4. **group-name.ts との同型性**
   - `group-name.ts` をコピーして `invalid_group_name` → `invalid_player_name` に置換するだけ
   - コピペ時のキー置換漏れに注意

5. **テストの最小性**
   - 型テストは `pnpm typecheck` で静的保証（ランタイムテスト不要）
   - `playerNameSchema` のテストは境界値のみ（TC1-TC4）
   - 冗長ケース（e.g., 複数スペースの trim、日本語文字）は禁止

### 後続タスクへの影響

- **TASK-0002 / TASK-0003 / TASK-0004 / TASK-0005**: 本タスクで定義した `Player` / `Handedness` / スキーマを import して使用
- **TASK-0006** (Phase 2 UI): `playerNameSchema` を import して form field 検証に使用、locales キー追加

### 参照ファイル一覧

| 分類 | ファイルパス | 役割 |
|---|---|---|
| **設計** | docs/design/player-management/interfaces.ts | 型契約（参照用） |
| **設計** | docs/design/player-management/architecture.md | アーキテクチャ |
| **要件** | docs/spec/player-management/requirements.md | 機能要件（REQ-101 / EDGE-001/002） |
| **タスク** | docs/tasks/player-management/TASK-0001.md | タスク詳細・実装例・テストケース |
| **実装例** | app/schemas/group-name.ts | Zod スキーマ同型例 |
| **テスト例** | tests/unit/composables/useCreateGroup.test.ts | mock 戦略例 |
| **テスト設定** | vitest.config.ts | テストフレームワーク設定 |
| **プロジェクト** | CLAUDE.md | コーディング規約 |
| **型生成元** | app/types/supabase.ts | Database 生成型 |
