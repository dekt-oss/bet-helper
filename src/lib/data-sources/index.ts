// 데이터 소스 통합 게이트웨이.
// 화면/ API 라우트는 개별 소스를 직접 부르지 말고 여기 함수만 사용한다.
// 이렇게 하면 "무료 API → 유료 API → 정적 데이터" 폴백 전략을 한 곳에서 관리할 수 있다.

import type { Match, MarketOdds, Odds } from '@/lib/types';
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
  fetchWorldCupMarketOdds,
  fetchHistoricalWorldCupOdds,
  isOddsApiConfigured,
} from './theOddsApi';
import { listOdds, upsertOdds } from '@/lib/odds/store';
import { listMarketOdds, marketKey } from '@/lib/odds/market-store';
import { buildMatchIdResolver, resolveMatchIds } from './resolve';

/**
 * 경기 목록을 가져온다.
 *
 * 안정성 우선 전략(불안정성 해결):
 * - "기준 데이터"(경기 목록·팀명·ID)는 신뢰할 수 있는 단일 소스에서 가져온다.
 *   우선순위: football-data(키 보유 시·안정적) > openfootball(공개) > worldcup26.
 *   → 소스가 깜빡여도 기준이 잘 안 바뀌어, 저장한 의견·배당이 사라지지 않는다.
 *   (openfootball 은 2026 데이터가 비어 오는 경우가 있어 1순위에서 제외)
 * - worldcup26(JWT 인증, 간헐 실패)은 "라이브 보강"(상태·스코어·진행시간·득점자·경기장)
 *   만 stableMatchId 로 매칭해 덧입힌다(ID·팀명에는 영향 없음). 실패해도 기준은 유지.
 */
// React cache(): 한 번의 요청(렌더) 안에서 중복 호출을 메모이즈한다.
export const getMatches = cache(_getMatches);

// worldcup26 라이브 필드를 기준 경기에 덧입힌다(ID·팀명은 기준 유지, best-effort).
function mergeLive(base: Match[], live: Match[]): Match[] {
  const liveById = new Map(live.map((m) => [m.id, m]));
  return base.map((m) => {
    const lv = liveById.get(m.id);
    if (!lv) return m; // 매칭 안 되면 기준 그대로(라이브 정보만 없음)
    return {
      ...m,
      // football-data 도 상태/스코어/분을 주므로, worldcup26 라이브가 더 진행됐을 때만 덮어쓴다.
      status: lv.status !== 'SCHEDULED' ? lv.status : m.status,
      score: lv.score ?? m.score,
      minute: lv.minute ?? m.minute,
      scorers: lv.scorers ?? m.scorers,
      venue: lv.venue ?? m.venue,
      // 두 소스의 별칭 ID 를 합쳐, 어느 소스 시절에 저장한 데이터든 복구되게 한다.
      altIds: Array.from(
        new Set([...(m.altIds ?? []), ...(lv.altIds ?? []), lv.id]),
      ),
    };
  });
}

// worldcup26 보강은 best-effort 이며 절대 페이지를 느리게 해선 안 된다.
//  - 단일 시도 상한 2.5초(Promise.race).
//  - 실패 시 60초 쿨다운 → 죽어 있을 때 매 요청이 타임아웃을 무는 것을 방지.
const ENRICH_TIMEOUT_MS = 2500;
const ENRICH_COOLDOWN_MS = 60_000;
let enrichCooldownUntil = 0;

async function enrichWithLive(base: Match[]): Promise<Match[]> {
  if (!isWorldcup26Enabled()) return base;
  if (Date.now() < enrichCooldownUntil) return base; // 최근 실패 → 잠시 건너뜀
  try {
    const live = await Promise.race([
      fetchWorldcup26Matches(),
      new Promise<Match[]>((_, reject) =>
        setTimeout(() => reject(new Error('worldcup26 보강 타임아웃')), ENRICH_TIMEOUT_MS),
      ),
    ]);
    return live.length > 0 ? mergeLive(base, live) : base;
  } catch (err) {
    enrichCooldownUntil = Date.now() + ENRICH_COOLDOWN_MS;
    console.warn('[data] worldcup26 보강 건너뜀(쿨다운 60초):', err);
    return base;
  }
}

