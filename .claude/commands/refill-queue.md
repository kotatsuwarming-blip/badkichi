---
description: プロダクトループ L2 の補充工程。マージ済みの ADR / 要件定義から未登録のタスクを導き、docs/backlog/queue.json の末尾に追記する PR を開いて止まる (ADR-020 §4)
---

あなたは badkichi のプロダクトループ (ADR-020 §4 の L2) の「キューの補充」を 1 回行う。
目的は、文書 (ADR、要件定義) で決まったのに `queue.json` に無い実装タスクを拾い、人が拒否権だけで決められる形 (PR) にすること。
タスクを実装してはいけない。実装は `/next-task` の仕事。

## 0. 読むもの

- `docs/decisions/020-ai-first-input-and-loop-engineering.md` §4、§8
- `docs/backlog/queue.json` (`last_refill.commit` 以降が対象。null なら全体)
- `docs/backlog/progress.md`
- `git -C ../badkichi-dev fetch origin` のあと、`git -C ../badkichi-dev log --oneline <last_refill.commit>..origin/main -- docs/decisions docs/spec docs/backlog` で、前回以降にマージされた文書を見つける

## 1. タスクの導出

対象の文書ごとに、次を抜き出す。

- ADR の「決定」「影響 §次のアクション」に書かれていて、まだ `queue.json` に無い実装項目
- 要件定義 (`docs/spec/<name>/requirements.md`) があって、設計・実装のタスクが `queue.json` に無いもの
- バックログ (`docs/backlog/product-backlog.md`) で ADR-020 §8 により最優先になったエピック D の項目で、未登録のもの

1 タスクは「1 つの PR で閉じられる大きさ」にする (規模 L の項目は 2〜3 に割る)。
各タスクに `id`、`kind`、`title`、`done_when` (完了条件。文書の文言をそのまま使う)、`source`、`after` (先にマージが必要なタスク ID) を付ける。
`passes: false`、`pr: null`、`notes: ""`。

## 2. 追記と並べ替えの案

- 導いたタスクを `tasks` の**末尾**に追記する。既存の行は消さない、`id` も変えない。
- 順序の変更は提案にとどめる: 提案があれば PR 本文に「この順に並べ替えることを提案する」と理由つきで書き、`queue.json` 自体の順序は触らない。
  例外: `after` の依存で前後が逆になっている場合だけ、依存が満たされる最小の並べ替えを行い、PR 本文に書く。
- `last_refill.commit` を origin/main の先頭コミット、`last_refill.date` を今日にする。
- 作業時間の計測 (BL-020 / `human_resolutions.lead_time_ms`) が取れる段階になったら、項目別の訂正時間が大きい順に
  改善タスクの候補を PR 本文に書く (ADR-020 §4 L2 の信号)。取れない段階ではこの節は「未計測」と書く。

## 3. PR

- worktree: `git -C ../badkichi-dev worktree add ../badkichi-refill -b docs/queue-refill-<YYYYMMDD> origin/main`
- 変更するファイルは `docs/backlog/queue.json` だけ。`git add` はこのファイルを明示する。
- `gh pr create --base main --head docs/queue-refill-<YYYYMMDD>`。本文には、追記した各タスクの「出典 → タスク」の対応表、並べ替えの提案、消してよい候補 (重複や不要と思われるもの) を書く。
- **PR はマージしない**。人がこの PR で行を消し、順序を直してマージする。
- 報告は、追記した件数、PR の URL、人に判断してほしい点 (消す候補、順序) の 3 つだけ。

## やってはいけないこと

- タスクの実装や要件定義の執筆 (それは `/next-task`)
- 既存タスクの削除、`id` / `done_when` の書き換え
- 文書に根拠の無いタスクの追加。思いついた改善は PR 本文の「候補」に書くだけにする
