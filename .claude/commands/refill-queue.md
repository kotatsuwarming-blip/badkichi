---
description: プロダクトループ L2 の計画係。マージ済みの ADR / 要件定義から未登録タスクを導き、inbox (詰まり・気づき) を仕分けて、docs/backlog/queue.json を更新する PR を開いて止まる (ADR-020 §4)
---

あなたは badkichi のプロダクトループ (ADR-020 §4 の L2) の**計画係**を 1 回務める。
入力は 2 つ: マージ済みの文書 (ADR、要件定義、バックログ) と、`queue.json` の `inbox` (実行係 `/next-task` が残した詰まりと気づき)。
出力は 1 つ: `queue.json` を更新する PR。人はその PR で行を消し、順序を直してマージする (拒否権)。
タスクを実装してはいけない。ADR や要件定義を書いてもいけない。それは `/next-task` の仕事 (タスクとして渡す)。

## 0. 読むもの

- `docs/decisions/020-ai-first-input-and-loop-engineering.md` §4、§8
- `docs/backlog/queue.json` (`tasks`、`inbox` の `status: open`、`last_refill`)
- `docs/backlog/progress.md`
- `git -C ../badkichi-dev fetch origin` のあと、`git -C ../badkichi-dev log --oneline <last_refill.commit>..origin/main -- docs/decisions docs/spec docs/backlog` で前回以降にマージされた文書

## 1. 文書からタスクを導く

対象の文書ごとに、次を抜き出す。

- ADR の「決定」「影響 §次のアクション」にあって `queue.json` に無い実装項目
- 要件定義 (`docs/spec/<name>/requirements.md`) があって、設計・実装のタスクが無いもの
- バックログで ADR-020 §8 により最優先になったエピック D の項目で未登録のもの

1 タスクは「1 つの PR で閉じられる大きさ」(規模 L は 2〜3 に割る)。
`id`、`kind`、`title`、`done_when` (文書の文言をそのまま)、`source`、`after`、`passes: false`、`pr: null`、`notes: ""`。

## 2. inbox を仕分ける

`status: open` の各件について、処置を 1 つ選び、`triage` に書いて `status: triaged` にする。

| 種類 | 処置 | やること |
|---|---|---|
| blocked、一言の補足で進める | `clarify` | 該当タスクの `notes` から blocked を外し、補足を `notes` に書く。根拠 (文書の箇所) を添える |
| blocked、決まっていない問いがある | `adr` | `kind: docs` で「ADR-0xx: <問い>」タスクを末尾に追記。`done_when` は「問いに答える ADR が書かれ PR が開いている」。元タスクの `after` にその ADR を足す |
| blocked、要件が足りない | `spec` | `kind: docs` で要件定義 (追補) タスクを追記し、元タスクの `after` に足す |
| blocked、やる価値がない | `drop-candidate` | 元タスクは消さない。PR 本文の「削除候補」に理由つきで載せる (消すのは人) |
| finding、対応すべき | `task` | 新しいタスクとして末尾に追記 (`source` は inbox の id) |
| finding、対応不要 | `noted` | `triage` に理由を書くだけ |

迷ったら `adr` か `drop-candidate` に寄せる。実行係に判断を戻さない。

## 3. 並べ替えの案と記録

- 追記は `tasks` の**末尾**。既存の行は消さない、`id` と `done_when` は変えない。
- 順序の変更は提案にとどめ、PR 本文に理由つきで書く。例外は `after` の依存が逆転している場合だけで、依存が満たされる最小の並べ替えを行い PR 本文に書く。
- `last_refill.commit` を origin/main の先頭コミット、`last_refill.date` を今日にする。
- 作業時間 (BL-020 / `human_resolutions.lead_time_ms`) が取れる段階なら、項目別の訂正時間が大きい順に改善タスクの候補を PR 本文に書く (ADR-020 §4 L2 の信号)。取れなければ「未計測」と書く。

## 4. PR

- worktree: `git -C ../badkichi-dev worktree add ../badkichi-refill -b docs/queue-refill-<YYYYMMDD> origin/main`
- 変更するファイルは `docs/backlog/queue.json` だけ。`git add` はこのファイルを明示する。
- `gh pr create --base main --head docs/queue-refill-<YYYYMMDD>`。本文に書くこと: 追記した各タスクの「出典 → タスク」の対応表、inbox の仕分け結果 (id → 処置)、並べ替えの提案、削除候補。
- **PR はマージしない**。人がこの PR で行を消し、順序を直してマージする。
- 報告は、追記した件数、仕分けた件数、PR の URL、の 3 つだけ。

## やってはいけないこと

- タスクの実装、ADR や要件定義の執筆 (`/next-task` に渡す)
- 既存タスクの削除、`id` / `done_when` の書き換え
- 文書にも inbox にも根拠の無いタスクの追加。思いついた改善は PR 本文の「候補」に書くだけにする
- inbox の件を `status: open` のまま残す (必ず処置を付ける)
