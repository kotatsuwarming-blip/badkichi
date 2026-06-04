# TASK-0001 Green フェーズ記録: playerNameSchema + ドメイン型実装

**機能名**: player-types-schema  
**タスクID**: TASK-0001  
**要件名**: player-management  
**実施日**: 2026-06-02  
**フェーズ**: Green（最小実装）

---

## 1. 実装方針

- Red フェーズで確認した失敗原因（`app/schemas/player-name.ts` が未実装）を解消
- `group-name.ts` と完全同型パターンで `player-name.ts` を実装（`invalid_group_name` → `invalid_player_name`）
- `app/types/player.ts` は `docs/tasks/player-management/TASK-0001.md` 実装詳細セクションのコードを厳密に実装
- 信頼性: 全項目 🔵（TASK-0001.md 確定コード・interfaces.ts §1 準拠）

---

## 2. 実装コード全文

### `app/schemas/player-name.ts`

```typescript
import { z } from 'zod'

// 選手名: trim 後 1〜50 文字 (REQ-101)。空白のみは trim 後 0 文字となり min(1) で弾かれる (EDGE-001)。
// message は locale キー (invalid_player_name) と整合させる (REQ-404、表示は呼び出し側で t())。
// UI inline (Phase 2) と Write composable で共有。DB players_name_length_check はすり抜け時の最終防衛。
export const playerNameSchema = z
  .string()
  .trim()
  .min(1, { message: 'invalid_player_name' })
  .max(50, { message: 'invalid_player_name' })

export type PlayerName = z.infer<typeof playerNameSchema>
```

### `app/types/player.ts`

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

## 3. テスト実行結果

```
pnpm vitest run tests/unit/schemas/player-name.test.ts

 Test Files  1 passed (1)
      Tests  4 passed (4)
   Start at  13:32:43
   Duration  198ms
```

| TC | 入力 | 期待結果 | 結果 |
|----|------|---------|------|
| TC1 | `'a'` | success=true, data='a' | PASS |
| TC2 | `'   '` | success=false, message='invalid_player_name' | PASS |
| TC3 | `'a'.repeat(50)` | success=true | PASS |
| TC4 | `'a'.repeat(51)` | success=false, message='invalid_player_name' | PASS |

---

## 4. typecheck / lint 結果

- `pnpm typecheck`: エラーなし（終了）
- `pnpm lint app/types/player.ts app/schemas/player-name.ts`: エラーなし

---

## 5. 課題・改善点（Refactor フェーズで対応）

- 現実装はシンプルで改善点なし
- `player-name.ts` は `group-name.ts` と完全同型のため、Refactor フェーズでコメントの追記・整理を行う程度
- `player.ts` の型コメントは設計文書（interfaces.ts §1）と整合済みのため変更不要
