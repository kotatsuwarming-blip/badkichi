# ループエンジニアリング調査: 公式の部品、開発ループの既製品、AI 精度改善ループ

**作成日**: 2026-11-23 / **目的**: ADR-020 (AI 先行入力とループ) を実装に移す前に、使える部品と採用すべき設計を確認する。
調査は Claude Code の公式ドキュメント、GitHub の主要リポジトリ、ML 側のツールを 3 並行で読んだ結果 (URL は各表)。
数字 (★、日付) は 2026-11-23 時点。

## 1. 用語の対応

Anthropic の公式ブログ「Loop engineering」 (https://claude.com/blog/getting-started-with-loops) はループを 4 種に分ける。
ADR-020 §4 の 4 層とは軸が違う (公式は「何が次の 1 周を起こすか」、ADR は「何の信号で止めるか」)。対応は次のとおり。

| 公式の分類 | 起動のしかた | ADR-020 での位置 |
|---|---|---|
| turn-based | 毎ターン、skill や hook で検証 | L0 の中身 (Stop hook で lint / typecheck / test) |
| goal-based | `/goal` で完了条件を小型モデルが毎ターン判定 | L0 の 1 周 (「PR を開くまで」を条件にする) |
| time-based | `/loop` (セッション内)、`/schedule` (クラウド)、GitHub Actions の cron | L0 と L1 の周期 (週 1、訂正 N 件ごと) |
| proactive | 上記の組み合わせで、人が居なくても次を始める | L2 (作業時間の計測 → バックログ案) |

## 2. Claude Code 公式で揃っている部品

| 部品 | 要点 | ADR-020 への当てはめ | 出典 |
|---|---|---|---|
| Stop hook | 終了時に command を走らせ、exit 2 で「終わらせない」。stdin に `stop_hook_active`。連続 8 回ブロックで強制終了 (ツール呼び出しでリセット) | L0 の検証強制。best practices に `pnpm typecheck 1>&2 \|\| exit 2` 相当の例あり | https://code.claude.com/docs/en/hooks |
| PostToolUse / TaskCompleted hook | 編集直後の lint、タスク完了の拒否 (`decision: block`) | 編集ごとの eslint。tsumiki のタスク完了に「テスト合格」を強制 | 同上 |
| `claude -p` (headless) | `--max-turns`、`--max-budget-usd`、`--allowedTools`、`--permission-mode dontAsk`、`--output-format json` | cron / CI から 1 タスク = 1 呼び出し。無人化の 5 問 (完了条件・自己検証・触れる範囲・停止条件・結果の行先と承認者) に先に答える | https://code.claude.com/docs/en/headless 、https://code.claude.com/docs/en/best-practices#let-claude-run-without-you |
| `/goal` | 完了条件を毎ターン判定する prompt 型 Stop hook。`claude -p "/goal ..."` で 1 起動で収束まで | 1 周の完了判定 (「PR が開いている」) | https://code.claude.com/docs/en/goal |
| `/loop` | セッション内 cron。最小 1 分、7 日で失効 | 開発中の短い反復のみ。常駐には不向き | https://code.claude.com/docs/en/scheduled-tasks |
| `/schedule` (Cloud scheduled tasks) | cron (1 時間以上) / API / GitHub イベントでクラウド VM 上に起動。claude.ai ログイン必須、research preview、issues イベント非対応 | PR 後の「CI を緑にする」用途向け。キュー消費の主軸には早い | https://code.claude.com/docs/en/routines |
| `claude-code-action` | GitHub Actions。`prompt` で automation mode、`on: schedule` 可、`--max-turns`、`timeout-minutes`、`concurrency` | 「1 run 1 タスク → PR」の骨格。検証は既存 CI がゲート。秘密は Environment Secrets のまま | https://code.claude.com/docs/en/github-actions |
| Agent SDK (Python / TS) | `query()` / `ClaudeSDKClient`、`max_turns`、`hooks`、`ResultMessage.subtype` で成否判定 | 自前ランナーを書く場合の手段。Python は SessionStart / TaskCompleted hook が使えない | https://code.claude.com/docs/en/agent-sdk/overview |
| Worktree | `claude -w <name>`、サブエージェントの `isolation: worktree`、`.worktreeinclude` で .env を複製 | 1 周 1 worktree。`-p` 実行分は自動掃除なし | https://code.claude.com/docs/en/worktrees |
| 長時間エージェントの指針 | **タスク一覧は JSON で持ち `passes` だけ更新可、削除禁止**。進捗ファイルを残す。commit をチェックポイントに。開始時に git log と進捗を読んで 1 件選ぶ | キューを Markdown でなく JSON にする根拠 | https://www.anthropic.com/engineering/effective-harnesses-for-long-running-agents |
| 評価の指針 | code-based > LLM-based > human。grader は別モデル。Console の評価 UI 文書は現在リダイレクトで消滅 | 評価はコードで書く (ADR-020 §3 と整合) | https://platform.claude.com/docs/en/test-and-evaluate/develop-tests |

**公式に無いもの (自作か外部)**: 永続タスクキュー、セッションを跨いで「キューが空になるまで PR を作り続ける」ランナー、ML モデルの昇格承認ゲート、API key でのクラウド定期実行 (`/schedule` は claude.ai ログイン限定)。

## 3. 開発ループの既製品 (GitHub)

| リポジトリ | 規模 | 実装しているループ | 停止・人への引き渡し | 評価 |
|---|---|---|---|---|
| 公式プラグイン `ralph-loop` (anthropics/claude-plugins-official) | 公式 | Stop hook で同じプロンプトを再投入 | `--completion-promise` の文字列一致 or `--max-iterations` | 1 タスクをテスト緑まで粘らせる用途に最小。キュー・PR・停止判定の層は無い |
| frankbria/ralph-claude-code | ★9.7k、2026-11 | 外部 bash ループ。`.ralph/fix_plan.md` をキューに、`--create-pr` | 完了指標 AND `EXIT_SIGNAL` の二重ゲート、サーキットブレーカー、時間あたり上限 | 要件に最も近い既製品だが `.ralph/` 構造が tsumiki と二重管理になる。EXIT_SIGNAL 二重ゲートの設計は借りる |
| snarktank/ralph | ★22k、**2026-02 で停止** | `prd.json` の `passes:false` を 1 周 1 件、fresh context、`progress.txt` に学び | 全 pass or max_iterations | コードは採用しないが設計が最も素直。「1 周 1 タスク、JSON で状態、progress に学び」を借りる |
| bmad-code-org/bmad-loop | ★190、beta | Python オーケストレータ。LLM を制御ループに入れない。fresh セッション → 敵対的レビュー → verify → commit | 完了判定は Stop hook イベントのみ (発話を信用しない)。試行上限超えは deferred、CRITICAL は人が resolve するまで停止 | BMAD 成果物が前提で併用不可。「完了は外部事実で判定、上限超えは人へ保留」の思想を借りる |
| anthropics/claude-code-action | ★10k、公式 | cron で 1 ジョブ 1 タスク → ブランチ push → PR | 1 ジョブ 1 実行。連鎖は Actions のイベントで | 既存の PR フローと CI にそのまま乗る。推奨の骨格 (§6) |
| github/spec-kit | ★151k | 仕様駆動 (`/speckit-implement` → `/speckit-converge`) | エージェント任せ | tsumiki と役割が重複。乗り換えの利点薄 |
| ruvnet/ruflo、SuperClaude、BMAD 本体 | 大規模 | swarm / ペルソナ集 | — | 少人数には過剰。学習・保守コストが成果を上回る |
| Aider、OpenHands、SWE-agent | — | 自動 lint / test 修正、Issue → PR | — | Aider は 2025-08 で停滞。OpenHands は自前サーバ前提 |

**注意**: tsumiki 現行版では `kairo-*` / `tdd-*` が `tsumiki-legacy` プラグインに分離され、新しい Dev Skills (`dev-verify` = Plan 単位の test / build / lint 一括検証) が主軸になっている (https://github.com/classmethod/tsumiki)。本プロジェクトの `.claude/commands/` は legacy 版の写し。移行の要否は別途決める。

## 4. AI 精度改善ループ (ML 側)

### 4-1. 自律実験ループ

| ツール | 規模 | ループの中身 | 評価 |
|---|---|---|---|
| karpathy/autoresearch | ★100k、2026-03 | エージェントは `train.py` だけ編集、`prepare.py` (データ・評価) は不変、人は `program.md` だけ編集。1 実験 5 分固定、`val_bpb` で keep / revert を git で | コードは GPT 学習専用で流用不可。**設計が L1 の雛形**: 編集可能ファイル 1 個 + 不変の評価器 + 時間予算 + git で keep / revert。macOS fork あり (miolini/autoresearch-macos、MPS) |
| WecoAI/aideml | ★1.6k、MIT | LLM が木探索 (draft → debug → improve) でスクリプト生成、`valid_metric` で枝刈り | sklearn 系の小分類器 (球種・打者) には合う。動画・音声の前処理が重い学習には木探索が回らない |
| OpenEvolve | ★7.9k、Apache-2.0、2026-11 | `EVOLVE-BLOCK` で囲んだコードを `evaluator.py` のスコアで進化。**Claude Code CLI をバックエンドに使える** | 「秒で評価できるコード」(打刻の音 + 映像融合、ラリー境界の後処理) の最適化に合う。学習が要るものには不向き |
| Sakana AI Scientist-v2、MLE-bench / RD-Agent | — | 論文生成、Kaggle ベンチ | 過剰。参考のみ |

### 4-2. プロンプト最適化 (DSPy / GEPA / promptfoo / Braintrust / LangSmith)

推論経路 (YOLO-pose、TrackNet、音声、分類器) に LLM が居ないので対象外。例外は GEPA の `optimize_anything` (★7.5k、MIT) で、OpenEvolve と同じ後処理コードの最適化に使える。

### 4-3. 訂正の取り込み (データフライホイール)

| ツール | 規模 | 事前ラベル → 人の訂正 → 差分 | 評価 |
|---|---|---|---|
| Label Studio | ★28.7k、Apache-2.0 | `predictions` (model_version、score) は読み取り専用。人は annotation を作り `parent_prediction` で元予測を指す。`was_cancelled` / `lead_time` / `ground_truth` フラグ。ML backend の `predict()` / `fit()` と Webhook で再学習 | **「予測 vs 訂正の差分」を表せる唯一の OSS スキーマ**。本体 UI を置き換えるのではなく、このスキーマを Supabase に写す (§6)。座標ラベル (シャトル xy) だけは self-host で使う |
| FiftyOne | ★11.3k、Apache-2.0 | ラベル付きで CVAT / Label Studio に出し `load_annotations()` で回収。評価 run を key で保存・比較、`compute_mistakenness` で怪しいラベル抽出 | gold set の保管・可視化・モデル間比較の中核に向く |
| CVAT | ★17.2k、MIT | Python の検出関数で自動注釈 → UI で修正 → COCO / YOLO | 骨格・ボックスの修正は強いが、時刻イベントや球種には弱い |
| Cleanlab | ★11.8k | ラベル誤り検出 | gold set の人為ミス監査に限定 |
| LightlyStudio | ★913 | 埋め込みで典型 / 多様サンプル選択 | ラベル対象フレームの選別だけ |
| Roboflow (SaaS)、Encord Active (2025-08 アーカイブ)、Argilla (保守停止) | — | — | 不採用 |

### 4-4. 実験管理・レジストリ・昇格ゲート

- **MLflow** (★28.9k): `models:/name@champion` / `@challenger` のエイリアスで昇格。Registry は SQLite で動く。一人運用で最軽量 → 採用。
- **DVC** (★16k): gold set の凍結バージョン管理 → 採用。CML は 2024-10 で停滞 → 不採用 (`dvc metrics diff` を Actions で直接回す)。
- W&B Registry (SaaS)、ClearML (サーバ常駐) → 一人には重い。

### 4-5. 弱教師 (Snorkel)

Snorkel (★6k) は 2024-02 で停止、後継は Snorkel Flow (商用)。複数ノイズ源の統合 (LabelModel) は本件で不要。
「訂正済みの打刻時刻にはシャトルが打者のラケット付近にある」という拘束は、TrackNet の損失項か後処理の整合性スコアとして自前実装する方が短い。

### 4-6. スポーツ映像特化

- TrackNetV3 (★337、MIT): CSV `Frame,Visibility,X,Y` と `train.py` の学習レシピ。2026-09 に MPS 対応 PR。HITL 機構は無し → 学習レシピとして採用。
- CoachAI-Projects / ShuttleSet (★294、MIT): 18 球種のラベル体系の参照用。ツールは非公開。
- 2026 年の BFMD (打球イベント 16,751 件、https://arxiv.org/abs/2603.25533) は Label Studio でフレーム単位の時刻を付けている。音声ベースの打球検出 OSS は見つからず → 自前。

## 5. 要点

1. **開発ループ (L0) は公式部品だけで組める。** Stop hook + `claude -p` + `/goal` + GitHub Actions cron。既製のループ製品を入れる必要は無い。借りるのは設計だけ: 1 周 1 タスク、JSON キューで `passes` だけ更新、progress に学びを残す、完了は外部事実 (CI 緑 + PR) で判定、試行上限超えは人へ保留。
2. **モデル改善ループ (L1) の雛形は autoresearch。** 「編集できるファイルは 1 つ、評価器は不変、時間予算、git で keep / revert」。Claude Code がこの枠の中で実験を回す。学習の要らない後処理コードは OpenEvolve に任せられる。
3. **訂正の記録は Label Studio の二層スキーマを Supabase に写す。** 予測 (model_version、score) と人の確定 (元予測への参照、確認 / 訂正、所要時間) を別の行で持つ。ADR-020 §2 の 3 状態より情報が多く、`lead_time` が BL-020 (作業時間計測) をそのまま満たす。
4. **評価と昇格は MLflow (SQLite) + DVC。** gold set は DVC で凍結し FiftyOne で見る。昇格は `@champion` エイリアスの付け替え。
5. **内製するもの**: 訂正差分スキーマ、項目別の評価器と昇格ポリシー、打点拘束の整合性スコア、音声打球検出器。**既製で足りるもの**: Label Studio (座標ラベルのみ)、FiftyOne、MLflow、DVC、TrackNetV3 レシピ。

## 6. ADR-020 への修正提案

| ADR-020 の箇所 | 現在 | 提案 | 根拠 |
|---|---|---|---|
| §2 ショットの状態 | 項目ごとに draft / confirmed / corrected の 3 値 | **二層に変える**: `ai_predictions` (shot_id、field、value、model_version、score、created_at) と `human_resolutions` (prediction_id、value、kind = confirmed / corrected / rejected、lead_time_ms、user_id)。shots の列は「現在の値」を持つだけ | Label Studio のスキーマ。確認も訂正も所要時間も 1 つの表に残り、BL-020 が副産物で取れる |
| §3 評価 | 固定評価セット、1 コマンド | gold set を DVC で凍結、評価結果を MLflow に記録、`@champion` / `@challenger` で昇格 | 自作の最小構成。CML は不採用 |
| §4 L0 | Stop hook、タスクキュー (`queue.md`)、`/next-task`、PR テンプレート | キューを **JSON** (`docs/backlog/queue.json`、`passes` だけ更新) にし、`progress.md` に 1 周ごとの学びを追記。完了判定は「PR が開いた」という外部事実。Stop hook は公式の 8 回上限に任せ自前カウンタを外す。起点は **まずローカルの `/next-task`** で 5 周回し、安定したら `claude-code-action` の cron に移す | 公式の長時間エージェント指針、snarktank / bmad-loop の設計、Actions は秘密情報方針と整合 |
| §4 L1 | 推論 1 コマンド、再学習 1 コマンド、承認で切り替え | `~/dev/badkichi-ai` に autoresearch 型の枠を作る: `program.md` (方針、人だけが編集)、編集可能ファイル 1 つ (特徴量 / ハイパラ)、不変の `evaluate.py`、1 実験の時間上限、`results.tsv`、git で keep / revert。後処理コードは OpenEvolve で | autoresearch、OpenEvolve |
| §4 L1 の弱教師 | Snorkel を参考に | Snorkel は使わず、打刻拘束を整合性スコアとして自前実装 | Snorkel 停止 |
| §5 シャトル追跡 | 後回し、人手ラベルは外れた区間だけ | 同じ。座標ラベルが要る段階になったら Label Studio self-host + FiftyOne | 4-3 |
| 影響 §次のアクション | 1. L0 ハーネス 2. 要件定義 ... | 1. L0 ハーネス (JSON キュー版) 2. `docs/spec/ai-draft-loop/` 要件定義 (二層スキーマ) 3. badkichi-ai に autoresearch 型の枠と `evaluate.py` 4. MLflow + DVC 導入 5. 推論の 1 コマンド化 | 上記 |
| 未決 (新規) | — | tsumiki legacy のまま使うか Dev Skills (`dev-verify`) に移るか | §3 注意 |

## 7. 出典 (主なもの)

- Claude Code docs: hooks、headless、goal、scheduled-tasks、routines、github-actions、agent-sdk、worktrees、best-practices (https://code.claude.com/docs/en/)
- Anthropic engineering: Effective harnesses for long-running agents、Building effective agents
- Claude blog: Loop engineering: getting started with loops
- GitHub: anthropics/claude-plugins-official (ralph-loop)、frankbria/ralph-claude-code、snarktank/ralph、bmad-code-org/bmad-loop、anthropics/claude-code-action、karpathy/autoresearch、WecoAI/aideml、algorithmicsuperintelligence/openevolve、gepa-ai/gepa、HumanSignal/label-studio、voxel51/fiftyone、mlflow/mlflow、iterative/dvc、qaz812345/TrackNetV3、wywyWang/CoachAI-Projects
- BFMD (2026): https://arxiv.org/abs/2603.25533
