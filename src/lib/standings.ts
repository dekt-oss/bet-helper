// 조별리그 그룹별 순위 계산 — 종료된 경기의 스코어로 승점/득실을 집계한다.

import type { Match } from '@/lib/types';
import { toKoreanTeam, koreanGroupName } from '@/lib/teams/korea';

export interface StandingRow {
  team: string; // 한글 팀명
  played: number;
  win: number;
  draw: number;
  loss: number;
  gf: number; // 득점
  ga: number; // 실점
  gd: number; // 득실차
  points: number;
}

export interface GroupStandings {
  group: string; // 예: "Group A"
  rows: StandingRow[];
}

// "Group A" 같은 조별리그 스테이지만 골라낸다.
function isGroupStage(stage?: string): boolean {
  if (!stage) return false;
  return /group|조|^[a-h]$/i.test(stage.trim());
}

function ensureRow(map: Map<string, StandingRow>, team: string): StandingRow {
  let row = map.get(team);
  if (!row) {
    row = {
      team,
      played: 0,
      win: 0,
      draw: 0,
      loss: 0,
      gf: 0,
      ga: 0,
      gd: 0,
      points: 0,
    };
    map.set(team, row);
  }
  return row;
}

export function computeGroupStandings(matches: Match[]): GroupStandings[] {
  const groups = new Map<string, Map<string, StandingRow>>();

  for (const m of matches) {
    if (!isGroupStage(m.stage)) continue;
    const group = koreanGroupName(m.stage); // "Group A" → "A조"
    const table = groups.get(group) ?? new Map<string, StandingRow>();
    groups.set(group, table);

    const home = toKoreanTeam(m.home.name);
    const away = toKoreanTeam(m.away.name);
    // 종료 전이라도 팀은 표에 등장시킨다(0경기).
    const h = ensureRow(table, home);
    const a = ensureRow(table, away);

    if (m.status !== 'FINISHED' || !m.score) continue;
    const { home: hs, away: as_ } = m.score;
    h.played++;
    a.played++;
    h.gf += hs;
    h.ga += as_;
    a.gf += as_;
    a.ga += hs;
    if (hs > as_) {
      h.win++;
      a.loss++;
      h.points += 3;
    } else if (hs < as_) {
      a.win++;
      h.loss++;
      a.points += 3;
    } else {
      h.draw++;
      a.draw++;
      h.points++;
      a.points++;
    }
  }

  const result: GroupStandings[] = [];
  for (const [group, table] of groups) {
    const rows = [...table.values()];
    for (const r of rows) r.gd = r.gf - r.ga;
    rows.sort(
      (x, y) =>
        y.points - x.points || y.gd - x.gd || y.gf - x.gf ||
        x.team.localeCompare(y.team),
    );
    result.push({ group, rows });
  }
  result.sort((a, b) => a.group.localeCompare(b.group));
  return result;
}

// ── 스테이지(조별리그 → 토너먼트) 섹션 정렬 ──────────────────

interface StageMeta {
  label: string;
  order: number; // 진행 순서(조별리그=0 … 결승=5)
}

/** 토너먼트 스테이지 문자열/코드 → 한글 라벨/순서. 조별리그면 null. */
function knockoutMeta(stage?: string): StageMeta | null {
  if (!stage) return null;
  const s = stage.toLowerCase().replace(/[\s._-]/g, '');
  // ‘qf/sf/final’ 의 'f' 오매칭과 부분문자열 겹침 방지를 위해 좁은 패턴부터 검사.
  if (/third|3rd|bronze|^3p$|^tp$/.test(s)) return { label: '3·4위전', order: 4.5 };
  if (/semi|^sf$|round4|4강/.test(s)) return { label: '4강', order: 4 };
  if (/quarter|^qf$|round8|8강/.test(s)) return { label: '8강', order: 3 };
  if (/^r?16$|round16|roundof16|last16|16강/.test(s)) return { label: '16강', order: 2 };
  if (/^r?32$|round32|roundof32|last32|32강/.test(s)) return { label: '32강', order: 1 };
  if (/^f$|final|결승/.test(s)) return { label: '결승', order: 5 };
  return null;
}

export type StageSection =
  | {
      kind: 'group';
      title: string;
      order: number;
      active: boolean;
      groups: GroupStandings[];
    }
  | {
      kind: 'knockout';
      title: string;
      order: number;
      active: boolean;
      matches: Match[];
    };

/**
 * 조별리그 순위 + 토너먼트 스테이지를 섹션으로 묶어, "현재 진행 스테이지"를
 * 맨 위로 올려 반환한다. (조별리그 진행 중엔 조별리그가, 32강이 시작되면 32강이 위)
 */
export function computeStageSections(matches: Match[]): StageSection[] {
  const sections: StageSection[] = [];

  const groups = computeGroupStandings(matches);
  if (groups.length > 0) {
    sections.push({ kind: 'group', title: '조별리그', order: 0, active: false, groups });
  }

  const koMap = new Map<number, { label: string; matches: Match[] }>();
  for (const m of matches) {
    if (isGroupStage(m.stage)) continue;
    const meta = knockoutMeta(m.stage);
    if (!meta) continue;
    const e = koMap.get(meta.order) ?? { label: meta.label, matches: [] };
    e.matches.push(m);
    koMap.set(meta.order, e);
  }
  for (const [order, e] of koMap) {
    e.matches.sort((a, b) => a.kickoff.localeCompare(b.kickoff));
    sections.push({ kind: 'knockout', title: e.label, order, active: false, matches: e.matches });
  }

  if (sections.length === 0) return [];

  // 각 섹션의 경기 상태(진행중/시작됨) 판정.
  const groupMatches = matches.filter((m) => isGroupStage(m.stage));
  const statusOf = (s: StageSection) => {
    const ms = s.kind === 'group' ? groupMatches : s.matches;
    return {
      live: ms.some((m) => m.status === 'LIVE' || m.status === 'PAUSED'),
      started: ms.some((m) => m.status !== 'SCHEDULED'),
    };
  };

  // 활성 스테이지: 진행중 경기가 있는 스테이지 중 최상위 → 없으면 시작된 스테이지 중 최상위 → 아무것도 시작 전이면 가장 이른 스테이지.
  let activeOrder: number;
  const liveOrders = sections.filter((s) => statusOf(s).live).map((s) => s.order);
  if (liveOrders.length > 0) {
    activeOrder = Math.max(...liveOrders);
  } else {
    const startedOrders = sections.filter((s) => statusOf(s).started).map((s) => s.order);
    activeOrder =
      startedOrders.length > 0
        ? Math.max(...startedOrders)
        : Math.min(...sections.map((s) => s.order));
  }

  return sections
    .map((s) => ({ ...s, active: s.order === activeOrder }))
    .sort((a, b) => (a.active !== b.active ? (a.active ? -1 : 1) : a.order - b.order));
}
