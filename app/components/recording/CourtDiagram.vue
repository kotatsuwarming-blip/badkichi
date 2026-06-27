<script setup lang="ts">
/**
 * CourtDiagram.vue — コート図で 4 選手の立ち位置を可視化する presentational component。
 *
 * 関連: TASK-0012 / docs/design/match-recording/ui-design.md「コート図」/ 立ち位置表示
 * 方針:
 *   - rule-engine の positions を上下 2 チームで描画。camera_near_team を手前 (下)、相手を奥 (上)。
 *     null は A を手前の既定 (ui-design.md)。
 *   - サーバーを🏸(シャトル)で強調、レシーバーを枠線で示す。override で left/right が入れ替わると表示も入れ替わる。
 *   - 選手名は names マップで解決 (presentational、session 非依存でテスト容易)。
 *   - 左右ミラー補正は MVP では行わない (実装時プロトタイプで調整、ui-design.md)。
 */
import { computed } from 'vue'
import type { CourtSide, PlayerId, Team, TeamPositions } from '~/utils/rule-engine/types'

const props = defineProps<{
  positions: TeamPositions
  servingTeam: Team
  server: PlayerId
  receiver: PlayerId
  cameraNearTeam: Team | null
  names: Record<PlayerId, string>
}>()

const nearTeam = computed<Team>(() => props.cameraNearTeam ?? 'A')
const farTeam = computed<Team>(() => (nearTeam.value === 'A' ? 'B' : 'A'))

function posOf(team: Team): { left: PlayerId, right: PlayerId } {
  return team === 'A' ? props.positions.teamA : props.positions.teamB
}

function cell(team: Team, side: CourtSide) {
  const id = posOf(team)[side]
  return {
    id,
    name: props.names[id] ?? id,
    isServer: id === props.server,
    isReceiver: id === props.receiver
  }
}

// 手前チームは背後から見るため left/right が画面の左/右と一致。
// 奥チームは正面から見るため左右がミラー（反転）する → right(偶数側=ファースト)を画面左に出す。
const farCells = computed(() => [cell(farTeam.value, 'right'), cell(farTeam.value, 'left')])
const nearCells = computed(() => [cell(nearTeam.value, 'left'), cell(nearTeam.value, 'right')])

// サーバー→レシーバーの斜め矢印用に、4 表示セルへ画面上の座標 (%) を割り当てる。
// far-row が上 (y≈22%)、near-row が下 (y≈78%)、左右セルは x≈25% / 75%。
const arrow = computed(() => {
  const layout = [
    { ...farCells.value[0], x: 25, y: 22 },
    { ...farCells.value[1], x: 75, y: 22 },
    { ...nearCells.value[0], x: 25, y: 78 },
    { ...nearCells.value[1], x: 75, y: 78 }
  ]
  const from = layout.find(c => c.isServer)
  const to = layout.find(c => c.isReceiver)
  return from && to ? { from, to } : null
})
</script>

<template>
  <div
    class="court-diagram"
    data-testid="court-diagram"
  >
    <p class="court-label">
      {{ $t('record.court.far') }}: {{ $t(`record.team.${farTeam}`) }}
    </p>
    <div class="court">
      <div class="court-row far-row">
        <div
          v-for="c in farCells"
          :key="c.id"
          class="court-cell"
          :class="{ 'is-server': c.isServer, 'is-receiver': c.isReceiver }"
          :data-testid="`cell-${c.id}`"
        >
          <svg
            v-if="c.isServer"
            class="server-mark"
            viewBox="0 0 24 24"
            aria-hidden="true"
          >
            <path
              class="shuttle-skirt"
              d="M12 2 L18 15 L6 15 Z"
            />
            <path
              class="shuttle-feather"
              d="M12 2 V15 M9.3 7.5 L8.8 15 M14.7 7.5 L15.2 15"
            />
            <circle
              class="shuttle-cork"
              cx="12"
              cy="17.5"
              r="2.6"
            />
          </svg>
          <span class="cell-name">{{ c.name }}</span>
          <span
            v-if="c.isServer"
            class="cell-role"
          >{{ $t('record.court.serve') }}</span>
          <span
            v-else-if="c.isReceiver"
            class="cell-role"
          >{{ $t('record.court.receive') }}</span>
        </div>
      </div>
      <div class="service-line" />
      <div class="court-net">
        <span class="net-label">{{ $t('record.court.net') }}</span>
      </div>
      <div class="service-line" />
      <div class="court-row near-row">
        <div
          v-for="c in nearCells"
          :key="c.id"
          class="court-cell"
          :class="{ 'is-server': c.isServer, 'is-receiver': c.isReceiver }"
          :data-testid="`cell-${c.id}`"
        >
          <svg
            v-if="c.isServer"
            class="server-mark"
            viewBox="0 0 24 24"
            aria-hidden="true"
          >
            <path
              class="shuttle-skirt"
              d="M12 2 L18 15 L6 15 Z"
            />
            <path
              class="shuttle-feather"
              d="M12 2 V15 M9.3 7.5 L8.8 15 M14.7 7.5 L15.2 15"
            />
            <circle
              class="shuttle-cork"
              cx="12"
              cy="17.5"
              r="2.6"
            />
          </svg>
          <span class="cell-name">{{ c.name }}</span>
          <span
            v-if="c.isServer"
            class="cell-role"
          >{{ $t('record.court.serve') }}</span>
          <span
            v-else-if="c.isReceiver"
            class="cell-role"
          >{{ $t('record.court.receive') }}</span>
        </div>
      </div>
      <svg
        v-if="arrow"
        class="serve-arrow"
        preserveAspectRatio="none"
        aria-hidden="true"
        data-testid="serve-arrow"
      >
        <defs>
          <marker
            id="serve-arrowhead"
            markerWidth="6"
            markerHeight="6"
            refX="5"
            refY="3"
            orient="auto"
          >
            <path
              d="M0 0 L6 3 L0 6 Z"
              fill="#ffd54f"
            />
          </marker>
        </defs>
        <line
          :x1="`${arrow.from.x}%`"
          :y1="`${arrow.from.y}%`"
          :x2="`${arrow.to.x}%`"
          :y2="`${arrow.to.y}%`"
          stroke="#ffd54f"
          stroke-width="2"
          stroke-linecap="round"
          marker-end="url(#serve-arrowhead)"
        />
      </svg>
    </div>
    <p class="court-label">
      {{ $t('record.court.near') }}: {{ $t(`record.team.${nearTeam}`) }}
    </p>
  </div>
