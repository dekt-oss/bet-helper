// 데이터 소스 통합 게이트웨이.
// 화면/ API 라우트는 개별 소스를 직접 부르지 말고 여기 함수만 사용한다.
// 이렇게 하면 "무료 API → 유료 API → 정적 데이터" 폴백 전략을 한 곳에서 관리할 수 있다.

import type { Match, Odds } from '@/lib/types';
import { cache } from 'react';
import { fetchWorldCupFixtures } from './openfootball';
import {
  fetchWorldcup26Matches,
  isWorldcup26Enabled,
} from './worldcup26';
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
// React cache(): 한 번의 요청(렌더) 안에서 중복 호출을 메모이즈한다.
// (페이지가 getMatches() 와 getOdds()[내부에서 다시 getMatches()]를 호출 → 캐시로 1회만 실행)
export const getMatches = cache(_getMatches);

async function _getMatches(): Promise<{
  matches: Match[];
  source: string;
}> {
  // 1순위: worldcup26.ir — 진행시간/득점자/경기장 등 상세 데이터 포함.
  if (isWorldcup26Enabled()) {
    try {
      const matches = await fetchWorldcup26Matches();
      if (matches.length > 0) return { matches, source: 'worldcup26' };
    } catch (err) {
      console.warn('[data] worldcup26 실패, 다른 소스로 폴백:', err);
    }
  }
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

export const getOdds = cache(_getOdds);

async function _getOdds(): Promise<OddsResult> {
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
      // 라이브 배당 스냅샷 저장은 렌더를 막지 않도록 비차단(fire-and-forget).
      // 값이 바뀐 경우에만 쓰므로 대개 무동작이고, 다음 렌더가 재시도해 결국 영속화된다.
      void snapshotOdds(fresh, manual, snapshot).catch(() => {});
    } catch (err) {
      console.warn('[data] The Odds API 실패(무시):', err);
    }
  }

  // 종료되어 라이브 API 에서 빠진 경기는 마지막 스냅샷 배당으로 채운다.
  for (const [id, o] of snapshot) if (!map.has(id)) map.set(id, o);

  // 이미 종료됐는데 배당이 없는 경기를 과거(historical) 배당으로 백필.
  // ⚠️ 유료 플랜 전용 + 호출당 지연이 커서 기본 비활성(ENABLE_HISTORICAL_ODDS=true 일 때만).
  // 활성화돼도 렌더를 막지 않도록 비차단으로 돌린다(다음 렌더에서 결과 반영).
  if (api && process.env.ENABLE_HISTORICAL_ODDS === 'true') {
    const missing = matches.filter(
      (m) => m.status === 'FINISHED' && !map.has(m.id),
    );
    if (missing.length > 0) {
      void backfillHistoricalOdds(missing, matches, new Map(map)).catch(() => {});
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
  // 현재 경기 목록에 없는 배당은 버린다.
  // (옛 소스 시절 저장된 고아 스냅샷 — 예: football-data 의 'fd-...' id — 가
  //  소스 교체 후 매칭이 끊겨 화면에 원본 id 로 노출되던 문제 방지)
  const matchIds = new Set(matches.map((m) => m.id));
  const odds = [...map.values()].filter((o) => matchIds.has(o.matchId));
  return { odds, scraper, api };
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
