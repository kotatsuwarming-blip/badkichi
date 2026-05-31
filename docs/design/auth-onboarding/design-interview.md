# auth-onboarding 設計ヒアリング記録 (kairo-design step4)

**作成日**: 2026-05-30
**ヒアリング方式**: step4 既存情報ベースの差分ヒアリング (requirements.md + ADR-005〜010 + error-handling.md + data-foundation 設計を起点)

## ヒアリング目的

requirements.md (REQ-001〜108) と確定済 ADR-005〜010 をもとに、アーキテクチャ設計上で
**ADR で未確定だった構造的論点**を明確化する。本単位の技術決定の大部分は ADR で確定済のため、
ヒアリングは「ADR の隙間」(レイアウト戦略・招待参加 UI) と、設計中に顕在化した
**黄信号 4 件の解消**に絞る。

memory `feedback_claude_lead_with_pros_cons`: 一般決定は Claude 主導で pros/cons 提示、
重要決定 (UX/構造波及) のみユーザ確認。memory `feedback_question_granularity`: 黄信号は 1 つずつレビュー。

---

## 質問と回答

### Q1: レイアウトを何枚に分けるか / ログアウトの所在 🔵

**質問日時**: 2026-05-30
**カテゴリ**: アーキテクチャ (ADR 未確定論点)
**背景**: 本単位で初の `app/layouts/` を導入。認証前 (`/login` `/confirm`) と認証後で外枠が
根本的に異なる。1 枚に `v-if="user"` で兼用するか、2 枚に分けるか。REQ-008 (ログアウト) の置き場も未定。

**提示した選択肢 (pros/cons)**:
- A. 2 レイアウト構成 (`auth.vue` + `default.vue`、ログアウトは default ヘッダー、推奨)
- B. 1 レイアウト兼用 (`v-if="user"` で出し分け)
- C. レイアウト無し (各 page でヘッダー直書き)

**回答**: **A. 2 レイアウト構成**。認証後は `default.vue` を無指定適用、ログアウトはヘッダー 1 箇所。

**信頼性への影響**:
- レイアウト戦略が 🔵 で確定 → **ADR-011 (layout-strategy) として起票・Accepted (2026-05-30)**
- ADR-008「middleware global 一本で保護漏れゼロ」と同じ事故防止思想を「ヘッダー付け忘れゼロ」に展開
- player-management 以降の page は無指定で `default.vue` を継承

---

### Q2: `/onboarding` の「招待リンクから参加」UI 🔵

**質問日時**: 2026-05-30
**カテゴリ**: UX / スコープ
**背景**: `/onboarding` で「Group を作る」「招待リンクから参加」の 2 動線を示す。後者を
**コード手入力フォーム**にするか、**説明テキストのみ**にするか。手入力にすると
`INVITATION_NOT_FOUND_BY_CODE` 等の手入力系識別子が必要になる。

**回答**: **説明テキストのみ** (手入力フォームなし)。「Group を作る」ボタン + 「発行者から受け取った
招待 URL を直接開いてください」という静的説明。

**信頼性への影響**:
- `/onboarding` は静的画面 (composable 不要) で 🔵 確定
- 手入力系識別子 (`INVITATION_NOT_FOUND_BY_CODE`) は MVP では追加しない (error-handling.md §5.2 と整合)
- 招待参加は `/join/[code]` への URL 直リンク着地のみ (`INVITATION_NOT_FOUND_BY_LINK` の 1 系統)

---

## 設計中に顕在化した黄信号の解消 (4 件)

architecture.md 初版で 🟡 だった 4 論点を、ユーザレビューで 1 つずつ解消した (memory `feedback_question_granularity`)。

### ①Nuxt バージョン 🔵 (解決)
- **論点**: ドキュメント間で「Nuxt 3 / Nuxt UI v3」「Nuxt 4」が混在。
- **解消**: `package.json` 実測 = Nuxt 4.4 / Nuxt UI v4.5。**ADR-001 を更新**し Nuxt 4 に統一。
  現役ドキュメント 11 箇所の "Nuxt 3"/"Nuxt UI v3" を修正 (implements/・.dcs/ は履歴のため据え置き)。

