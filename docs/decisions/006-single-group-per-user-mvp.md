# ADR-006: 1 ユーザー = 1 Group 制約 (MVP)

## ステータス
Accepted (2026-05-24)

## 背景

PRD §1「マルチテナント設計」では「1ユーザーは複数のグループに所属可能」と明記し、
data-foundation はその前提で `group_members` を中間テーブルとして設計・実装した
(TASK-0005 migration、TASK-0007 RPC、Phase 1-3 完了 2026-05-23)。

`auth-onboarding` の kairo-requirements (2026-05-24) で、複数 Group 所属時の
**active Group の保持方式** (URL parameter / Cookie / Pinia+localStorage) を議論した。
この論点は note.md (`docs/spec/auth-onboarding/note.md`) §未確定論点 #5 として残されており、
**全画面のルーティングと API 呼び出しに影響、後続 UI 単位 (player-management 以降) にも波及する
重要決定**として扱われていた。

議論の中で開発者から「MVP では 1 ユーザー = 1 Group に倒したい」との方針転換の提案があった。
PRD §1 の「複数所属可能」は理論上の柔軟性だが、MVP のユースケース (バドミントンクラブ単位の利用) では
1 ユーザーが同時に複数クラブに所属するシーンは稀であり、複数 Group 対応のために発生する設計判断
(Group 切替 UI の場所 / active Group の保持方式 / URL に group_id を含む構造) を MVP では
回避できる利益が大きい。

ADR として方針転換の経緯を明文化し、PRD §1 の該当記述を本 ADR で上書きする。

## 決定

MVP では **1 ユーザーは 1 Group のみ所属可能** とする。

### 強制方式: DB 制約 + RPC ガードの二重

#### DB 制約 (構造的保証)

```sql
ALTER TABLE group_members
  ADD CONSTRAINT group_members_user_id_unique
  UNIQUE (user_id);
```

`group_members` に `UNIQUE (user_id)` 制約を追加し、いかなる経路でも (RPC 経由 / 直接 INSERT 試行 /
並行操作) 同一ユーザの二重所属を構造的に防止する。

#### RPC ガード (早期失敗)

`join_group_with_code` RPC の冒頭に既所属チェックを追加し、UNIQUE 違反 (`23505`) で
気付くのではなく、識別可能な例外で早期に失敗させる。

```sql
IF EXISTS (
  SELECT 1 FROM group_members WHERE user_id = auth.uid()
) THEN
  RAISE EXCEPTION 'already_in_group';
END IF;
```

### App 側識別子の追加

`app/types/error-codes.ts` の `APP_ERROR_CODES` に追加:

```ts
ALREADY_IN_GROUP: 'already_in_group',
```

`locales/ja.json` の `errors.already_in_group` に文言追加 (ADR-005 §D2-D3 規約準拠)。
ADR-005 §D3「App 識別子は 1:1 マッピング」に従い、context は使わない。

## 理由

1. **MVP スコープ削減**: Group 切替 UI / active Group 保持機構 (URL parameter / Cookie / Pinia 等) /
   URL に group_id を含む構造の設計判断を全て後回しできる。note.md §未確定論点 #4 #5 が消滅する
2. **設計シンプル化**: 認証 middleware は「未ログイン → /login」「ログイン済+Group未所属 → /onboarding」
   「ログイン済+Group所属 → 通常画面」の 3 分岐で完結。複数 Group 切替の分岐が不要
3. **データ整合性**: DB 制約で構造的に防止することで、コードバグ・並行操作・将来のリファクタで
   二重所属が生まれるリスクをゼロにする
4. **ユースケース妥当性**: バドミントンクラブ単位の利用想定で、1 ユーザーが同時に複数クラブに
   所属するシーンは MVP では稀。Phase 2 で必要になれば拡張する
5. **拡張容易性**: UNIQUE 制約と RPC ガードを外せば複数 Group 対応に移行可能。
   `group_members` 中間テーブル構造は維持するため、データモデル変更は不要

### データエンジニアのアナロジー

- **DB UNIQUE 制約** = `PRIMARY KEY` / `UNIQUE`: スキーマレベルの構造的保証 (dbt の `unique` test に相当)
- **RPC ガード** = stored procedure 内の事前チェック: ビジネスロジック寄りの早期失敗
  (dbt の singular test 相当)
- **二重ガード** = unit + integration test の重ね打ち: 単独でも機能するが層が増えると堅牢性が増す。
  RPC ガードを通り抜けても DB 制約で確実に止まる

## 影響

### PRD への影響

PRD `.dcs/20260328153038_badminton_analytics/prd.md` §1 「マルチテナント設計」の
「1ユーザーは複数のグループに所属可能」記述は **本 ADR で上書き** する。
PRD 本体は更新せず、本 ADR の存在と参照履歴で運用する (PRD はビジネス要件の凍結文書、
ADR は技術判断履歴という役割分担)。

### data-foundation への影響

実装済の data-foundation (Phase 1-3 + TASK-0013 完了、TASK-0014 進行中) に対して
以下の追加修正が必要:

