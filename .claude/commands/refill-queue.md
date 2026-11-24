---
description: プロダクトループ L2 の計画係。マージ済みの ADR / 要件定義から未登録タスクを導いて GitHub Issues (loop:task) に起票し、loop:inbox の Issue を仕分けて止まる (ADR-020 §4)
---

あなたは badkichi のプロダクトループ (ADR-020 §4 の L2) の**計画係**を 1 回務める。
入力は 2 つ: マージ済みの文書 (ADR、要件定義、バックログ) と、`loop:inbox` の open な Issue (実行係 `/next-task` が残した詰まりと気づき)。
出力は GitHub Issues の更新だけ: `loop:task` の起票、inbox Issue へのコメントとラベル付け替え。PR は作らない (progress.md の 1 行を除く)。
人は起票された Issue を閉じる (拒否権)、`prio:*` を付け替える、で決める。
タスクを実装してはいけない。ADR や要件定義を書いてもいけない。それは `/next-task` の仕事 (タスクとして渡す)。

## 0. 読むもの

- `docs/decisions/020-ai-first-input-and-loop-engineering.md` §4、§8
- `docs/rule/story-splitting.md` (ストーリー → 単位の分割基準)
- `docs/backlog/progress.md` (末尾の「補充」の行で、前回見た main のコミットを知る。無ければ全体)
- `gh issue list --label loop:task --state all --limit 100 --json number,title,labels,state,body` (既存タスク。重複起票を避ける)
- `gh issue list --label loop:inbox --state open --json number,title,body`
- `git -C ../badkichi-dev fetch origin` のあと、`git -C ../badkichi-dev log --oneline <前回のコミット>..origin/main -- docs/decisions docs/spec docs/backlog` で前回以降にマージされた文書

## 1. 文書からタスクを導く

対象の文書ごとに、次を抜き出す。

- ADR の「決定」「影響 §次のアクション」にあって Issue に無い実装項目
- 要件定義 (`docs/spec/<name>/requirements.md`) があって、設計・実装のタスクが無いもの
- バックログで ADR-020 §8 により最優先になったエピック D の項目で未登録のもの

タスクは**子の単位** (親を持たない単位を含む) から導く。親 (機能群) の `requirements.md` からは実装タスクを導かない (親はストーリー・方針・単位の分割を持つだけ。`docs/rule/story-splitting.md` §0)。

1 タスクは「1 つの PR で閉じられる大きさ」(規模 L は 2〜3 に割る)。起票は次の形:

```
gh issue create --label loop:task --label kind:<docs|feature|fix> --label prio:<1|2|3> \
  --title "<ID>: <題名>" \
  --body "## 完了条件
<文書の文言をそのまま>

## 出典
<ADR の節 / 要件定義 / バックログ ID / inbox Issue>

## 依存
<先に closed である必要がある Issue。無ければ「なし」>
"
```

`prio` は、ADR-020 §8 の順序 (エピック D と記録層が先) と依存関係から付ける。既存タスクと同じ内容なら起票せず、既存 Issue にコメントで出典を足す。

## 1b. ストーリーから要件定義の単位を導く

前回以降に `docs/spec/<親>/user-stories.md` が変わった (または新しい単位の `requirements.md` が `docs/rule/story-splitting.md` §2-1 の信号に当たる) 場合:

- §2-2 の 4 問で単位の分割案を作る: 単位名、担うストーリー、持つデータ、外部依存、単位間の契約 (3 本以内)。
- 子の要件定義を 1 単位 1 件、`kind:docs` の `loop:task` として起票する。本文の完了条件は「`docs/spec/<単位>/` に requirements.md (EARS)、acceptance-criteria.md、note.md、user-stories.md (親への対応表) が書かれ PR が開いている」、出典は親の `user-stories.md` と分割案。本文に分割案の表を載せる。
- 信号に当たらなければ何もしない。分割しない判断も親の Issue にコメントで残す (理由は 4 問の結果)。
- ストーリー自体は書き換えない。ストーリーの提案があれば `needs-human` ラベルつきの Issue 1 件にまとめる (持ち主は人)。

## 2. inbox を仕分ける

`loop:inbox` の open な各 Issue について、処置を 1 つ選び、コメントに「仕分け: <処置> — <理由>」と書いて、処置に応じた操作をする。

| 種類 | 処置 | 操作 |
|---|---|---|
| blocked、一言の補足で進める | `clarify` | 元タスクの Issue に補足をコメントし (根拠の文書箇所つき)、`blocked` ラベルを外す。inbox Issue を閉じる |
| blocked、決まっていない問いがある | `adr` | `loop:task` + `kind:docs` で「ADR-0xx: <問い>」を起票 (完了条件は「問いに答える ADR が書かれ PR が開いている」)。元タスクの本文「依存」にその番号を足す (`gh issue edit`)。inbox Issue を閉じる |
| blocked、要件が足りない | `spec` | `kind:docs` で要件追補のタスクを起票し、元タスクの依存に足す。inbox Issue を閉じる |
| blocked、やる価値がない | `drop-candidate` | 元タスクに `drop-candidate` ラベルを付け、理由をコメント。閉じるのは人。inbox Issue を閉じる |
| finding、対応すべき | `task` | `loop:task` で起票 (出典に inbox Issue 番号)。inbox Issue を閉じる |
| finding、対応不要 | `noted` | 理由をコメントして inbox Issue を閉じる |

迷ったら `adr` か `drop-candidate` に寄せる。実行係に判断を戻さない。

## 3. 順序の提案と記録

- 既存タスクの `prio:*` は変えない。変えた方がよいと思う場合は、該当 Issue にコメントで提案する (付け替えるのは人)。
  例外は依存が逆転している場合だけで、依存元を依存先より低い prio にしないよう付け替え、コメントに書く。
- 作業時間 (BL-020 / `human_resolutions.lead_time_ms`) が取れる段階なら、項目別の訂正時間が大きい順に改善タスクの候補を `needs-human` ラベルつきで起票する (ADR-020 §4 L2 の信号)。取れない段階では何もしない。
- `docs/backlog/progress.md` に 1 行追記する: `- YYYY-MM-DD 補充 — 見た範囲 <前回>..<origin/main の先頭コミット>、起票 N 件 (#..)、仕分け N 件`。
  この変更は `docs/refill-<YYYYMMDD>` ブランチに 1 コミットし、PR を開く (文書のみ。dev へのマージは不要)。

## 4. 報告

起票した Issue の番号と題名、仕分けた inbox Issue の番号と処置、人に閉じてほしい候補、の 3 つだけ。

## やってはいけないこと

- タスクの実装、ADR や要件定義の執筆 (`/next-task` に渡す)
- 既存タスクの Issue を閉じる、題名や完了条件を書き換える (補足はコメントで)
- 文書にも inbox にも根拠の無いタスクの起票。思いついた改善は `needs-human` ラベルで 1 件にまとめて起票し、本文に「候補」と明記する
- inbox Issue を仕分けずに open のまま残す
