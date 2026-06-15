// football-data.org — 무료 티어로 실시간 스코어/경기상태를 가져온다.
// 무료 키: https://www.football-data.org/client/register (분당 10회 제한)
// 월드컵 대회코드는 시즌마다 다를 수 있어 환경변수/상수로 관리.

import type { Match, MatchStatus, Team } from '@/lib/types';
import { fetchWithTimeout } from '@/lib/http';
import { stableMatchId } from '@/lib/teams/korea';

const BASE = 'https://api.football-data.org/v4';
// World Cup 대회 코드 (football-data.org 기준 'WC'). 필요 시 조정.
const WORLD_CUP_CODE = 'WC';

interface FDTeam {
  id: number;
  name: string;
  tla?: string;
  crest?: string;
}

interface FDMatch {
  id: number;
  competition: { name: string };
  stage?: string;
  group?: string;
  utcDate: string;
  status: string;
  minute?: number | null;
  homeTeam: FDTeam;
  awayTeam: FDTeam;
  score: { fullTime: { home: number | null; away: number | null } };
}

function mapStatus(s: string): MatchStatus {
  switch (s) {
    case 'IN_PLAY':
      return 'LIVE';
    case 'PAUSED':
      return 'PAUSED';
    case 'FINISHED':
      return 'FINISHED';
    case 'POSTPONED':
      return 'POSTPONED';
    case 'CANCELLED':
    case 'SUSPENDED':
      return 'CANCELLED';
    default:
      return 'SCHEDULED';
  }
}

function toTeam(t: FDTeam | null): Team {
  // football-data 는 미정(TBD) 경기에서 팀/이름을 null 로 준다 → 안전 처리.
  if (!t) return { id: 'tbd', name: '미정' };
  return {
    id: t.id != null ? String(t.id) : 'tbd',
    name: t.name ?? '미정',
    code: t.tla ?? undefined,
    flagUrl: t.crest ?? undefined,
  };
}

export function isFootballDataConfigured(): boolean {
  return Boolean(process.env.FOOTBALL_DATA_API_KEY);
}

export async function fetchLiveWorldCupMatches(): Promise<Match[]> {
  const key = process.env.FOOTBALL_DATA_API_KEY;
  if (!key) throw new Error('FOOTBALL_DATA_API_KEY 가 설정되지 않았습니다.');

  const res = await fetchWithTimeout(
    `${BASE}/competitions/${WORLD_CUP_CODE}/matches`,
    {
      headers: { 'X-Auth-Token': key },
      // 실시간성이 중요하므로 짧게 캐시
      next: { revalidate: 30 },
    },
  );
  if (!res.ok) {
    throw new Error(`football-data fetch 실패: ${res.status}`);
  }
  const data = (await res.json()) as { matches: FDMatch[] };

  return data.matches.map((m) => ({
    id: stableMatchId(m.homeTeam?.name, m.awayTeam?.name) ?? `fd-${m.id}`,
    altIds: [`fd-${m.id}`], // 옛 ID 로 저장된 의견·배당 복구용 별칭
    competition: m.competition.name,
    stage: m.group ?? m.stage,
    kickoff: m.utcDate,
    status: mapStatus(m.status),
    minute: m.minute ?? undefined,
    home: toTeam(m.homeTeam),
    away: toTeam(m.awayTeam),
    score:
      m.score.fullTime.home != null
        ? { home: m.score.fullTime.home, away: m.score.fullTime.away ?? 0 }
        : undefined,
    source: 'football-data',
  }));
}
