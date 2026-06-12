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
import { listOdds } from '@/lib/odds/store';

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
export async function getOdds(): Promise<{ odds: Odds[]; scraper: boolean }> {
  const scraper = isBetmanEnabled();
  const dbOdds = await listOdds();
  const map = new Map<string, Odds>(dbOdds.map((o) => [o.matchId, o]));

  if (scraper) {
    try {
      const [scraped, { matches }] = await Promise.all([
        fetchBetmanOdds(),
        getMatches(),
      ]);
      // 스크랩 배당은 DB 에 없는 경기에만 보강(DB 우선).
      for (const o of matchOddsToMatches(scraped, matches)) {
        if (!map.has(o.matchId)) map.set(o.matchId, o);
      }
    } catch (err) {
      console.warn('[data] betman 스크래퍼 실패(무시):', err);
    }
  }
  return { odds: [...map.values()], scraper };
}
