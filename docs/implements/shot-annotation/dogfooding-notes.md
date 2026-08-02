# shot-annotation ドッグフーディング進行メモ（セッション引き継ぎ用）

**最終更新**: 2026-08-03
**目的**: コンテキストクリア後の新セッションが、このメモだけでドッグフーディング対応を継続できる状態を保つ。

## 現在の状態

- ブランチ: `feat/shot-annotation`（PR #50 オープン、mainは未取込。PR #49 tsumikiコマンドもオープン）
- テスト: 422件 green / lint / typecheck clean
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

## 未解決バグ

（なし。バグ1は解決済み → 下記）

## 解決済みバグ

1. **打点パスで、注釈済みのラリーへラリー一覧から戻れない** → **f432a4a で修正済み（2026-08-03）**。
   - 根本原因: ラリージャンプの状態遷移ではなく動画層。**cued（未再生）状態の YouTube
     プレーヤーに seekTo() すると黒画面のまま固まり、以後 playVideo() が一切効かなくなる**
     （IFrame API の癖。Chrome 実機で再現・確認済み）。ページ読込直後（動画を一度も
     再生する前）にラリー一覧からジャンプすると発生し、以後何をクリックしても動かない。
     goToRally/index/マーカー表示は正常に動いていた。
   - 修正: youtube-adapter の seekToMs が status==='unstarted' のときは seekTo ではなく
     loadVideoById({videoId, startSeconds}) で実ロードする。後続の play() が成立する。
   - 検証: localhost でリロード→打点モード→未再生のままラリー#2ジャンプ →
     スローループ再生(0.5x)・種別バッジ・打点マーカー表示を確認。

## 改善バックログ（優先度順）

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
