-- ========================================
-- data-foundation データベーススキーマ
-- ========================================
--
-- 作成日: 2026-04-22
-- 関連設計: architecture.md
-- 関連要件: docs/spec/data-foundation/requirements.md
--
-- 信頼性レベル:
-- 🔵 青信号: PRD §5.2・要件定義書・ヒアリングで確実
-- 🟡 黄信号: 妥当な推測
-- 🔴 赤信号: 推測
--
-- 全テーブルに deleted_at timestamptz NULL を含む (REQ-405)
-- MVP では deleted_at は常に NULL (REQ-402)
--

-- ========================================
-- 拡張機能
-- ========================================

-- 🔵 UUID 生成に必要 (PostgreSQL 標準)
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ========================================
-- ヘルパー関数
-- ========================================

-- 🔵 updated_at 自動更新トリガー関数 (共通パターン)
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 🔵 RLS ヘルパー: ログイン中ユーザーが指定 group_id に所属しているか (ヒアリング 2026-04-20 Q2)
CREATE OR REPLACE FUNCTION is_member_of(target_group_id uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM group_members
    WHERE group_id = target_group_id
      AND user_id = auth.uid()
      AND deleted_at IS NULL
  );
$$;

-- ========================================
-- テーブル定義
-- ========================================

-- 🔵 groups: グループマスタ (PRD §5.2)
-- 組織としての所属単位（例: ○○バドミントンクラブ）
CREATE TABLE groups (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name       text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  -- 🔵 ⑩ A-3: 名前文字数制限 (1〜50 文字、trim 後)
  CONSTRAINT groups_name_length_check
    CHECK (char_length(trim(name)) BETWEEN 1 AND 50)
);

CREATE TRIGGER trg_groups_updated_at
  BEFORE UPDATE ON groups
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- 🔵 group_members: ユーザーと Group の多対多 (PRD §5.2)
-- 1 ユーザーは複数 Group に所属可能 (EDGE-102)
CREATE TABLE group_members (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id   uuid NOT NULL REFERENCES groups(id),
  user_id    uuid NOT NULL REFERENCES auth.users(id),
  joined_at  timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  UNIQUE (group_id, user_id)  -- 🔵 EDGE-002: 二重参加防止
);

CREATE TRIGGER trg_group_members_updated_at
  BEFORE UPDATE ON group_members
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- 🔵 group_invitations: 招待コード (ヒアリング 2026-04-16 Q3, Q7)
CREATE TABLE group_invitations (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id   uuid NOT NULL REFERENCES groups(id),
  code       text NOT NULL UNIQUE,  -- 🔵 NFR-103: text 型で将来拡張可能
  created_by uuid NOT NULL REFERENCES auth.users(id),
  expires_at timestamptz NOT NULL,  -- 🔵 EDGE-101: 発行時刻 + 7 日
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);

CREATE TRIGGER trg_group_invitations_updated_at
  BEFORE UPDATE ON group_invitations
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- 🔵 players: 選手マスタ (PRD §5.2)
CREATE TABLE players (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id   uuid NOT NULL REFERENCES groups(id),
  name       text NOT NULL,
  handedness text NOT NULL DEFAULT 'unknown'
    CHECK (handedness IN ('right', 'left', 'unknown')),  -- 🔵 PRD: 利き手
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  -- 🔵 ⑩ A-3: 名前文字数制限 (1〜50 文字、trim 後)
  CONSTRAINT players_name_length_check
    CHECK (char_length(trim(name)) BETWEEN 1 AND 50),
  -- 🔵 ④ B-10: matches からの複合 FK 用 UNIQUE (group_id, id)
  CONSTRAINT players_group_id_id_key UNIQUE (group_id, id)
);

