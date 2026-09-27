-- ========================================
-- player-roster-type: 選手のメンバー区分 (player-profile PR ①, REQ-001)
-- ========================================
--
-- 自チームメンバー (member) と対戦相手 (opponent) を区別する。
-- 既存行は DEFAULT で member に初期化 (ヒアリング2026-09-27。誤区分は編集で修正可能)。
-- 区分は表示・並び順にのみ影響し、試合 FK・統計 RPC には影響しない (EDGE-003)。

ALTER TABLE players
  ADD COLUMN roster_type text NOT NULL DEFAULT 'member'
    CHECK (roster_type IN ('member', 'opponent'));
