# player-management 受け入れ基準

**作成日**: 2026-06-01
**関連要件定義**: [requirements.md](requirements.md)
**関連ユーザストーリー**: [user-stories.md](user-stories.md)
**ヒアリング記録**: [interview-record.md](interview-record.md)

**【信頼性レベル凡例】**:
- 🔵 確定スキーマ/ADR・ヒアリングを参考にした確実な基準
- 🟡 設計文書・ヒアリングから妥当な推測による基準
- 🔴 出典のない推測による基準

> **テスト方針**: 最小境界値 + 分岐網羅のみ（冗長ケースは作らない / memory feedback_test_coverage）。

---

## REQ-001: 選手一覧表示 🔵

**信頼性**: 🔵 *players_select RLS + ADR-006*

### Given
- ログイン済み・Group 所属済みユーザー
### When
- 選手管理画面を開く
### Then
- 所属 Group の `deleted_at IS NULL` の選手のみが表示される

### テストケース
- [ ] **TC-001-01**: 所属 Group の選手のみ表示・他 Group の選手は非表示 🔵 *RLS / 境界(自Group内外)*
- [ ] **TC-001-02**: 削除済み選手は一覧に出ない 🔵 *EDGE-005*
- [ ] **TC-001-03**: 選手0人で空状態の説明文 + 「選手を追加」CTA が出る 🔵 *REQ-201（ヒアリング2026-06-01）*

---

## REQ-002 / REQ-101 / REQ-102: 選手追加と name 検証 🔵

**信頼性**: 🔵 *players_insert + players_name_length_check + ヒアリング*

### Given
- Group メンバー
### When
- name（+任意 handedness）を入力して保存
### Then
- players へ insert され一覧に追加される

### テストケース
#### 正常系
- [ ] **TC-002-01**: name のみ入力 → handedness=unknown で登録成功 🔵 *EDGE-003*
- [ ] **TC-002-02**: 同名選手が既存でも登録成功・一覧に2行 🔵 *REQ-102 / EDGE-004*
#### 異常系・境界値
- [ ] **TC-002-B01**: name trim 後 1 字 → 成功 / 0 字（空白のみ含む）→ 拒否 🔵 *EDGE-001 / CHECK 下限*
- [ ] **TC-002-B02**: name trim 後 50 字 → 成功 / 51 字 → 拒否 🔵 *EDGE-002 / CHECK 上限*

---

## REQ-003: 選手編集 🔵

**信頼性**: 🔵 *players_update RLS*

### Given
- 既存選手
### When
- name / handedness を変更して保存
### Then
- update され一覧に反映される

### テストケース
- [ ] **TC-003-01**: name / handedness の更新が反映される 🔵
- [ ] **TC-003-B01**: 編集時も name 1〜50字の境界検証が効く 🔵 *REQ-101 再適用*

---

## REQ-004 / REQ-103 / REQ-104: ソフト削除 🔵

**信頼性**: 🔵 *no DELETE policy + ヒアリング2026-06-01*

### Given
- 既存選手（試合参照あり/なし）
### When
- 削除を実行
### Then
- 確認なしで `deleted_at` が設定され、一覧から消える。過去試合は維持される

### テストケース
- [ ] **TC-004-01**: 削除実行 → 確認ダイアログ無し・`deleted_at` 設定・一覧から消える 🔵 *REQ-103*
- [ ] **TC-004-02**: 試合参照中の選手を削除 → 成功し、過去 matches の参照（player.id）は維持 🔵 *REQ-104 / EDGE-006*

---

## 非機能要件テスト

### NFR-101: セキュリティ（RLS） 🔵
- [ ] **TC-NFR-101-01**: 他 Group の選手に対する select/insert/update がいずれも不可 🔵 *is_member_of(group_id)*

### NFR-001: パフォーマンス（構造的保証） 🔵
- [ ] **TC-NFR-001-01**: 一覧取得クエリが `deleted_at IS NULL` 条件を含み、部分インデックス `idx_players_group_id` の対象となる 🔵 *initial_schema.sql:289*

---

## テストケースサマリー

| カテゴリ | 正常系 | 異常系/境界 | 合計 |
|---------|--------|------------|------|
| 機能要件 | 6 | 4 | 10 |
| 非機能要件 | 2 | 0 | 2 |
| **合計** | 8 | 4 | 12 |

### 信頼性レベル分布
- 🔵 青信号: 12件 (100%)
- 🟡 黄信号: 0件 (0%)
- 🔴 赤信号: 0件 (0%)

**品質評価**: 高品質（確定スキーマ + ヒアリングにより全件 🔵）

### 優先度別
- **Must Have**: 機能要件テスト全件 + NFR-101 + NFR-001（構造的保証）
