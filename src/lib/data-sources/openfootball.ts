// openfootball/worldcup.json — API 키 불필요, 퍼블릭 도메인.
// 월드컵 경기일정/조편성 같은 "정적에 가까운" 데이터에 이상적인 기본 소스.
// https://github.com/openfootball/worldcup.json

import type { Match, Team } from '@/lib/types';
import { fetchWithTimeout } from '@/lib/http';

const WORLDCUP_2026_URL =
  'https://raw.githubusercontent.com/openfootball/worldcup.json/master/2026/worldcup.json';

interface OpenFootballMatch {
  num?: number;
  date: string; // "2026-06-11"
  time?: string; // "20:00"
  team1: { name: string; code?: string };
  team2: { name: string; code?: string };
  score?: { ft?: [number, number] };
  group?: string;
  round?: string;
}

interface OpenFootballFile {
  name?: string;
  rounds?: { name: string; matches: OpenFootballMatch[] }[];
  matches?: OpenFootballMatch[];
}

function toTeam(t: { name: string; code?: string }): Team {
  return { id: t.code ?? t.name, name: t.name, code: t.code };
}

function toKickoffIso(date: string, time?: string): string {
  // openfootball 시각은 보통 현지(개최지) 기준이라 정밀 보정이 필요하지만,
  // MVP 단계에서는 입력값을 그대로 ISO 로 조합한다. (추후 타임존 보정 TODO)
  const t = time ?? '00:00';
  const d = new Date(`${date}T${t}:00Z`);
  // 소스 데이터가 깨져 Invalid Date 가 되면 toISOString() 이 throw 하므로 방어한다.
  return Number.isNaN(d.getTime()) ? `${date}T${t}:00Z` : d.toISOString();
}

export async function fetchWorldCupFixtures(): Promise<Match[]> {
  const res = await fetchWithTimeout(WORLDCUP_2026_URL, {
    // 일정 데이터는 자주 안 바뀌므로 1시간 캐시
    next: { revalidate: 3600 },
  });
  if (!res.ok) {
    throw new Error(`openfootball fetch 실패: ${res.status}`);
  }
  const data = (await res.json()) as OpenFootballFile;

  const flat: { m: OpenFootballMatch; round?: string }[] = [];
  if (data.rounds) {
    for (const r of data.rounds) {
      for (const m of r.matches) flat.push({ m, round: r.name });
    }
  }
  if (data.matches) {
    for (const m of data.matches) flat.push({ m, round: m.round });
  }

  return flat.map(({ m, round }) => {
    const ft = m.score?.ft;
    return {
      id: `wc2026-${m.num ?? `${m.date}-${m.team1.name}-${m.team2.name}`}`,
      competition: data.name ?? 'FIFA World Cup 2026',
      stage: m.group ?? round,
      kickoff: toKickoffIso(m.date, m.time),
      status: ft ? 'FINISHED' : 'SCHEDULED',
      home: toTeam(m.team1),
      away: toTeam(m.team2),
      score: ft ? { home: ft[0], away: ft[1] } : undefined,
      source: 'openfootball',
    } satisfies Match;
  });
}
