# player-management 設計ヒアリング記録

**作成日**: 2026-06-02
**ヒアリング実施**: step4 既存情報ベースの差分ヒアリング

## ヒアリング目的

requirements.md（🔵100%）と既存 ADR・auth-onboarding 設計を出発点に、設計で未確定だった
2 点（ルートパス・追加/編集フォームの形式）を確定するためヒアリングを実施した。

## 設計前に確定できた事項（ADR/既存設計の踏襲、質問不要）

| 設計項目 | 決定 | 出典 |
|---|---|---|
| composable 分割 | 操作ごとに usePlayers / useCreatePlayer / useUpdatePlayer / useDeletePlayer | ADR-007 D1 + auth-onboarding 構成 |
| Read のキャッシュ | useAsyncData('players') 固定キー、Write 後 refresh | ADR-007 D4 |
| バリデーション | Zod player-name (1〜50字 trim)、group-name.ts と同型 | REQ-101 / 既存 schema |
| layout | default（認証後、無指定自動適用） | ADR-011 D1 |
| 保護 | auth.global.ts が認証 + 所属を保証 | auth-onboarding middleware |
| エラーチャネル | 検証=inline / 通信=toast、新規エラーコード無し | error-handling.md §6 |

## 質問と回答

### Q1: 選手管理画面のルートパス

**質問日時**: 2026-06-02
**カテゴリ**: アーキテクチャ（ルーティング）
**背景**: requirements で NFR-201 と並び未確定。`/players`（最短）/ `/groups/[id]/players`（既存
settings と一貫・複数Group前方互換）/ 設定タブ内、の3案があった。ユーザーから「複数Group拡張を
考えると option 2 が良さそうだが option 1 でも拡張可能か」という確認があった。

**回答（やりとり）**:
- Claude 回答: option 1 も拡張可能だが「アクティブグループ切替型」になり、option 2 は「URLにGroup
  明示型」。両方詰まないが、決め手は **既存 `/groups/[id]/settings` との一貫性**。本当の複数Group
  対応は ADR-006（RPCガード）の見直しが本丸で、ルートは安い・可逆な保険。
- ユーザー決定: **option 2 `/groups/[id]/players` で確定**

**信頼性への影響**: ルート設計を 🔵 で確定。`[id]` は useCurrentGroup の group_id を使用。

---

### Q2: 追加・編集フォームの形式（要件 NFR-201 で設計に送った点）

**質問日時**: 2026-06-02
**カテゴリ**: アーキテクチャ（UI 構成）
**背景**: requirements で「モーダル可否は設計で決定」と送られていた。

**回答**: **モーダル（UModal）で確定**（一覧画面上で開く）

**信頼性への影響**: NFR-201 の未確定部分を 🔵 で解消。専用ページ（/players/new 等）は作らない。

---

## ヒアリング結果サマリー

### 確認できた事項
- composable 分割・キャッシュ・バリデーション・layout・保護・エラーチャネルは既存 ADR の踏襲で確定。

### 設計方針の決定事項
- ルート: `/groups/[id]/players`（既存 settings と一貫、複数Group前方互換）。
- 追加/編集: 一覧上の UModal。削除は無警告即実行。
- 新規 migration / RPC / エラーコードは不要（既存 players テーブルを消費）。

### 残課題
- なし（複数Group の本格対応は ADR-006 見直し時の別議論として明示的に分離）。

### 信頼性レベル分布

**ヒアリング前**:
- 🔵 大半（要件が🔵100%・ADR豊富） / 🟡 2（ルート・フォーム形式） / 🔴 0

**ヒアリング後**:
- 🔵 全項目 (+2) / 🟡 0 (-2) / 🔴 0

## 関連文書

- **アーキテクチャ設計**: [architecture.md](architecture.md)
- **データフロー**: [dataflow.md](dataflow.md)
- **型定義**: [interfaces.ts](interfaces.ts)
- **要件定義**: [requirements.md](../../spec/player-management/requirements.md)