CREATE TRIGGER trg_players_updated_at
  BEFORE UPDATE ON players
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- 🔵 matches: 試合マスタ (PRD §5.2)
-- ④ B-10: 4 選手は player レベルで「全員別人」かつ「同一 Group 所属」を強制
CREATE TABLE matches (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id            uuid NOT NULL REFERENCES groups(id),
  team_a_player1_id   uuid NOT NULL,
  team_a_player2_id   uuid NOT NULL,
  team_b_player1_id   uuid NOT NULL,
  team_b_player2_id   uuid NOT NULL,
  video_source_type   text NOT NULL CHECK (video_source_type IN ('youtube', 'local')),
  video_source_url    text NOT NULL,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),
  deleted_at          timestamptz,
  -- 🔵 ④ B-10 (案1): 4 選手が全員別人であることを強制 (6-way 不等号)
  CONSTRAINT matches_players_distinct_check CHECK (
    team_a_player1_id <> team_a_player2_id
    AND team_b_player1_id <> team_b_player2_id
    AND team_a_player1_id <> team_b_player1_id
    AND team_a_player1_id <> team_b_player2_id
    AND team_a_player2_id <> team_b_player1_id
    AND team_a_player2_id <> team_b_player2_id
  ),
  -- 🔵 ④ B-10 (案2): 複合 FK で同一 Group 境界を DB レベルで強制
  FOREIGN KEY (group_id, team_a_player1_id) REFERENCES players(group_id, id),
  FOREIGN KEY (group_id, team_a_player2_id) REFERENCES players(group_id, id),
  FOREIGN KEY (group_id, team_b_player1_id) REFERENCES players(group_id, id),
  FOREIGN KEY (group_id, team_b_player2_id) REFERENCES players(group_id, id)
);

CREATE TRIGGER trg_matches_updated_at
  BEFORE UPDATE ON matches
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- 🔵 sets: セット (PRD §5.2)
-- ② B-7: score_team_a/b は削除し、rallies.point_winner の COUNT で導出する
CREATE TABLE sets (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  match_id       uuid NOT NULL REFERENCES matches(id),
  set_number     smallint NOT NULL,
  target_points  smallint NOT NULL DEFAULT 21,
  enable_deuce   boolean NOT NULL DEFAULT true,   -- 🔵 rule-engine types.ts: SetConfig
  deuce_point_cap smallint NOT NULL DEFAULT 30,   -- 🔵 rule-engine types.ts: SetConfig
  first_serving_team text NOT NULL CHECK (first_serving_team IN ('A', 'B')),
  -- 🔵 ② B-7: セット開始時のカメラ手前チーム (NULL = カメラ向き不明での開始を許容)
  camera_near_team_at_start text CHECK (camera_near_team_at_start IN ('A', 'B')),
  winner         text CHECK (winner IN ('A', 'B')),  -- NULL = 未決着
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now(),
  deleted_at     timestamptz,
  UNIQUE (match_id, set_number)
);

