// 데이터 소스 통합 게이트웨이.
// 화면/ API 라우트는 개별 소스를 직접 부르지 말고 여기 함수만 사용한다.
// 이렇게 하면 "무료 API → 유료 API → 정적 데이터" 폴백 전략을 한 곳에서 관리할 수 있다.

import type { Match, Odds } from '@/lib/types';
import { fetchWorldCupFixtures } from './openfootball';
import {
  fetchLiveWorldCupMatches,
  isFootballDataConfigured,
} from './footballData';
import {
  fetchBetmanOdds,
  isBetmanEnabled,
  matchOddsToMatches,
} from './betman';
import {
  fetchWorldCupOdds,
  fetchHistoricalWorldCupOdds,
  isOddsApiConfigured,
} from './theOddsApi';
import { listOdds, upsertOdds } from '@/lib/odds/store';

/**
 * 경기 목록을 가져온다.
 * - football-data 키가 있으면 실시간 상태/스코어가 포함된 데이터를 우선 사용.
 * - 키가 없거나 실패하면 openfootball 정적 일정으로 폴백.
 */
export async function getMatches(): Promise<{
  matches: Match[];
  source: string;
}> {
  if (isFootballDataConfigured()) {
    try {
      const matches = await fetchLiveWorldCupMatches();
      if (matches.length > 0) return { matches, source: 'football-data' };
    } catch (err) {
      console.warn('[data] football-data 실패, openfootball 로 폴백:', err);
    }
  }
  try {
    const matches = await fetchWorldCupFixtures();
    return { matches, source: 'openfootball' };
  } catch (err) {
    // 외부 데이터 소스가 모두 실패해도 페이지는 떠야 한다.
    console.error('[data] openfootball 실패 → 빈 목록 반환:', err);
    return { matches: [], source: 'none' };
  }
}

/** 진행중 경기만 추려서 반환. */
export async function getLiveMatches(): Promise<Match[]> {
  const { matches } = await getMatches();
  return matches.filter(
    (m) => m.status === 'LIVE' || m.status === 'PAUSED',
  );
}

/**
 * 베트맨 승부식 배당을 가져온다.
 * 1순위: DB(odds 테이블) — 화면에서 입력한 베트맨 배당.
 * 2순위: 베트맨 스크래퍼(ENABLE_BETMAN_SCRAPER=true 일 때) — DB 에 없는 경기 보강.
 */
export interface OddsResult {
  odds: Odds[];
  scraper: boolean; // 베트맨 스크래퍼 활성
  api: boolean; // 자동 배당 API(The Odds API) 활성
}

export async function getOdds(): Promise<OddsResult> {
  const scraper = isBetmanEnabled();
  const api = isOddsApiConfigured();
  const [dbOdds, { matches }] = await Promise.all([listOdds(), getMatches()]);

  // DB 배당을 (1) 수동/베트맨 입력 과 (2) 자동 배당 스냅샷('oddsapi') 으로 분리한다.
  //  - 수동 입력: 항상 최우선.
  //  - 스냅샷: 라이브 API 가 더 이상 주지 않는(=종료된) 경기의 마지막 배당을 채우는 폴백.
  const manual = new Map<string, Odds>();
  const snapshot = new Map<string, Odds>();
  for (const o of dbOdds) (o.source === 'oddsapi' ? snapshot : manual).set(o.matchId, o);

  // 우선순위: 수동 입력 > 라이브 자동 배당 > 스냅샷(종료 경기) > 베트맨 스크래퍼
  const map = new Map<string, Odds>(manual);

  if (api) {
    try {
      const fresh = await fetchWorldCupOdds(matches);
      for (const o of fresh) if (!map.has(o.matchId)) map.set(o.matchId, o);
      // 라이브에서 받은 배당을 스냅샷으로 저장 → 경기 종료 후에도 계속 표시한다.
      await snapshotOdds(fresh, manual, snapshot);
    } catch (err) {
      console.warn('[data] The Odds API 실패(무시):', err);
    }
  }

  // 종료되어 라이브 API 에서 빠진 경기는 마지막 스냅샷 배당으로 채운다.
  for (const [id, o] of snapshot) if (!map.has(id)) map.set(id, o);

  // 이미 종료됐는데 라이브/스냅샷 모두 없는 경기는 과거(historical) 배당으로 1회 백필한다.
  if (api) {
    const missing = matches.filter(
      (m) => m.status === 'FINISHED' && !map.has(m.id),
    );
    if (missing.length > 0) {
      try {
        await backfillHistoricalOdds(missing, matches, map);
      } catch (err) {
        console.warn('[data] 과거 배당 백필 실패(무시):', err);
      }
    }
  }

  if (scraper) {
    try {
      const scraped = matchOddsToMatches(await fetchBetmanOdds(), matches);
      for (const o of scraped) if (!map.has(o.matchId)) map.set(o.matchId, o);
    } catch (err) {
      console.warn('[data] betman 스크래퍼 실패(무시):', err);
    }
  }
  return { odds: [...map.values()], scraper, api };
}

