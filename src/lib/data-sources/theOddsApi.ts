// The Odds API (the-odds-api.com) — 월드컵 1X2 배당 자동 수집.
// 무료 키: https://the-odds-api.com/ (월 500회). 키가 없으면 빈 배열(수동/베트맨 입력으로 폴백).
//
// 베트맨은 공식 API/스크래핑이 막혀(개발 환경 egress 차단 + 로그인/JS) 자동 수집이 불가하여,
// 경기별 배당을 "자동으로" 채우려면 이런 배당 API 가 현실적 대안이다.

import type { Match, Odds } from '@/lib/types';
import { teamCanon } from '@/lib/teams/korea';

const SPORT = 'soccer_fifa_world_cup';

export function isOddsApiConfigured(): boolean {
  return Boolean(process.env.THE_ODDS_API_KEY);
}

interface OAOutcome {
  name: string;
  price: number;
}
interface OAEvent {
  home_team: string;
  away_team: string;
  bookmakers: { markets: { key: string; outcomes: OAOutcome[] }[] }[];
}

function pairKey(a: string, b: string): string {
  return [teamCanon(a), teamCanon(b)].sort().join('|');
}

function priceOf(outcomes: OAOutcome[], targetName: string): number | null {
  const target = teamCanon(targetName);
  const o = outcomes.find((x) => teamCanon(x.name) === target);
  return o && o.price > 1 ? o.price : null;
}

/** 우리 경기 목록과 팀명으로 매칭해 1X2 배당을 우리 Odds 로 정규화. */
export async function fetchWorldCupOdds(matches: Match[]): Promise<Odds[]> {
  const key = process.env.THE_ODDS_API_KEY;
  if (!key) return [];

  const url =
    `https://api.the-odds-api.com/v4/sports/${SPORT}/odds/` +
    `?apiKey=${key}&regions=eu&markets=h2h&oddsFormat=decimal`;
  // ⚠️ 무료 키는 월 500회. 6시간 캐시로 하루 최대 4회(월 ~120회)만 호출한다.
  // (페이지 새로고침/자동갱신이 잦아도 이 캐시 안에서는 추가 호출이 없다)
  const res = await fetch(url, { next: { revalidate: 21600 } });
  // 남은 호출 횟수를 로그로 남겨 소진 여부를 확인할 수 있게 한다.
  const remaining = res.headers.get('x-requests-remaining');
  if (remaining) console.info(`[the-odds-api] 남은 호출: ${remaining}`);
  if (!res.ok) throw new Error(`the-odds-api ${res.status}`);
  const events = (await res.json()) as OAEvent[];

  // 우리 경기를 팀쌍 키로 인덱싱
  const byPair = new Map<string, Match>();
  for (const m of matches) byPair.set(pairKey(m.home.name, m.away.name), m);

  const out: Odds[] = [];
  for (const e of events) {
    const market = e.bookmakers?.[0]?.markets?.find((mk) => mk.key === 'h2h');
    if (!market) continue;
    const match = byPair.get(pairKey(e.home_team, e.away_team));

    // 배당은 우리 경기의 home/away 팀 기준으로 정확히 매핑
    const homeName = match ? match.home.name : e.home_team;
    const awayName = match ? match.away.name : e.away_team;
    const home = priceOf(market.outcomes, homeName);
    const away = priceOf(market.outcomes, awayName);
    const draw = priceOf(market.outcomes, 'Draw');
    if (home == null || draw == null || away == null) continue;

    out.push({
      matchId: match ? match.id : `oddsapi-${pairKey(e.home_team, e.away_team)}`,
      externalRef: `${teamCanon(e.home_team)}|${teamCanon(e.away_team)}`,
      home,
      draw,
      away,
      updatedAt: new Date().toISOString(),
      source: 'oddsapi',
    });
  }
  return out;
}
