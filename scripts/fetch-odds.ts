// data/odds.json 자동 생성 스크립트 — GitHub Actions cron 에서 주기 실행한다.
//
// 목적: 구구뱃이 실제 베팅하는 베트맨(승부식 1X2) 배당을 "자동으로" 화면에 채운다.
//   1순위: 베트맨(betman.co.kr) — 실제 베팅 사이트의 배당. (residential IP 에서만 실효)
//   2순위(폴백): The Odds API — 국제 북메이커 1X2. 베트맨이 막히거나 빈 경기를 채운다.
// 결과를 data/odds.json 에 기록하면, 앱은 Supabase 미설정 시 listOdds() 로 같은 파일을
// 읽어 기존 화면(MatchBoard)에 그대로 보여준다. → 추가 호스팅/DB 없이 완전 자동화.
//
// 실행:   npx tsx scripts/fetch-odds.ts      (= npm run odds)
// 환경변수:
//   THE_ODDS_API_KEY            폴백 소스 키. 없으면 베트맨만 시도.
//   ENABLE_BETMAN_SCRAPER=true  베트맨 직접 fetch 시도(데이터센터 IP 는 차단될 수 있음).
//   WORLDCUP26_*, FOOTBALL_DATA_API_KEY  경기 일정/팀명 소스(선택, 없으면 openfootball).
//
// ⚠️ index.ts(getMatches/getOdds)는 top-level 에서 React cache() 를 호출해 일반 Node 에서
//    import 시 throw 한다. 그래서 여기서는 소스 모듈을 "직접" import 하고 경기 폴백을 재현한다.

import { promises as fs } from 'fs';
import path from 'path';
import type { Match, Odds } from '@/lib/types';
import { fetchWorldCupFixtures } from '@/lib/data-sources/openfootball';
import {
  fetchWorldcup26Matches,
  isWorldcup26Enabled,
} from '@/lib/data-sources/worldcup26';
import {
  fetchLiveWorldCupMatches,
  isFootballDataConfigured,
} from '@/lib/data-sources/footballData';
import {
  fetchBetmanOdds,
  isBetmanEnabled,
  matchOddsToMatches,
} from '@/lib/data-sources/betman';
import {
  fetchWorldCupOdds,
  isOddsApiConfigured,
} from '@/lib/data-sources/theOddsApi';

const ODDS_FILE = path.join(process.cwd(), 'data', 'odds.json');

/**
 * 경기 목록을 가져온다(index.ts::_getMatches 의 폴백 전략을 cache 없이 재현).
 * 1순위 worldcup26.ir → 2순위 football-data → 폴백 openfootball.
 * 팀명 매칭에만 쓰이므로 openfootball 정적 일정만으로도 충분하다.
 */
async function getMatchesNoCache(): Promise<{ matches: Match[]; source: string }> {
  if (isWorldcup26Enabled()) {
    try {
      const matches = await fetchWorldcup26Matches();
      if (matches.length > 0) return { matches, source: 'worldcup26' };
    } catch (err) {
      console.warn('[fetch-odds] worldcup26 실패, 폴백:', err);
    }
  }
  if (isFootballDataConfigured()) {
    try {
      const matches = await fetchLiveWorldCupMatches();
      if (matches.length > 0) return { matches, source: 'football-data' };
    } catch (err) {
      console.warn('[fetch-odds] football-data 실패, 폴백:', err);
    }
  }
  try {
    const matches = await fetchWorldCupFixtures();
    return { matches, source: 'openfootball' };
  } catch (err) {
    // 모든 소스 실패해도 스크립트는 죽지 않는다(index.ts::_getMatches 와 동일 정책).
    console.error('[fetch-odds] openfootball 실패 → 빈 경기 목록:', err);
    return { matches: [], source: 'none' };
  }
}

async function main(): Promise<void> {
  const { matches, source } = await getMatchesNoCache();
  console.info(`[fetch-odds] 경기 ${matches.length}건 (소스: ${source})`);
  const matchIds = new Set(matches.map((m) => m.id));

  // matchId -> Odds. 베트맨이 최우선, 비면 The Odds API 로 채운다.
  const merged = new Map<string, Odds>();

  // 1) 베트맨 (우선). 차단/실패/미매칭이면 그냥 비운다(throw 없음).
  if (isBetmanEnabled()) {
    try {
      const betman = matchOddsToMatches(await fetchBetmanOdds(), matches);
      let n = 0;
      for (const o of betman) {
        if (!matchIds.has(o.matchId)) continue; // 우리 경기에 매칭된 것만
        merged.set(o.matchId, { ...o, source: 'betman' });
        n++;
      }
      console.info(`[fetch-odds] 베트맨: ${n}건 매칭`);
    } catch (err) {
      console.warn('[fetch-odds] 베트맨 실패(The Odds API 폴백 진행):', err);
    }
  } else {
    console.info('[fetch-odds] 베트맨 비활성(ENABLE_BETMAN_SCRAPER!=true) — 건너뜀');
  }

  // 2) The Odds API (폴백). 베트맨이 못 채운 경기만 보강.
  if (isOddsApiConfigured()) {
    try {
      const api = await fetchWorldCupOdds(matches);
      let n = 0;
      for (const o of api) {
        if (!matchIds.has(o.matchId)) continue;
        if (merged.has(o.matchId)) continue; // 베트맨 우선
        merged.set(o.matchId, { ...o, source: 'oddsapi' });
        n++;
      }
      console.info(`[fetch-odds] The Odds API: ${n}건 보강`);
    } catch (err) {
      console.warn('[fetch-odds] The Odds API 실패:', err);
    }
  } else {
    console.info('[fetch-odds] The Odds API 키 없음(THE_ODDS_API_KEY) — 건너뜀');
  }

  const odds = [...merged.values()].sort((a, b) =>
    a.matchId.localeCompare(b.matchId),
  );
  await writeIfChanged(odds);
}

/** 배당값이 실제로 바뀐 경우에만 파일을 쓴다(타임스탬프만 다른 무의미 커밋 방지). */
async function writeIfChanged(odds: Odds[]): Promise<void> {
  const next = JSON.stringify(odds, null, 2) + '\n';
  let prev = '';
  try {
    prev = await fs.readFile(ODDS_FILE, 'utf-8');
  } catch {
    /* 최초 실행: 파일 없음 */
  }
  if (stripTimestamps(prev) === stripTimestamps(next)) {
    console.info(`[fetch-odds] 변동 없음 — data/odds.json 유지 (${odds.length}건)`);
    return;
  }
  await fs.mkdir(path.dirname(ODDS_FILE), { recursive: true });
  await fs.writeFile(ODDS_FILE, next, 'utf-8');
  console.info(`[fetch-odds] data/odds.json 갱신 (${odds.length}건)`);
}

// updatedAt 을 비교에서 제외 → "배당이 같으면 커밋하지 않음".
function stripTimestamps(json: string): string {
  return json.replace(/"updatedAt":\s*"[^"]*"/g, '"updatedAt":""');
}

main().catch((err) => {
  console.error('[fetch-odds] 치명적 오류:', err);
  process.exit(1);
});