CREATE TRIGGER trg_sets_updated_at
  BEFORE UPDATE ON sets
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- 🔵 set_player_positions: セット開始時の選手立ち位置 (PRD §5.2)
-- ダブルスでは 1 セットあたり 4 行
CREATE TABLE set_player_positions (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  set_id     uuid NOT NULL REFERENCES sets(id),
  player_id  uuid NOT NULL REFERENCES players(id),
  team       text NOT NULL CHECK (team IN ('A', 'B')),
  position   text NOT NULL CHECK (position IN ('left', 'right')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  UNIQUE (set_id, player_id),
  -- 🔵 ⑤ B-11: セット内の (team, position) スロットは一意 (4 スロット重複防止)
  CONSTRAINT set_player_positions_set_team_position_unique
    UNIQUE (set_id, team, position)
);

CREATE TRIGGER trg_set_player_positions_updated_at
  BEFORE UPDATE ON set_player_positions
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- 🔵 rallies: ラリー (PRD §5.2)
-- ② B-7: score_team_a_after / score_team_b_after は削除、serving_team / server_position /
--        camera_near_team を追加 (rule-engine 導出値を denormalize 保存)
-- ③ B-9: server_player_id / receiver_player_id を NOT NULL に変更
-- ⑥ B-14: video_start_timestamp を ms 単位の integer に変更 (float の等値比較を回避)
CREATE TABLE rallies (
  id                       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  set_id                   uuid NOT NULL REFERENCES sets(id),
  rally_number             smallint NOT NULL,  -- セット内の連番
  -- 🔵 ② B-7 / 設計原則 5: ラリー記録の必須条件 (サーブチーム + サーブ位置 + サーバー/レシーバー)
  serving_team             text NOT NULL CHECK (serving_team IN ('A', 'B')),
  server_position          text NOT NULL CHECK (server_position IN ('left', 'right')),
  server_player_id         uuid NOT NULL REFERENCES players(id),
  receiver_player_id       uuid NOT NULL REFERENCES players(id),
  -- 🔵 ② B-7 / 設計原則 9: カメラ視点 (NULL = カメラ向き不明で記録するケースを許容)
  camera_near_team         text CHECK (camera_near_team IN ('A', 'B')),
  -- 🔵 ⑥ B-14: ms 単位 integer (NULL = 動画アラインメントなしで記録)
  video_start_timestamp_ms integer,
  point_winner             text CHECK (point_winner IN ('A', 'B')),  -- NULL = レット or 未確定
  is_let                   boolean NOT NULL DEFAULT false,
  is_point_confirmed       boolean NOT NULL DEFAULT false,
  created_at               timestamptz NOT NULL DEFAULT now(),
  updated_at               timestamptz NOT NULL DEFAULT now(),
  deleted_at               timestamptz,
  UNIQUE (set_id, rally_number)
);

CREATE TRIGGER trg_rallies_updated_at
  BEFORE UPDATE ON rallies
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- 🔵 shots: ショット (PRD §5.2)
-- ⑥ B-14: video_timestamp を ms 単位の integer に変更
CREATE TABLE shots (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  rally_id           uuid NOT NULL REFERENCES rallies(id),
  shot_number        smallint NOT NULL,  -- ラリー内の連番
  video_timestamp_ms integer,  -- 🔵 ⑥ B-14: ms 単位 integer (NULL 許容)
  input_source       text NOT NULL DEFAULT 'manual'
    CHECK (input_source IN ('manual', 'ai')),  -- 🔵 PRD: 将来の AI 拡張用
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now(),
  deleted_at         timestamptz,
  UNIQUE (rally_id, shot_number)
);

CREATE TRIGGER trg_shots_updated_at
  BEFORE UPDATE ON shots
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- 🔵 position_overrides: 左右入れ替わりミスの記録 (PRD §5.2)
-- ダブルスではペアの 2 人が必ず一緒にズレるためチーム単位
CREATE TABLE position_overrides (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  rally_id      uuid NOT NULL REFERENCES rallies(id),
  team          text NOT NULL CHECK (team IN ('A', 'B')),
  override_type text NOT NULL CHECK (override_type IN ('swapped', 'restored')),
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  deleted_at    timestamptz
);

CREATE TRIGGER trg_position_overrides_updated_at
  BEFORE UPDATE ON position_overrides
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- 🔵 recording_gaps: 動画の断絶イベント (② B-7、設計原則 6)
-- per-rally フラグではなく「ラリー数すら数えられない断絶」を別概念として独立テーブル化。
-- 同一セット内で複数 gap 許容 (UNIQUE なし)。FK は使わず after_rally_number で照合
-- (タイミング問題回避)。
CREATE TABLE recording_gaps (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  set_id               uuid NOT NULL REFERENCES sets(id),
  after_rally_number   smallint,         -- NULL = セット冒頭での断絶
  resumed_score_team_a smallint,         -- NULL = 再開時スコア不明
  resumed_score_team_b smallint,         -- NULL = 再開時スコア不明
  note                 text,
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now(),
  deleted_at           timestamptz
);

CREATE TRIGGER trg_recording_gaps_updated_at
  BEFORE UPDATE ON recording_gaps
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ========================================
-- インデックス
-- ========================================

-- 🔵 RLS パフォーマンス: group_members 検索の高速化
CREATE INDEX idx_group_members_user_id ON group_members(user_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_group_members_group_id ON group_members(group_id) WHERE deleted_at IS NULL;

-- 🔵 招待コード検索
CREATE INDEX idx_group_invitations_code ON group_invitations(code) WHERE deleted_at IS NULL;

-- 🔵 FK 参照の高速化
CREATE INDEX idx_players_group_id ON players(group_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_matches_group_id ON matches(group_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_sets_match_id ON sets(match_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_set_player_positions_set_id ON set_player_positions(set_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_rallies_set_id ON rallies(set_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_shots_rally_id ON shots(rally_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_position_overrides_rally_id ON position_overrides(rally_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_recording_gaps_set_id ON recording_gaps(set_id) WHERE deleted_at IS NULL;

-- ========================================
-- Row Level Security (RLS)
-- ========================================

-- 🔵 全テーブルで RLS 有効化 (NFR-104)
ALTER TABLE groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE group_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE group_invitations ENABLE ROW LEVEL SECURITY;
ALTER TABLE players ENABLE ROW LEVEL SECURITY;
ALTER TABLE matches ENABLE ROW LEVEL SECURITY;
ALTER TABLE sets ENABLE ROW LEVEL SECURITY;
ALTER TABLE set_player_positions ENABLE ROW LEVEL SECURITY;
ALTER TABLE rallies ENABLE ROW LEVEL SECURITY;
ALTER TABLE shots ENABLE ROW LEVEL SECURITY;
ALTER TABLE position_overrides ENABLE ROW LEVEL SECURITY;
ALTER TABLE recording_gaps ENABLE ROW LEVEL SECURITY;

-- 🔵 ⑦ A-1 + A-2: groups / group_members の直接 INSERT は禁止。
--    Group 作成 + 自己加入は `create_group_with_owner` RPC で原子化。
--    招待コード経由の参加は `join_group_with_code` RPC で行う。
-- groups: 所属メンバーのみ閲覧・更新可能。INSERT は RPC 経由のみ。
CREATE POLICY "groups_select" ON groups FOR SELECT
  USING (is_member_of(id));
CREATE POLICY "groups_update" ON groups FOR UPDATE
  USING (is_member_of(id));
-- 🔵 INSERT ポリシーは設定しない (RPC `create_group_with_owner` SECURITY DEFINER 経由のみ)

-- group_members: 所属 Group のメンバー一覧を閲覧可能。
-- INSERT は `create_group_with_owner` / `join_group_with_code` RPC 経由のみ。
CREATE POLICY "group_members_select" ON group_members FOR SELECT
  USING (is_member_of(group_id));
-- 🔵 INSERT ポリシーは設定しない (RPC 経由のみ)

-- group_invitations: 所属 Group の招待コードを閲覧可能。発行は DB 関数経由
CREATE POLICY "group_invitations_select" ON group_invitations FOR SELECT
  USING (is_member_of(group_id));
-- 🔵 INSERT/検証は rpc 関数 (SECURITY DEFINER) 経由で行うため直接ポリシー不要

-- players: 所属 Group の選手のみ
CREATE POLICY "players_select" ON players FOR SELECT
  USING (is_member_of(group_id));
CREATE POLICY "players_insert" ON players FOR INSERT
  WITH CHECK (is_member_of(group_id));
CREATE POLICY "players_update" ON players FOR UPDATE
  USING (is_member_of(group_id));

-- matches: 所属 Group の試合のみ
CREATE POLICY "matches_select" ON matches FOR SELECT
  USING (is_member_of(group_id));
CREATE POLICY "matches_insert" ON matches FOR INSERT
  WITH CHECK (is_member_of(group_id));
CREATE POLICY "matches_update" ON matches FOR UPDATE
  USING (is_member_of(group_id));

-- sets: FK 経由で Group をチェック
CREATE POLICY "sets_select" ON sets FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM matches WHERE matches.id = sets.match_id AND is_member_of(matches.group_id)
  ));
CREATE POLICY "sets_insert" ON sets FOR INSERT
  WITH CHECK (EXISTS (
    SELECT 1 FROM matches WHERE matches.id = match_id AND is_member_of(matches.group_id)
  ));
CREATE POLICY "sets_update" ON sets FOR UPDATE
  USING (EXISTS (
    SELECT 1 FROM matches WHERE matches.id = sets.match_id AND is_member_of(matches.group_id)
  ));

-- set_player_positions: FK 経由 sets → matches
CREATE POLICY "spp_select" ON set_player_positions FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM sets JOIN matches ON matches.id = sets.match_id
    WHERE sets.id = set_player_positions.set_id AND is_member_of(matches.group_id)
  ));
CREATE POLICY "spp_insert" ON set_player_positions FOR INSERT
  WITH CHECK (EXISTS (
    SELECT 1 FROM sets JOIN matches ON matches.id = sets.match_id
    WHERE sets.id = set_id AND is_member_of(matches.group_id)
  ));
CREATE POLICY "spp_update" ON set_player_positions FOR UPDATE
  USING (EXISTS (
    SELECT 1 FROM sets JOIN matches ON matches.id = sets.match_id
    WHERE sets.id = set_player_positions.set_id AND is_member_of(matches.group_id)
  ));

-- rallies: FK 経由 sets → matches
CREATE POLICY "rallies_select" ON rallies FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM sets JOIN matches ON matches.id = sets.match_id
    WHERE sets.id = rallies.set_id AND is_member_of(matches.group_id)
  ));
CREATE POLICY "rallies_insert" ON rallies FOR INSERT
  WITH CHECK (EXISTS (
    SELECT 1 FROM sets JOIN matches ON matches.id = sets.match_id
    WHERE sets.id = set_id AND is_member_of(matches.group_id)
  ));
CREATE POLICY "rallies_update" ON rallies FOR UPDATE
  USING (EXISTS (
    SELECT 1 FROM sets JOIN matches ON matches.id = sets.match_id
    WHERE sets.id = rallies.set_id AND is_member_of(matches.group_id)
  ));

-- shots: FK 経由 rallies → sets → matches
CREATE POLICY "shots_select" ON shots FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM rallies JOIN sets ON sets.id = rallies.set_id
    JOIN matches ON matches.id = sets.match_id
    WHERE rallies.id = shots.rally_id AND is_member_of(matches.group_id)
  ));
CREATE POLICY "shots_insert" ON shots FOR INSERT
  WITH CHECK (EXISTS (
    SELECT 1 FROM rallies JOIN sets ON sets.id = rallies.set_id
    JOIN matches ON matches.id = sets.match_id
    WHERE rallies.id = rally_id AND is_member_of(matches.group_id)
  ));
CREATE POLICY "shots_update" ON shots FOR UPDATE
  USING (EXISTS (
    SELECT 1 FROM rallies JOIN sets ON sets.id = rallies.set_id
    JOIN matches ON matches.id = sets.match_id
    WHERE rallies.id = shots.rally_id AND is_member_of(matches.group_id)
  ));

-- position_overrides: FK 経由 rallies → sets → matches
CREATE POLICY "po_select" ON position_overrides FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM rallies JOIN sets ON sets.id = rallies.set_id
    JOIN matches ON matches.id = sets.match_id
    WHERE rallies.id = position_overrides.rally_id AND is_member_of(matches.group_id)
  ));