// 한 번의 렌더에서 과거 배당 호출 수 상한(과금/지연 방지).
// (force-cache 라 동일 시각 재호출은 과금되지 않지만, 첫 백필 시 폭주를 막는다)
const MAX_HISTORICAL_CALLS = 6;

/**
 * 이미 종료된 경기의 배당을 The Odds API 과거(historical) 스냅샷으로 채운다.
 * - 같은 킥오프 시각끼리 묶어 호출 수를 최소화한다.
 * - 가져온 배당은 결과 맵과 DB 스냅샷('oddsapi')에 모두 반영 → 다음 로드부턴 재호출 불필요.
 * - 과거 권한이 없는 키(무료 플랜)는 4xx → 호출 실패로 조용히 폴백한다.
 */
async function backfillHistoricalOdds(
  missing: Match[],
  matches: Match[],
  map: Map<string, Odds>,
): Promise<void> {
  const byTime = new Map<string, Match[]>();
  for (const m of missing) {
    const list = byTime.get(m.kickoff) ?? [];
    list.push(m);
    byTime.set(m.kickoff, list);
  }

  let calls = 0;
  for (const [iso, group] of byTime) {
    if (calls >= MAX_HISTORICAL_CALLS) break;
    calls++;
    let odds: Odds[];
    try {
      odds = await fetchHistoricalWorldCupOdds(matches, iso);
    } catch (err) {
      console.warn('[data] 과거 배당 조회 실패(무시):', err);
      continue;
    }
    const byId = new Map(odds.map((o) => [o.matchId, o]));
    for (const m of group) {
      const o = byId.get(m.id);
      if (!o) continue;
      map.set(m.id, o);
      try {
        await upsertOdds({
          matchId: o.matchId,
          home: o.home,
          draw: o.draw,
          away: o.away,
          source: 'oddsapi',
        });
      } catch (err) {
        console.warn('[data] 과거 배당 스냅샷 저장 실패(무시):', err);
      }
    }
  }
}

/**
 * 라이브 자동 배당을 DB 에 스냅샷으로 보존한다(종료 경기 배당 유지용).
 * - 수동 입력이 있는 경기는 덮어쓰지 않는다.
 * - 경기에 매칭되지 않은 자동 배당('oddsapi-...')은 저장하지 않는다.
 * - 값이 바뀐 경우에만 기록해 불필요한 쓰기를 줄인다(베스트 에포트, 실패 무시).
 */
async function snapshotOdds(
  fresh: Odds[],
  manual: Map<string, Odds>,
  snapshot: Map<string, Odds>,
): Promise<void> {
  for (const o of fresh) {
    if (o.matchId.startsWith('oddsapi-')) continue;
    if (manual.has(o.matchId)) continue;
    const prev = snapshot.get(o.matchId);
    if (prev && prev.home === o.home && prev.draw === o.draw && prev.away === o.away)
      continue;
    try {
      await upsertOdds({
        matchId: o.matchId,
        home: o.home,
        draw: o.draw,
        away: o.away,
        source: 'oddsapi',
      });
    } catch (err) {
      console.warn('[data] 배당 스냅샷 저장 실패(무시):', err);
    }
  }
}