async function _getMatches(): Promise<{
  matches: Match[];
  source: string;
}> {
  // 1순위 안정 기준: football-data (키 보유 시). 무인증 worldcup26 보다 안정적이고
  // 실제로 2026 경기 데이터를 안정적으로 제공한다.
  if (isFootballDataConfigured()) {
    try {
      const base = await fetchLiveWorldCupMatches();
      if (base.length > 0) {
        const matches = await enrichWithLive(base);
        return { matches, source: 'football-data' };
      }
    } catch (err) {
      console.warn('[data] football-data 실패, 다음 소스로 폴백:', err);
    }
  }

  // 2순위: openfootball(공개). 2026 데이터가 있으면 사용.
  try {
    const base = await fetchWorldCupFixtures();
    if (base.length > 0) {
      const matches = await enrichWithLive(base);
      return { matches, source: 'openfootball' };
    }
  } catch (err) {
    console.warn('[data] openfootball 실패:', err);
  }

  // 3순위: worldcup26 단독(다른 소스가 모두 비었을 때만 — 깜빡임 위험 있어 최후순위).
  if (isWorldcup26Enabled()) {
    try {
      const matches = await fetchWorldcup26Matches();
      if (matches.length > 0) return { matches, source: 'worldcup26' };
    } catch (err) {
      console.warn('[data] worldcup26 폴백 실패:', err);
    }
  }
  return { matches: [], source: 'none' };
}

/** 진행중 경기만 추려서 반환. */
export async function getLiveMatches(): Promise<Match[]> {
  const { matches } = await getMatches();
  return matches.filter(
    (m) => m.status === 'LIVE' || m.status === 'PAUSED',
  );
}

// 옛 ID 복구(remap) 유틸은 resolve.ts 로 분리(React/IO 의존 없음 → 테스트 가능).
export { buildMatchIdResolver, resolveMatchIds };

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
  const [dbOddsRaw, { matches }] = await Promise.all([listOdds(), getMatches()]);

  // 옛/별칭 ID 로 저장된 배당을 현재 경기 ID 로 복구(remap).
  // (소스 변경 전 저장돼 'fd-…','wc2026-…','betman-홈-원정' 등에 묶인 배당 복구)
  const dbOdds = resolveMatchIds(dbOddsRaw, matches);

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

// ── 멀티마켓 배당(승무패+핸디캡+언더오버) 집계 ───────────────
// 우선순위: DB market_odds(베트맨/수동 실배당) > The Odds API(spreads=핸디/totals=언오 자동).
//  - 같은 (경기,마켓,라인) 은 DB 실배당이 API 값을 덮어쓴다(베트맨 우선).
export const getMarketOdds = cache(_getMarketOdds);

async function _getMarketOdds(): Promise<MarketOdds[]> {
  const [dbRaw, { matches }] = await Promise.all([listMarketOdds(), getMatches()]);
  const db = resolveMatchIds(dbRaw, matches);
  const map = new Map<string, MarketOdds>();
  // DB(베트맨/수동)에 존재하는 (경기, 마켓유형) — 이 유형은 자동 배당으로 보강하지 않는다.
  const dbTypes = new Set<string>();
  for (const o of db) {
    map.set(marketKey(o), o);
    dbTypes.add(`${o.matchId}::${o.market}`);
  }

  if (isOddsApiConfigured()) {
    try {
      const api = matchOddsToMatches(await fetchWorldCupMarketOdds(matches), matches);
      for (const o of api) {
        // 베트맨/수동이 이미 그 마켓을 제공하면 자동 배당은 무시(라인 불일치/중복 방지).
        if (dbTypes.has(`${o.matchId}::${o.market}`)) continue;
        const k = marketKey(o);
        if (!map.has(k)) map.set(k, o);
      }
    } catch (err) {
      console.warn('[data] The Odds API 마켓(스프레드/토탈) 실패(무시):', err);
    }
  }
  const ids = new Set(matches.map((m) => m.id));
  return [...map.values()].filter((o) => ids.has(o.matchId));
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