CREATE POLICY "po_insert" ON position_overrides FOR INSERT
  WITH CHECK (EXISTS (
    SELECT 1 FROM rallies JOIN sets ON sets.id = rallies.set_id
    JOIN matches ON matches.id = sets.match_id
    WHERE rallies.id = rally_id AND is_member_of(matches.group_id)
  ));
CREATE POLICY "po_update" ON position_overrides FOR UPDATE
  USING (EXISTS (
    SELECT 1 FROM rallies JOIN sets ON sets.id = rallies.set_id
    JOIN matches ON matches.id = sets.match_id
    WHERE rallies.id = position_overrides.rally_id AND is_member_of(matches.group_id)
  ));

-- 🔵 recording_gaps: FK 経由 sets → matches (② B-7)
-- DELETE は MVP 対象外 (REQ-402)
CREATE POLICY "recording_gaps_select" ON recording_gaps FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM sets JOIN matches ON matches.id = sets.match_id
    WHERE sets.id = recording_gaps.set_id AND is_member_of(matches.group_id)
  ));
CREATE POLICY "recording_gaps_insert" ON recording_gaps FOR INSERT
  WITH CHECK (EXISTS (
    SELECT 1 FROM sets JOIN matches ON matches.id = sets.match_id
    WHERE sets.id = set_id AND is_member_of(matches.group_id)
  ));
