# TASK-0001 Refactor フェーズ記録: playerNameSchema + ドメイン型実装

**機能名**: player-types-schema  
**タスクID**: TASK-0001  
**要件名**: player-management  
**実施日**: 2026-06-02  
**フェーズ**: Refactor（品質改善）

---

## 1. リファクタリング方針

Green フェーズで実装した `player-name.ts` / `player.ts` はシンプルかつ設計文書と整合済みのため、過度な変更は行わない。以下の観点のみを点検し、必要最小限の改善に留める:

1. `group-name.ts` との同型性（コメント構造・表現の統一）
2. コメントの情報密度・可読性
3. 命名・表現の整合

---

## 2. セキュリティレビュー

| 観点 | 結果 |
|------|------|
| 脆弱性 | なし（型定義 + Zod スキーマのみ。実行時 I/O なし） |
| 入力検証 | Zod の `.trim().min(1).max(50)` が第一防衛、DB CHECK が最終防衛として二重保護 |
| XSS/SQLi | 非該当（UI レンダリングなし、DB クエリなし） |
| 認証・認可 | 非該当（型・スキーマ定義のみ） |

**判定**: 🔵 懸念なし

---

## 3. パフォーマンスレビュー

| 観点 | 結果 |
|------|------|
| スキーマ構築コスト | モジュールロード時1回のみ。実行時オーバーヘッドは無視できる |
| 型定義 | コンパイル時のみ。実行時コストなし |
| `.safeParse()` の計算量 | O(n)（文字列長 n）。50字上限なので事実上定数 |

**判定**: 🔵 懸念なし

---

## 4. 改善計画と実施内容

### 4-1. `app/schemas/player-name.ts` — コメント整形（🔵 実施）

**改善前:**
```typescript
// 選手名: trim 後 1〜50 文字 (REQ-101)。空白のみは trim 後 0 文字となり min(1) で弾かれる (EDGE-001)。
// message は locale キー (invalid_player_name) と整合させる (REQ-404、表示は呼び出し側で t())。
// UI inline (Phase 2) と Write composable で共有。DB players_name_length_check はすり抜け時の最終防衛。
```

**改善後:**
```typescript
// 選手名: trim 後 1〜50 文字 (REQ-101)。空白のみは trim 後 0 文字となり min(1) で弾かれる (EDGE-001)。
// message は locale キーと整合させる (REQ-404、表示は呼び出し側で t())。UI inline (Phase 2) と
// Write composable (TASK-0002/0003) で共有。DB players_name_length_check はすり抜け時の最終防衛で二重に機能する。
```

**改善理由** 🔵 (group-name.ts 同型性に基づく):
- `group-name.ts` と同様に「二重に機能する」という表現で DB 二重防衛の意味を明示
- `(invalid_player_name)` というキー名をコメント内から省略し、コードを直接参照させる（DRY）
- Write composable の参照タスクID（TASK-0002/0003）を追記してトレーサビリティを強化

### 4-2. `app/types/player.ts` — 変更なし（🔵 現状維持）

設計文書（interfaces.ts §1）との整合が完全。コメントの品質も適切。変更不要。

### 4-3. `tests/unit/schemas/player-name.test.ts` — 変更なし（🔵 現状維持）

境界値 + 分岐網羅のみの最小テスト（feedback_test_coverage 準拠）。コメントも詳細。変更不要。

---

## 5. 最終コード全文

### `app/schemas/player-name.ts`

```typescript
import { z } from 'zod'

// 選手名: trim 後 1〜50 文字 (REQ-101)。空白のみは trim 後 0 文字となり min(1) で弾かれる (EDGE-001)。
// message は locale キーと整合させる (REQ-404、表示は呼び出し側で t())。UI inline (Phase 2) と
// Write composable (TASK-0002/0003) で共有。DB players_name_length_check はすり抜け時の最終防衛で二重に機能する。
export const playerNameSchema = z
  .string()
  .trim()
  .min(1, { message: 'invalid_player_name' })
  .max(50, { message: 'invalid_player_name' })

export type PlayerName = z.infer<typeof playerNameSchema>
```

### `app/types/player.ts`（変更なし）

```typescript
import type { Database } from '~/types/supabase'

/** 利き手。players.handedness CHECK と 1:1。
 *  🔵 players.handedness CHECK (handedness IN ('right','left','unknown'))
 *  生成型では text (string) のため、ドメイン側でこの union に narrow する。 */
export type Handedness = 'right' | 'left' | 'unknown'

/** 一覧・表示が使う players の部分集合。
 *  🔵 interfaces.ts §1 Player。クエリ:
 *  from('players').select('id, name, handedness').eq('group_id', gid)
 *    .is('deleted_at', null).order('name') */
export interface Player {
  id: Database['public']['Tables']['players']['Row']['id']
  name: Database['public']['Tables']['players']['Row']['name']
  handedness: Handedness
}

/** 追加入力。group_id は composable が useCurrentGroup から付与するため含めない。
 *  🔵 REQ-002 / REQ-102。handedness 省略時は 'unknown' (DB DEFAULT)。 */
export interface CreatePlayerInput {
  name: string
  handedness?: Handedness
}

/** 編集入力。🔵 REQ-003。 */
export interface UpdatePlayerInput {
  name: string
  handedness: Handedness
}
```

---

## 6. テスト実行結果

```
pnpm vitest run tests/unit/schemas/player-name.test.ts

 Test Files  1 passed (1)
      Tests  4 passed (4)
   Duration  197ms
```

| TC | 入力 | 期待結果 | 結果 |
|----|------|---------|------|
| TC1 | `'a'` | success=true, data='a' | PASS |
| TC2 | `'   '` | success=false, message='invalid_player_name' | PASS |
| TC3 | `'a'.repeat(50)` | success=true | PASS |
| TC4 | `'a'.repeat(51)` | success=false, message='invalid_player_name' | PASS |

---

## 7. typecheck / lint 結果

- `pnpm typecheck`: エラーなし
- `pnpm lint app/schemas/player-name.ts app/types/player.ts tests/unit/schemas/player-name.test.ts`: エラーなし

---

## 8. 品質判定

```
✅ 高品質:
- テスト結果: 4/4 継続成功
- セキュリティ: 重大な脆弱性なし
- パフォーマンス: 重大な性能課題なし
- リファクタ品質: group-name.ts との同型性を維持・強化
- コード品質: ESLint / typecheck クリア
- ドキュメント: 完成
```

### 信頼性サマリー

| 改善項目 | 信頼性 | 根拠 |
|----------|--------|------|
| コメント整形 | 🔵 | group-name.ts 同型性に基づく直接対応 |
| セキュリティレビュー | 🔵 | 型・スキーマのみで実行時 I/O なし |
| パフォーマンスレビュー | 🔵 | 定量的に計算量を評価 |

---

## 次のステップ

次のお勧めステップ: `/tsumiki:tdd-verify-complete` で完全性検証を実行します。
