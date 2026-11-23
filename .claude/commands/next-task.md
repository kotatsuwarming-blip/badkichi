---
description: 開発ループ L0 の 1 周 (実行係)。docs/backlog/queue.json の先頭タスクを取り、ブランチを切って実装し、PR を開いて止まる。詰まったら inbox に記録して止まる (ADR-020 §4)
---

あなたは badkichi の開発ループ (ADR-020 §4 の L0) の**実行係**を 1 周務める。人の指示を待たずに、次の手順を上から順に行う。1 周で扱うタスクは 1 つだけ。

**出口は 2 つだけ**: (a) PR が開いた、(b) 詰まったので `inbox` に記録して止まった。
計画はしない: キューにタスクを足さない、ADR の要否を判断しない、詰まりの扱いを決めない。それは `/refill-queue` (L2) の仕事。

## 0. 前提の確認

- `docs/decisions/020-ai-first-input-and-loop-engineering.md` §4、`docs/backlog/progress.md`、`docs/backlog/queue.json` をこの順で読む。
- `git -C ../badkichi-dev fetch origin` を実行し、origin/main を最新にする。
- `queue.json` の `tasks` を上から見て、次の条件をすべて満たす最初の 1 件を選ぶ:
  `passes` が false、`pr` が null、`notes` に blocked が無い、`after` の各タスクが `passes: true` (= main にマージ済み)。
- 該当が無ければ理由を分けて報告して止まる: 「キューが空 (→ `/refill-queue`)」か「残りはすべて依存待ちか保留 (→ 人が PR をマージするか、`/refill-queue` が inbox を仕分ける)」。

## 1. 作業ツリーとブランチ

- 主リポジトリのブランチは触らない (他のセッションが使っている)。
- `git -C ../badkichi-dev worktree add ../badkichi-<短い名前> -b <種別>/<短い名前> origin/main` で作業ツリーを切る。種別は feature / fix / docs (タスクの `kind` に合わせる)。
- コードを変える場合はそこで `pnpm install --prefer-offline` を実行する (pre-commit と Stop hook に必要)。

## 2. 実装

- `kind: docs` のタスク (要件定義、ADR) は、書いたら PR を開いて止まる。作者の確認が要るので実装には進まない。
- 要件定義が無い機能は、先に `docs/spec/<name>/` に tsumiki の書式 (EARS、🔵🟡🔴) で要件定義を書き、**要件定義だけで PR を開いて止まる** (実装は次の周)。
- 要件定義があるものは tsumiki の `kairo-design` → `kairo-tasks` → `tdd-*` の流れで実装する。
- `git add` は変更したファイルを明示する (`git add -A` は使わない)。
- コミットメッセージは `<type>(<scope>): <要約>` の形。末尾に Co-Authored-By と Claude-Session を付ける。

## 3. 検証

- コードを含む場合: `pnpm lint` / `pnpm typecheck` / `pnpm test` を通す。Stop hook が同じ検証を行うが、先に自分で通す。
- 作業ブランチを dev にマージして push する: `git -C ../badkichi-dev merge <branch> && git -C ../badkichi-dev push`。
- 画面に関わる変更は localhost:3000 (dev) で動作を確認し、確認した操作を PR 本文に書く。確認できない場合はその旨を書く。

## 4. 出口 (a): PR と後始末

- `gh pr create --base main --head <branch>` で PR を開く。本文は `.github/pull_request_template.md` の項目をすべて埋める。「起点」は `/next-task`、「完了条件」はタスクの `done_when` をそのまま写す。
- **完了の判定は「PR が開いた」という事実だけ**。自分の判断で完了と書かない。
- `queue.json` の該当タスクの `pr` に PR 番号を書く (`passes` は人がマージしたときに true にする)。
- 作業中に気づいたこと (別の不具合、文書の矛盾、改善の種) は `inbox` に `type: finding` で 1 件ずつ追記する。扱いは決めない。
- `progress.md` に 1 項目追記する (日付、タスク ID、PR 番号、次の周への注意 1〜3 行)。
- `queue.json` と `progress.md` の変更は同じ作業ブランチに 1 コミット足して push する。
- **PR はマージしない**。マージは人が行う。
- 報告は、取ったタスク、PR の URL、inbox に書いた件数、の 3 つだけ。

## 5. 出口 (b): 詰まったとき

次のどれかに当たったら、それ以上進めない。

- 同じ失敗を 3 回繰り返した
- 仕様が曖昧で、推測しないと実装できない
- タスクの前提 (`after`、参照している文書) が実態と食い違う

やること:

- `queue.json` の `inbox` に 1 件追記する: `type: blocked`、`from` にタスク ID、`summary` (何が起きたか)、`tried` (試したこと)、`question` (決まっていれば進める問い。1 文)、`status: open`。
- 該当タスクの `notes` に「blocked: inbox <id>」と書く。
- ここまでの変更があれば作業ブランチに push し、PR を draft で開く (無ければ開かない)。
- `queue.json` の変更は作業ブランチ (無ければ `docs/inbox-<YYYYMMDD>` ブランチ) にコミットして push し、PR を開く。
- 報告は、タスク ID、詰まった理由 1 文、inbox の id、の 3 つだけ。**次のタスクには進まない。**

## やってはいけないこと

- キューにタスクを足す、消す、並べ替える (`/refill-queue` と人の仕事)
- `passes` / `pr` / `notes` / `inbox` 以外を変える
- 詰まりの原因に対して ADR や要件定義を書き始める (タスクとして与えられた場合を除く)
- main や dev に直接コミットする
- `supabase db push` / `db reset`、`git push --force`、ディレクトリの再帰削除
- 要件定義を書かずに新機能を実装する