CREATE POLICY "recording_gaps_update" ON recording_gaps FOR UPDATE
  USING (EXISTS (
    SELECT 1 FROM sets JOIN matches ON matches.id = sets.match_id
    WHERE sets.id = recording_gaps.set_id AND is_member_of(matches.group_id)
  ));

-- ========================================
-- DB 関数: Group 作成 + 自己加入の原子化
-- ========================================

-- 🔵 ⑦ A-1 + A-2: Group 作成と作成者の group_members 追加を 1 トランザクションで原子化。
-- groups / group_members の INSERT ポリシーを削除した代替手段として SECURITY DEFINER で実行。
-- ⑩ A-3: group_name は 1〜50 文字 (trim 後) を強制 (groups テーブル CHECK と整合)。
CREATE OR REPLACE FUNCTION create_group_with_owner(group_name text)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  new_group_id uuid;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  IF group_name IS NULL
     OR char_length(trim(group_name)) < 1
     OR char_length(trim(group_name)) > 50 THEN
    RAISE EXCEPTION 'invalid_group_name';
  END IF;

  INSERT INTO groups (name) VALUES (trim(group_name)) RETURNING id INTO new_group_id;
  INSERT INTO group_members (group_id, user_id) VALUES (new_group_id, auth.uid());

  RETURN new_group_id;
