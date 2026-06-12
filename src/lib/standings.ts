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
