---
description: 開発ループ L0 の 1 周。docs/backlog/queue.json の先頭タスクを取り、ブランチを切って実装し、PR を開いて止まる (ADR-020 §4)
---

あなたは badkichi の開発ループ (ADR-020 §4 の L0) を 1 周回す。人の指示を待たずに、次の手順を上から順に行い、最後に PR の URL を報告して止まる。1 周で扱うタスクは 1 つだけ。
キューへのタスクの補充はこのコマンドの仕事ではない (`/refill-queue`、L2)。

## 0. 前提の確認

- `docs/decisions/020-ai-first-input-and-loop-engineering.md` §4、`docs/backlog/progress.md`、`docs/backlog/queue.json` をこの順で読む。
- `git -C ../badkichi-dev fetch origin` を実行し、origin/main を最新にする。
- `queue.json` の `tasks` を上から見て、次の条件をすべて満たす最初の 1 件を選ぶ:
  `passes` が false、`pr` が null、`notes` に needs-human が無い、`after` の各タスクが `passes: true` (= main にマージ済み)。
- 該当が無ければ理由を分けて報告して止まる: 「キューが空 (→ `/refill-queue` を実行する)」か「残りはすべて依存待ちか保留 (→ 人が PR をマージするか保留を解く)」。

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

## 4. PR と後始末

- `gh pr create --base main --head <branch>` で PR を開く。本文は `.github/pull_request_template.md` の項目をすべて埋める。「起点」は `/next-task`、「完了条件」はタスクの `done_when` をそのまま写す。
- **完了の判定は「PR が開いた」という事実だけ**。自分の判断で完了と書かない。
- `queue.json` の該当タスクの `pr` に PR 番号を書く (`passes` は人がマージしたときに true にする)。`progress.md` に 1 項目追記する (日付、タスク ID、PR 番号、次の周への注意 1〜3 行)。この 2 ファイルの変更は同じ作業ブランチに 1 コミット足して push する。
- **PR はマージしない**。マージは人が行う。
- 報告は、取ったタスク、PR の URL、人に判断してほしい点、の 3 つだけを書く。

## うまくいかないとき

- 同じ失敗を 3 回繰り返したら、それ以上試さない。`queue.json` の `notes` に「needs-human: <理由>」を書き、ここまでの変更を作業ブランチに push し、PR を draft で開いて止まる。次のタスクには進まない。
- 仕様が曖昧で判断が要るときも同じ。推測で実装しない。

## やってはいけないこと

- キューに無いタスクに手を出す。作業中に見つけた問題は `queue.json` の `tasks` 末尾に `passes: false` で 1 行追記するだけにする (出典は「/next-task <タスク ID> で発見」)。
- `queue.json` のタスクを削除する、`passes` / `pr` / `notes` 以外の項目を変える (末尾追記を除く)。
- main や dev に直接コミットする。
- `supabase db push` / `db reset`、`git push --force`、ディレクトリの再帰削除。
- 要件定義を書かずに新機能を実装する。