</template>

<style scoped>
.court-diagram { display: flex; flex-direction: column; gap: 0.25rem; align-items: center; }
.court-label { font-size: 0.75rem; color: var(--ui-text-muted); }

/* バドミントンコート風: 緑面 + 白ライン */
.court {
  position: relative; /* serve-arrow オーバーレイの基準 */
  width: 100%;
  max-width: 18rem;
  background: #2e7d4f;
  border: 3px solid #fff; /* 外側の境界線 (ダブルスサイドライン) */
  border-radius: 2px;
  overflow: hidden;
  box-shadow: 0 1px 4px rgba(0, 0, 0, 0.2);
}

/* 各ハーフ = 左右サービスコート。セル間の縦線 = センターライン */
.court-row { display: grid; grid-template-columns: 1fr 1fr; }
.court-cell {
  position: relative;
  min-height: 3.5rem;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 0.125rem;
  color: #fff;
  font-size: 0.8125rem;
  text-shadow: 0 1px 1px rgba(0, 0, 0, 0.35);
}
/* センターライン (左右の境) と外周内側のライン */
.court-cell + .court-cell { border-left: 2px solid rgba(255, 255, 255, 0.9); }
.cell-name { font-weight: 600; }

.court-cell.is-server { background: var(--ui-primary); color: #1a1a1a; text-shadow: none; }
.court-cell.is-server .cell-name { font-weight: 800; }

/* ショートサービスライン (ネット手前の白線) */
.service-line { height: 2px; background: rgba(255, 255, 255, 0.9); }

/* ネット: メッシュ柄 + ラベル + 両端ポスト */
.court-net {
  position: relative;
  height: 1.1rem;
  background:
    repeating-linear-gradient(90deg, rgba(255, 255, 255, 0.85) 0 1px, transparent 1px 5px),
    repeating-linear-gradient(0deg, rgba(255, 255, 255, 0.85) 0 1px, transparent 1px 5px);
  background-color: #1f5c3a;
  border-top: 3px solid #fff;
  border-bottom: 3px solid #fff;
}
.net-label {
  position: absolute;
  left: 50%;
  top: 50%;
  transform: translate(-50%, -50%);
  font-size: 0.625rem;
  font-weight: 700;
  letter-spacing: 0.1em;
  color: #1a1a1a;
  background: #fff;
  padding: 0 0.4rem;
  border-radius: 2px;
}
/* サーバー印: 羽根 (シャトル) だけのアイコン。ラケットは描かない (U-01) */
.server-mark { width: 1.25rem; height: 1.25rem; display: block; }
.shuttle-skirt { fill: #fff; stroke: #1a1a1a; stroke-width: 1; stroke-linejoin: round; }
.shuttle-feather { stroke: #1a1a1a; stroke-width: 0.8; fill: none; }
.shuttle-cork { fill: #d84315; stroke: #1a1a1a; stroke-width: 1; }

/* サーブ / レシーブ の役割ラベル (名前の下) */
.cell-role { font-size: 0.625rem; line-height: 1; opacity: 0.85; }

/* サーバー→レシーバーの斜め矢印 (誰が誰に打つか) */
.serve-arrow { position: absolute; inset: 0; width: 100%; height: 100%; pointer-events: none; }
</style>
