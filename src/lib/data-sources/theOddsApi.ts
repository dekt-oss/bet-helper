// The Odds API (the-odds-api.com) — 월드컵 1X2 배당 자동 수집.
// 무료 키: https://the-odds-api.com/ (월 500회). 키가 없으면 빈 배열(수동/베트맨 입력으로 폴백).
//
// 베트맨은 공식 API/스크래핑이 막혀(개발 환경 egress 차단 + 로그인/JS) 자동 수집이 불가하여,
// 경기별 배당을 "자동으로" 채우려면 이런 배당 API 가 현실적 대안이다.

import type { Match, MarketOdds, Odds } from '@/lib/types';
import { teamCanon } from '@/lib/teams/korea';
import { fetchWithTimeout } from '@/lib/http';

const SPORT = 'soccer_fifa_world_cup';

export function isOddsApiConfigured(): boolean {
  return Boolean(process.env.THE_ODDS_API_KEY);
}

interface OAOutcome {
  name: string;
  price: number;
  /** spreads(핸디)·totals(언오)의 기준선. 예: -1.5, 2.5 */
  point?: number;
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
  const res = await fetchWithTimeout(url, { next: { revalidate: 21600 } });
  // 남은 호출 횟수를 로그로 남겨 소진 여부를 확인할 수 있게 한다.
  const remaining = res.headers.get('x-requests-remaining');
  if (remaining) console.info(`[the-odds-api] 남은 호출: ${remaining}`);
  if (!res.ok) throw new Error(`the-odds-api ${res.status}`);
  const events = (await res.json()) as OAEvent[];
  return mapEventsToOdds(events, matches);
}

/**
 * 과거(historical) 1X2 배당을 가져온다 — 이미 종료된 경기의 배당 백필용.
 * - `isoDate`(보통 경기 킥오프 시각)에 가장 가까운 배당 스냅샷을 반환한다.
 * - ⚠️ 과거 배당은 The Odds API 유료 플랜(Historical 권한)에서만 제공된다.
 *   무료/미지원 키는 4xx 를 반환하므로 호출부에서 무시(폴백)하면 된다.
 * - 과거 데이터는 불변이라 force-cache 로 동일 시각 중복 호출(=중복 과금)을 막는다.
 */
export async function fetchHistoricalWorldCupOdds(
  matches: Match[],
  isoDate: string,
): Promise<Odds[]> {
  const key = process.env.THE_ODDS_API_KEY;
  if (!key) return [];

  const url =
    `https://api.the-odds-api.com/v4/historical/sports/${SPORT}/odds/` +
    `?apiKey=${key}&regions=eu&markets=h2h&oddsFormat=decimal` +
    `&date=${encodeURIComponent(isoDate)}`;
  const res = await fetchWithTimeout(url, { cache: 'force-cache' });
  const remaining = res.headers.get('x-requests-remaining');
  if (remaining) console.info(`[the-odds-api/historical] 남은 호출: ${remaining}`);
  if (!res.ok) throw new Error(`the-odds-api historical ${res.status}`);
  // 과거 응답은 { timestamp, data: OAEvent[] } 형태로 감싸여 온다.
  const body = (await res.json()) as { data?: OAEvent[] };
  return mapEventsToOdds(body.data ?? [], matches);
}

/**
 * 핸디캡(spreads)·언더오버(totals) 마켓을 자동 수집해 MarketOdds[] 로 정규화한다.
 * - 키가 없으면 빈 배열(베트맨 실배당 입력으로 폴백).
 * - The Odds API spreads 는 2-way(홈/원정, 무 없음) → 핸디 HOME/AWAY 만 채운다.
 *   (베트맨 정수핸디의 '무'는 실배당 입력 시에만 채워진다.)
 * - 배당은 해외 북메이커 기준이라 베트맨 고정배당과 다르므로 source='oddsapi'(참고용).
 */
export async function fetchWorldCupMarketOdds(
  matches: Match[],
): Promise<MarketOdds[]> {
  const key = process.env.THE_ODDS_API_KEY;
  if (!key) return [];

  const url =
    `https://api.the-odds-api.com/v4/sports/${SPORT}/odds/` +
    `?apiKey=${key}&regions=eu&markets=spreads,totals&oddsFormat=decimal`;
  // 6시간 캐시(무료 키 보호) — h2h 호출과 별개의 1회.
  const res = await fetchWithTimeout(url, { next: { revalidate: 21600 } });
  const remaining = res.headers.get('x-requests-remaining');
  if (remaining) console.info(`[the-odds-api/markets] 남은 호출: ${remaining}`);
  if (!res.ok) throw new Error(`the-odds-api markets ${res.status}`);
  const events = (await res.json()) as OAEvent[];
  return mapEventsToMarketOdds(events, matches);
}

function mapEventsToMarketOdds(
  events: OAEvent[],
  matches: Match[],
): MarketOdds[] {
  const byPair = new Map<string, Match>();
  for (const m of matches) byPair.set(pairKey(m.home.name, m.away.name), m);

  const now = new Date().toISOString();
  const out: MarketOdds[] = [];
  const seen = new Set<string>(); // (matchId,market,line) 중복 방지(여러 북메이커)

  for (const e of events) {
    const match = byPair.get(pairKey(e.home_team, e.away_team));
    const matchId = match ? match.id : `oddsapi-${pairKey(e.home_team, e.away_team)}`;
    const externalRef = `${teamCanon(e.home_team)}|${teamCanon(e.away_team)}`;
    const homeName = match ? match.home.name : e.home_team;
    const awayName = match ? match.away.name : e.away_team;

    for (const bk of e.bookmakers ?? []) {
      for (const mk of bk.markets ?? []) {
        if (mk.key === 'spreads') {
          const homeO = mk.outcomes.find((x) => teamCanon(x.name) === teamCanon(homeName));
          const awayO = mk.outcomes.find((x) => teamCanon(x.name) === teamCanon(awayName));
          if (!homeO || !awayO || homeO.price <= 1 || awayO.price <= 1) continue;
          const line = homeO.point ?? null;
          const dedupe = `${matchId}|HANDICAP|${line ?? ''}`;
          if (seen.has(dedupe)) continue;
          seen.add(dedupe);
          out.push({
            matchId,
            market: 'HANDICAP',
            externalRef,
            home: homeO.price,
            away: awayO.price,
            handicap: line ?? undefined,
            updatedAt: now,
            source: 'oddsapi',
          });
        } else if (mk.key === 'totals') {
          const overO = mk.outcomes.find((x) => /over/i.test(x.name));
          const underO = mk.outcomes.find((x) => /under/i.test(x.name));
          if (!overO || !underO || overO.price <= 1 || underO.price <= 1) continue;
          const line = overO.point ?? underO.point ?? null;
          const dedupe = `${matchId}|OU|${line ?? ''}`;
          if (seen.has(dedupe)) continue;
          seen.add(dedupe);
          out.push({
            matchId,
            market: 'OU',
            externalRef,
            line: line ?? undefined,
            over: overO.price,
            under: underO.price,
            updatedAt: now,
            source: 'oddsapi',
          });
        }
      }
    }
  }
  return out;
}

/** OAEvent[] → 우리 Odds[] 로 매핑(라이브/과거 공통). */
function mapEventsToOdds(events: OAEvent[], matches: Match[]): Odds[] {
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
