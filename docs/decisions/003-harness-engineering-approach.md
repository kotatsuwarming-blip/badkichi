# ADR-003: ハーネスエンジニアリング導入方針

## ステータス
Accepted (2026-04-15)

## 背景

TDD 作業（tsumiki 利用）が進行中だが、確認事項が多く進捗が遅い。自律度を上げつつ「曖昧な場合は確認してほしい」という制約を保ちたい。

いわゆる**ハーネスエンジニアリング**（プロンプトではなく仕組みで Coding Agent の出力を安定させる考え方）を参考に、Claude Code に追加できる機構が複数ある：

- `CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS`（[Agent Teams](https://code.claude.com/docs/ja/agent-teams)、v2.1.32+ の実験的機能）
- `settings.json` の `permissions.allow` / `permissions.deny`（確認ダイアログの自動許可・拒否）
- `settings.json` の `hooks`（PostToolUse / Stop 等で決定論的にコマンド実行）
- `.claude/agents/` 配下の subagent 定義
- learning-rules スキル（セッション跨ぎのルール蓄積）
- 参考: [Harness Engineering Best Practices 2026](https://nyosegawa.com/posts/harness-engineering-best-practices-2026/)

一方、このプロジェクトでは既に [tsumiki](https://github.com/classmethod/tsumiki) を TDD/要件定義/タスク分割のワークフローとして採用済みで、以下の機能を提供している：

- TDD フェーズ分離（`tdd-red` / `tdd-green` / `tdd-refactor`）
- タスクループ（`kairo-loop`）
- エージェント分業・検証・再試行（`orchestrate`）
- テスト失敗の自動修復（`auto-debug` / `env-fix` / `timeout-fix` / `flaky-fix` / `build-fix`）
- 完了検証（`tdd-verify-complete`）
- コンテキスト収集（`tdd-tasknote` / `kairo-tasknote`）

tsumiki と Claude Code ハーネス機構には機能が被る部分があり、**何をどこまで導入するか**を決める必要がある。

## 事前に解決すべき論点

1. tsumiki の既存機能でカバーできる範囲はどこまでか
2. tsumiki で**カバーできない**ハーネス要件は何か
3. 導入順序（すべて一気か、段階的か）
4. 学習（過去のミスの再発防止）をどう複利化するか

---

## 論点ごとの議論と結論

### 論点 1: tsumiki のカバー範囲

| ハーネス要素 | tsumiki の該当機能 | カバー状況 |
|---|---|---|
| TDD フェーズ分離 | `tdd-red` / `tdd-green` / `tdd-refactor` | ✅ 完全カバー |
| 計画と実行の分離 | `kairo-requirements` → `kairo-design` → `kairo-tasks` → `kairo-implement` | ✅ 完全カバー |
| タスクループ（順次） | `kairo-loop` | ✅ 完全カバー |
| テスト失敗の自動修復 | `auto-debug` + 各種 fix コマンド | ✅ 完全カバー |
| エージェント分業・検証・再試行 | `orchestrate`（依頼を分析しチーム実行） | ✅ カバー |
| 完了検証 | `tdd-verify-complete` | ✅ カバー |

**結論:** **実装作業の自律性の大部分は tsumiki で足りている**。追加機構を上乗せする前に、まず tsumiki を十分に活用することを優先する。

### 論点 2: tsumiki でカバーされない要件

| 要件 | なぜ tsumiki で置き換えられないか | 対応手段 |
|---|---|---|
| 権限確認ダイアログの削減 | tsumiki は Claude 側のワークフロー。確認プロンプトは Claude Code ハーネス層の設定 | `settings.json` の `permissions.allow` / `deny` |
| 決定論的な強制（lint/test/typecheck） | tsumiki は Claude への指示ベース。Claude が忘れる／ショートカットする余地がある | `settings.json` の `hooks`（PostToolUse / Stop） |
| メンバー間直接通信を伴う並列実行 | `orchestrate` は主セッション内調整。メールボックス型の直接通信ではない | Agent Teams（実験的、要 v2.1.32+） |
| セッション跨ぎのルール蓄積 | tsumiki のノートは実行時コンテキスト。セッションを跨いで自動読込されない | learning-rules スキル（導入済） |

### 論点 3: 導入順序

「記事に書いてあるから」と一気に全部入れるのは避ける。理由：

- Hook は誤爆時のデバッグコストが高い
- Agent Teams はトークンコストがメンバー数に線形（3〜5 倍）で、同一ファイル編集で競合する
- 不要な機構は腐敗の原因になる（ハーネス best practices 記事のアンチパターン「エージェント専用インフラ」）

**段階的アプローチ:**

- **Phase 0（完了）**: tsumiki + learning-rules + permissions allowlist/denylist
- **Phase 1 未実施**: Claude が lint / typecheck / test を忘れる事例が具体的に発生したら PostToolUse / Stop Hook を追加
- **Phase 2 未実施**: 独立 TASK を同時実行したい要求が明確になったら Agent Teams を有効化し、`.claude/agents/` 配下に TDD 専用 subagent（`tdd-red` / `tdd-green` / `tdd-refactor` / `reviewer`）を定義

各フェーズへの移行条件は「前フェーズの痛みが具体的に観測された時」とする。

### 論点 4: 学習の複利化

導入済の learning-rules スキル（`~/.claude/skills/learning-rules/`）に任せる。セッション終了時に手動発動し、`.claude/rules/learning/` にルールを蓄積することで、将来のセッションで同じ指摘を繰り返さなくなる。

tsumiki の `tdd-tasknote` / `kairo-tasknote` はその回のコンテキスト保存が主目的であり、セッション跨ぎの自動読込は learning-rules が担う役割とは別。両者は補完関係。

---

## 決定

### 方針

**「tsumiki を優先し、tsumiki でカバーできない痛みが具体的に観測された場合に限り、Claude Code ハーネス機構（hooks / Agent Teams）を段階的に追加する」**

### Phase 0（実施済み、2026-04-15）

- TDD / 実装作業は tsumiki の `kairo-loop` / `orchestrate` / `tdd-*` を優先的に利用する
- セッション跨ぎの学習は learning-rules スキル（導入済）に任せる
- `~/.claude/settings.json`（user global）に permissions を追加:
  - allow: `git status/diff/log/branch/show`
  - deny: `git push`, `git reset --hard`, `git rebase`, `rm -rf`, `pnpm install`, `pnpm add`, `pnpm remove`
- `.claude/settings.local.json`（project）に permissions を追加:
  - allow: `pnpm test/typecheck/lint/vitest/build/preview/simple-git-hooks`, `git add/commit`

### Phase 1 以降の移行条件

| フェーズ | 移行条件 | 追加すること |
|---|---|---|
| Phase 1 | Claude が lint / typecheck / test を実行し忘れて不完全な成果物を出す事例が具体的に発生 | `settings.json` の `hooks`（PostToolUse で lint、Stop で typecheck + test） |
| Phase 2 | 依存関係のない複数 TASK を同時進行させたい要求が生じ、`orchestrate` では足りないと判断 | `CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1`、`.claude/agents/` に subagent 定義、Agent Teams で並列実行 |

各フェーズ移行時は別の ADR として記録する。

### 採用しない・保留

- ハーネス best practices 記事の全項目の一括導入は採用しない（上記アンチパターン）
- Agent Teams の無条件採用は保留（コストと競合リスク）

## データエンジニアのアナロジー

- **tsumiki** = データパイプラインの dbt や Airflow：ワークフロー定義で処理を自動化
- **Hook** = データパイプラインの制約チェック（NOT NULL、参照整合性）：決定論的に発火する
- **permissions allowlist/denylist** = サービスアカウントの IAM：よく使うものを事前承認、危険なものは明示的に拒否
- **Agent Teams** = 並列タスク（multiprocessing）：CPU を増やして速くするが、共有リソース競合に注意
- **learning-rules** = 過去の incident からの post-mortem をルール化：複利的に効く

## 影響

- Phase 0 の permissions 変更により、pnpm TDD コマンドと git 読み取り操作の確認ダイアログが消え、tsumiki のワークフローが中断されにくくなる
- 破壊的操作（git push、pnpm install 等）は引き続き明示的な承認が必要
- tsumiki の利用度が高まる（特に `kairo-loop` と `orchestrate`）
- Phase 1 以降に移行した際は、本 ADR を Superseded にせず、新 ADR を追加する形で履歴を残す
- learning-rules スキルの活用状況を定期的に見直す

## 参考

- Agent Teams 公式ドキュメント: https://code.claude.com/docs/ja/agent-teams
- Harness Engineering Best Practices 2026: https://nyosegawa.com/posts/harness-engineering-best-practices-2026/
- learning-rules スキル紹介（Tinkly）: https://note.com/jake_k547/n/n2004f4422e12
- tsumiki: https://github.com/classmethod/tsumiki