### ②Nuxt UI v4 コンポーネント名 🔵 (解決)
- **論点**: 旧 `<UFormGroup>` が v4 で改称されている可能性。
- **解消**: **v4 公式 migration guide / docs を実測確認 (2026-05-30)**。`<UFormGroup>` → `<UFormField>` (v4.3+) で確定。
  本単位が使う `UButton`/`UForm`/`UFormField`/`UAlert`/`USkeleton`/`useToast` は全て v4 同名存続。
  現役ドキュメント 5 ファイルの旧 `<UFormGroup>` 表記も同日修正。
  (参考: v4 では `UButtonGroup`→`UFieldGroup` のリネームもあるが本単位では未使用)

### ③レイアウト戦略 🔵 (解決 → Q1)
- **解消**: Q1 の回答に基づき **ADR-011 を起票・Accepted**。

### ④composable 戻り値の統合 🔵 (解決)
- **論点**: ADR-007 D4-2 (生 `error: AppErrorCode` ref を expose) と error-handling.md §6.5
  (UI チャネル composable から `notice`/`fieldErrors` を expose) が矛盾。
- **解消**: **error-handling.md §6.5 の UI チャネルパターンを正**とし、**ADR-007 に §補遺を追記**。
  各 Write composable は「決定木で定まるチャネル state + `pending`」を expose (生 `error` ref は廃止)。
  `pending` は二重送信防止 (EDGE-003) のため全 Write に付与。
  併せて D4-2 例の `p_group_name` (正: `group_name`) / `UNIQUE_VIOLATION→GROUP_NAME_TAKEN`
  (groups.name に UNIQUE 制約なし、存在しない分岐) の誤りを明示訂正。

### ⑤NFR-001 (ログイン 5 秒) 🟡 (据え置き、設計面は確定)
- **論点**: dev でログインフロー 5 秒以内 (NFR-001) を満たせるか。
- **判断**: **設計面の対策は確定済で不確実性なし** — 唯一の設計レバー「1 ナビゲーション 1 クエリ」
  (NFR-002 / ADR-008 D4) が保証される。残るは実装後の実測のみ (OAuth ラウンドトリップは外部要因)。
  → 🟡 は「未実測」であって「設計が曖昧」ではない。kairo-implement 後の受入テストで実測する**実測ゲート**として
  acceptance-criteria に委譲。

---

## ヒアリング結果サマリー

### 確認できた事項
1. レイアウト: 2 構成 (`auth.vue` + `default.vue`)、ログアウトは `default.vue` ヘッダー 1 箇所 → ADR-011
2. `/onboarding` の招待参加: 説明テキストのみ (手入力フォームなし)
3. Nuxt バージョン統一 (Nuxt 4)、Nuxt UI v4 コンポーネント名確定 (`<UFormField>`)
4. Write composable 戻り値: 「チャネル state + pending」(error-handling.md §6.5 を正) → ADR-007 §補遺

### 起票/更新した ADR
- **ADR-011 (layout-strategy)**: 新規・Accepted (2026-05-30)
- **ADR-007 §補遺**: D4-2 戻り値を確定 (2026-05-30)
- **ADR-001**: Nuxt 4 統一に更新 (2026-05-30)

### 信頼性レベル分布 (architecture.md)
- **設計初版**: 🔵 25 / 🟡 4 / 🔴 0
- **黄信号解消後**: 🔵 28 / 🟡 1 (NFR-001 実測のみ) / 🔴 0 (🔵 97%)

**品質評価**: 高品質。重要決定 (レイアウト/招待 UI) はユーザ合意、その他は ADR・公式 docs 実測で根拠あり。
残る 🟡 1 件は設計の曖昧さではなく実装後の実測項目。

## 関連文書

- **アーキテクチャ設計**: [architecture.md](architecture.md)
- **データフロー**: [dataflow.md](dataflow.md)
- **型定義**: [interfaces.ts](interfaces.ts)
- **要件定義**: [requirements.md](../../spec/auth-onboarding/requirements.md)
- **要件フェーズのヒアリング**: [interview-record.md](../../spec/auth-onboarding/interview-record.md)
- **ADR**: [001](../../decisions/001-framework.md) / [007](../../decisions/007-composable-naming-conventions.md) / [008](../../decisions/008-middleware-strategy.md) / [011](../../decisions/011-layout-strategy.md)
- **エラー実装規約**: [error-handling.md](../cross-cutting/error-handling.md)