END;
$$;

-- ========================================
-- DB 関数: 招待コード
-- ========================================

-- 🔵 招待コード発行 (REQ-102, NFR-103, EDGE-101)
-- ⑧ B-12: UNIQUE 衝突をリトライ (最大 5 回) で透過回復。ランダム源は CSPRNG (gen_random_uuid)。
--         全リトライ失敗時は `invitation_code_collision_after_retry` 例外をスロー。
CREATE OR REPLACE FUNCTION generate_invitation_code(target_group_id uuid)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  new_code text;
  attempt int := 0;
  max_attempts constant int := 5;
BEGIN
  IF NOT is_member_of(target_group_id) THEN
    RAISE EXCEPTION 'not_a_member';
  END IF;

  LOOP
    attempt := attempt + 1;
    -- 🔵 CSPRNG (gen_random_uuid は /dev/urandom 由来) から 8 hex 文字を抽出
    new_code := upper(substring(replace(gen_random_uuid()::text, '-', '') from 1 for 8));

    BEGIN
      INSERT INTO group_invitations (group_id, code, created_by, expires_at)
      VALUES (target_group_id, new_code, auth.uid(), now() + interval '7 days');
      RETURN new_code;
    EXCEPTION WHEN unique_violation THEN
      IF attempt >= max_attempts THEN
        RAISE EXCEPTION 'invitation_code_collision_after_retry';
      END IF;
      -- それ以外はループ継続
    END;
  END LOOP;
END;
$$;

-- 🔵 招待コードで Group 参加 (REQ-103, EDGE-001, EDGE-002)
CREATE OR REPLACE FUNCTION join_group_with_code(invite_code text)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  invitation_record record;
  target_group_id uuid;
BEGIN
  SELECT * INTO invitation_record
  FROM group_invitations
  WHERE code = invite_code AND deleted_at IS NULL;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'invitation_not_found';
  END IF;

  IF invitation_record.expires_at < now() THEN
    RAISE EXCEPTION 'invitation_expired';
  END IF;

  target_group_id := invitation_record.group_id;

  INSERT INTO group_members (group_id, user_id)
  VALUES (target_group_id, auth.uid());
  -- ユニーク制約 (group_id, user_id) で二重参加を防止

  RETURN target_group_id;
END;
$$;

-- ========================================
-- 信頼性レベルサマリー
-- ========================================
-- 🔵 青信号: 11 テーブル + 5 関数 + RLS + インデックス = 全項目
-- 🟡 黄信号: 0 件
-- 🔴 赤信号: 0 件
--
-- 品質評価: 高品質
