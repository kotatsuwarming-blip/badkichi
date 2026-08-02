# shot-annotation ドッグフーディング進行メモ（セッション引き継ぎ用）

**最終更新**: 2026-08-03
**目的**: コンテキストクリア後の新セッションが、このメモだけでドッグフーディング対応を継続できる状態を保つ。

## 現在の状態

- ブランチ: `feat/shot-annotation`（PR #50 オープン、mainは未取込。PR #49 tsumikiコマンドもオープン）
- テスト: 421件 green / lint / typecheck clean
- ドッグフーディング: YouTube動画「地区センター練習」でクイック→種別→打点を実施中。
  再アノテーション用の複製は `scripts/duplicate-match-for-annotation.sql`（Supabase Dashboard で実行）

## 実行環境（重要・ハマりどころ）

- **localhost:3000 を配信しているのは `~/dev/badkichi-dev`**（CLAUDE.md記載の
  `repositries.nosync/badkichi-dev` ではない）。nohup で常駐起動済み。
- 反映手順（毎回）: feat ブランチにコミット →
  `git -C ../badkichi-dev merge feat/shot-annotation && push` →
  `git -C ~/dev/badkichi-dev pull --no-rebase /Users/kazuyakotake/Documents/repositries.nosync/badkichi-dev dev`
  → HMR反映（ユーザーはリロード）
- DB: dev環境（migrate-dev CIがdevブランチpushで適用）。end_reasonは6値(floor統合)適用済み

## 確定済みの仕様（再議論不要）

- クイックパス: 通し方式（決着窓[前1s/後2.5s]を1回再生→自動停止→入力→次へ）。決定打種別入力なし
- end_reason 6値: floor/net/not_over/body/service_fault/unknown。in/outは最終接触者+point_winnerから導出(deriveInOut)
- **打点パスの入力仕様（2026-08-03確認）: 種別キーを押す（前進しない）→ 打点をクリック（種別+打点が確定し次ショットへ前進）**。handトグルON時はShift=バック
- ショット挿入/削除は種別・打点両パスにあり。undo(Backspace/↩)は位置復元つき(undoAndReposition)
- ラリー一覧ジャンプはwatcher任せにせず動画を明示駆動(jumpToRally)

## 未解決バグ（次セッションの最優先）

1. **打点パスで、注釈済みのラリーへラリー一覧から戻れない**（2026-08-03報告、fc19043適用後も再現）。
   - 期待挙動: 戻ると打点マーカーが表示された状態になり、再クリックで上書きできる（以前は動いていた）
   - 調査手順: ユーザーに再現してもらいブラウザコンソール(F12)のエラーを確認。
     関連コード: annotate.vue jumpToRally/seekPositionAnchor、usePositionPass.goToRally/entries
   - 仮説候補: entriesの再構築タイミング / goToRallyのindexは動くがUI別要因 / 例外の握り潰し

## 改善バックログ（優先度順）

- 上記バグ修正
- ThumbStrip の canvas 静止画化（ローカル動画時。v1は候補時刻シーク方式）
- スマホの「打った+位置同時タップ」記録モード（保留中。REQ-407改訂が前提）
- D6初期値の継続調整（キー順・窓幅など。ローカル動画での打点パスは未検証）
- ドッグフーディング完了後: PR #50 更新内容の最終確認→マージ、スタッツ側(docs/spec-shot-stats)との整合共有
  （end_reason 6値化とin/out導出は shot-stats の note に未反映。別セッションが仕様策定中の可能性あり）

## 新セッションの起動プロンプト例

```
docs/implements/shot-annotation/dogfooding-notes.md を読んで、shot-annotation の
ドッグフーディング対応を継続して。ブランチは feat/shot-annotation。
まず未解決バグ1(打点パスで注釈済みラリーへ戻れない)から。
```
