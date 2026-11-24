---
description: 開発ループ L0 の 1 周 (実行係)。GitHub Issues (label loop:task) から先頭のタスクを取り、ブランチを切って実装し、PR を開いて止まる。詰まったら loop:inbox の Issue を立てて止まる (ADR-020 §4)
---

あなたは badkichi の開発ループ (ADR-020 §4 の L0) の**実行係**を 1 周務める。人の指示を待たずに、次の手順を上から順に行う。1 周で扱うタスクは 1 つだけ。

**出口は 2 つだけ**: (a) PR が開いた、(b) 詰まったので `loop:inbox` の Issue を立てて止まった。
計画はしない: タスクの Issue を立てない、ADR の要否を判断しない、詰まりの扱いを決めない。それは `/refill-queue` (L2) の仕事。

キューは **GitHub Issues**。`gh issue list --label loop:task --state open` が板。順序はラベル `prio:1` > `prio:2` > `prio:3`、同じ prio は番号の小さい (古い) 順。

## 0. 前提の確認

- `docs/decisions/020-ai-first-input-and-loop-engineering.md` §4 と `docs/backlog/progress.md` を読む。
- `git -C ../badkichi-dev fetch origin` を実行し、origin/main を最新にする。
- 候補を取る: `gh issue list --label loop:task --state open --json number,title,labels,body --limit 50`。
  次の条件をすべて満たす最初の 1 件を選ぶ:
  - ラベルに `in-progress`、`blocked`、`needs-human`、`drop-candidate` が無い
  - 本文の「依存」に書かれた Issue (`#n`) がすべて closed (`gh issue view n --json state`)
- 該当が無ければ理由を分けて報告して止まる: 「キューが空 (→ `/refill-queue`)」か「残りはすべて依存待ちか保留 (→ 人が PR をマージするか、`/refill-queue` が inbox を仕分ける)」。
- 選んだ Issue に `in-progress` ラベルを付け、「着手 (session: <このセッションの URL>)」とコメントする。

## 1. 作業ツリーとブランチ

- 主リポジトリのブランチは触らない (他のセッションが使っている)。
- `git -C ../badkichi-dev worktree add ../badkichi-<短い名前> -b <種別>/<短い名前> origin/main` で作業ツリーを切る。種別は feature / fix / docs (Issue の `kind:*` に合わせる)。
- コードを変える場合はそこで `pnpm install --prefer-offline` を実行する (pre-commit と Stop hook に必要)。

## 2. 実装

- `kind:docs` のタスク (要件定義、ADR) は、書いたら PR を開いて止まる。作者の確認が要るので実装には進まない。
- 要件定義が無い機能は、先に `docs/spec/<name>/` に tsumiki の書式 (EARS、🔵🟡🔴) で要件定義を書き、**要件定義だけで PR を開いて止まる** (実装は次の周)。
  大きい機能 (`docs/rule/story-splitting.md` §2-1 の信号に当たる) は、親 (ストーリー・方針・単位の分割と契約) だけを書いて止まる。子の要件定義は `/refill-queue` が起票する別の周。
- 子の要件定義のタスク (親がある単位) では、親の `user-stories.md` を書き換えない。`user-stories.md` は親への対応表にする (`docs/rule/story-splitting.md` §0)。ストーリーへの提案は inbox に `finding:` で出す。
- 要件定義があるものは tsumiki の `kairo-design` → `kairo-tasks` → `tdd-*` の流れで実装する。
- `git add` は変更したファイルを明示する (`git add -A` は使わない)。
- コミットメッセージは `<type>(<scope>): <要約>` の形。末尾に Co-Authored-By と Claude-Session を付ける。

## 3. 検証

- コードを含む場合: `pnpm lint` / `pnpm typecheck` / `pnpm test` を通す。Stop hook が同じ検証を行うが、先に自分で通す。
- 作業ブランチを dev にマージして push する: `git -C ../badkichi-dev merge <branch> && git -C ../badkichi-dev push`。
- 画面に関わる変更は localhost:3000 (dev) で動作を確認し、確認した操作を PR 本文に書く。確認できない場合はその旨を書く。

## 4. 出口 (a): PR と後始末

- `gh pr create --base main --head <branch>` で PR を開く。本文は `.github/pull_request_template.md` の項目をすべて埋める。「起点」は `/next-task`、「完了条件」は Issue 本文の完了条件をそのまま写す。**本文に `Closes #<Issue 番号>` を必ず書く** (マージで Issue が自動で閉じる = 完了)。
- **完了の判定は「PR が開いた」という事実だけ**。自分の判断で完了と書かない。Issue は閉じない (マージで閉じる)。
- 作業中に気づいたこと (別の不具合、文書の矛盾、改善の種) は、1 件ずつ `loop:inbox` の Issue を立てる:
  `gh issue create --label loop:inbox --title "finding: <要約>" --body "<種類: finding / 発生元: #<タスク> / 何が起きたか / 試したこと / 決まっていれば進める問い>"`。扱いは決めない。
- `docs/backlog/progress.md` に 1 項目追記する (日付、Issue 番号、PR 番号、次の周への注意 1〜3 行)。この変更は同じ作業ブランチに 1 コミット足して push する。
- Issue に「PR #<n> を開いた」とコメントする。`in-progress` ラベルは付けたまま。
- **PR はマージしない**。マージは人が行う。
- 報告は、取った Issue、PR の URL、立てた inbox Issue の番号、の 3 つだけ。

## 5. 出口 (b): 詰まったとき

次のどれかに当たったら、それ以上進めない。

- 同じ失敗を 3 回繰り返した
- 仕様が曖昧で、推測しないと実装できない
- タスクの前提 (依存、参照している文書) が実態と食い違う

やること:

- `loop:inbox` の Issue を 1 件立てる: `gh issue create --label loop:inbox --title "blocked: <要約>" --body "<種類: blocked / 発生元: #<タスク> / 何が起きたか / 試したこと / 決まっていれば進める問い (1 文)>"`。
- タスクの Issue に `blocked` ラベルを付け、inbox Issue の番号をコメントする。`in-progress` は外す。
- ここまでの変更があれば作業ブランチに push し、PR を draft で開く (`Closes` は書かない)。無ければ開かない。
- 報告は、タスクの Issue、詰まった理由 1 文、inbox Issue の番号、の 3 つだけ。**次のタスクには進まない。**

## やってはいけないこと

- `loop:task` の Issue を立てる、閉じる、ラベル `prio:*` を変える (`/refill-queue` と人の仕事)
- 詰まりの原因に対して ADR や要件定義を書き始める (タスクとして与えられた場合を除く)
- main や dev に直接コミットする
- `supabase db push` / `db reset`、`git push --force`、ディレクトリの再帰削除
- 要件定義を書かずに新機能を実装する