| TASK | 修正内容 |
|------|---------|
| TASK-0005 (initial schema migration) | 追記 migration ファイルで `group_members` に UNIQUE 制約追加 (既存 migration は変更禁止規約 NFR-302) |
| TASK-0007 (3 RPC) | `join_group_with_code` に `already_in_group` 例外を追加 |
| TASK-0014 (RLS 統合テスト、進行中) | `ALREADY_IN_GROUP` 制約テスト追加 (二重 INSERT 試行が DB UNIQUE で拒否されること、RPC が `already_in_group` で早期失敗すること) |
| (派生) | `pnpm db:push` + `pnpm db:types` で dev DB 反映 + 型再生成 |

### auth-onboarding への影響

| 項目 | 影響 |
|------|------|
| note.md §未確定論点 #4 (Group 切替 UI の場所) | **削除** (機能自体が不要) |
| note.md §未確定論点 #5 (active Group の保持方式) | **削除** (`group_members` から user の唯一の Group を引く `useCurrentGroup()` composable 1 つで済む) |
| requirements.md REQ-401 | **新規追加**: 1 ユーザー = 1 Group 制約の明示 |
| requirements.md REQ-105 | **新規追加**: ALREADY_IN_GROUP エラーの UI 表示 (`<UAlert>`) |
| `app/types/error-codes.ts` | `ALREADY_IN_GROUP` 識別子追加 |
| `locales/ja.json` | `errors.already_in_group` 文言追加 |
| `useErrorMessage` composable | switch 分岐追加 |
| URL 構造 | `/g/[group_id]/...` 配下にする必要なし、`/players` `/matches/[id]` 等クリーンに保てる |

### 後続 UI 単位への影響

`player-management` / `match-management` / `match-recording` / `stats-dashboard` 等は
URL に group_id を含めない。全画面で「ユーザ → group_members の唯一行 → group_id」が
一意に決まる前提で動作する。RLS は data-foundation `is_member_of(group_id)` 設計のままで動作する
(複数所属しないだけで、RLS ヘルパー自体は user の所属 Group 全てを許可する元の挙動を維持)。

### UX への影響

- 既に Group X に所属するユーザが別 Group Y の招待リンクを開くと `ALREADY_IN_GROUP` エラーで拒否される。
  MVP には退会機能 (REQ-404) がないため、Group 移籍は事実上不可能 (Supabase Dashboard で
  手動対応するしかない)
- バドミントンクラブの掛け持ちユーザは MVP では 1 つに絞る必要があり、Phase 2 で複数 Group 対応するまで
  待つことになる。この制約を Group 設定画面とエラーメッセージで明示する

## 採用しなかった選択肢

| 案 | 却下理由 |
|---|---|
| PRD 原案 (複数 Group 所属可) のまま MVP | Group 切替 UI の場所 / active Group 保持方式 (URL parameter / Cookie / Pinia 等) / URL に group_id を含む構造、の設計判断を MVP で確定する必要があり、スコープ膨張。後続 UI 単位 (player-management 以降) すべての URL 構造に波及 |
| App 層のみで制約 (DB UNIQUE なし、RPC `already_in_group` のみ) | コードバグ・並行操作・将来のリファクタで二重所属が生まれるリスクが残る。将来の Group 切替 UI 実装時にもアプリ側にガード必要。**信頼性を 1 層に依存させる設計は不採用** |
| Group 切替 UI なしの multi-group (DB は許容、UI は単一固定) | 一見すると拡張余地大だが、「現在の active Group」概念が必要になり middleware / RLS で「複数所属のうちどれを active として扱うか」を判定する composable が必要。結局 UX 決定を MVP で固める必要が生じる |
| Phase 2 まで complete に複数 Group 対応 (現状の data-foundation 実装そのまま) | 上記 (PRD 原案のまま) と同じ問題が残る。MVP の段階で UX 判断を確定する負担が大きい |

## 関連メモリ

- `project_single_group_per_user` (本 ADR と同期、決定の根拠と適用方法を記録)
- `project_mvp_revised_scope` (Phase 1-3 + TASK-0013 完了済の data-foundation 現状)
- `project_players_vs_auth_users` (`players` は選手マスタ、`group_members` が user × group の中間という命名)

## 参考

- `docs/spec/auth-onboarding/interview-record.md` Q2 / Q2a (合意経緯)
- `docs/spec/auth-onboarding/requirements.md` REQ-401, REQ-105 (要件化)
- `docs/spec/auth-onboarding/prep.md` §1, §2 (本 ADR 起票と data-foundation 修正の必須タスク化)
- `docs/design/data-foundation/api-endpoints.md` §join_group_with_code (修正対象 RPC 仕様)
- `docs/design/data-foundation/architecture.md` §RLS 設計 (`is_member_of(group_id)` ヘルパー、本 ADR でも動作)
- ADR-002 (MVP 単位分割、`data-foundation` で Group/GroupMember 設計): 修正なし
- ADR-004 (`auth-onboarding` 単位追加): 修正なし、本 ADR は auth-onboarding 単位の要件起こしで生まれた判断
- ADR-005 (エラーハンドリング戦略): `ALREADY_IN_GROUP` 識別子は本 ADR で導入、ADR-005 §D2-D3 の規約に従う
