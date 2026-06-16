// 베트맨 gameSlip.do 원본(JSON 문자열)을 파싱·매칭·저장하는 코어.
// Server Action(importBetmanAction)과 API 라우트(/api/odds/ingest)가 공유한다.

import {
  parseBetmanGameSlip,
  parseBetmanMarkets,
  matchOddsToMatches,
} from '@/lib/data-sources/betman';
import { getMatches } from '@/lib/data-sources';
import { upsertOdds } from './store';
import { upsertMarketOddsMany } from './market-store';
import { recordBetmanHeartbeat } from './status';

export interface IngestResult {
  /** 저장한 1X2 경기 수(하위호환 지표) */
  count: number;
  /** 저장한 전체 마켓 행 수(승무패+핸디캡+언더오버) */
  marketCount: number;
}

/**
 * 베트맨 승부식 응답(raw)을 받아 월드컵 배당을 저장한다.
 * - 전 마켓(승무패·핸디캡·언더오버)을 market_odds 에 저장한다.
 * - 하위호환을 위해 승무패(1X2)는 기존 odds 테이블에도 저장한다.
 * - 파싱 결과가 없으면 count: 0 (저장 안 함, throw 안 함).
 * - 우리 경기 목록과 팀명으로 매칭해 matchId 를 보정한다.
 * 저장 실패(예: Supabase 오류)는 throw 한다.
 */
export async function ingestBetmanRaw(raw: string): Promise<IngestResult> {
  const oneX2 = parseBetmanGameSlip(raw);
  const markets = parseBetmanMarkets(raw);
  if (oneX2.length === 0 && markets.length === 0) {
    return { count: 0, marketCount: 0 };
  }

  const { matches } = await getMatches();

  // 1) 전 마켓 저장(matchId 보정 후 market_odds 로).
  const matchedMarkets = matchOddsToMatches(markets, matches);
  const marketCount = await upsertMarketOddsMany(matchedMarkets);

  // 2) 하위호환: 승무패는 기존 odds 테이블에도 upsert.
  const matched1X2 = matchOddsToMatches(oneX2, matches);
  for (const o of matched1X2) {
    await upsertOdds({ matchId: o.matchId, home: o.home, draw: o.draw, away: o.away });
  }

  // 베트맨 데이터를 성공적으로 받았으므로(파싱>0) 마지막 수집 시각 기록 → 배너 정확도.
  await recordBetmanHeartbeat();
  return { count: matched1X2.length, marketCount };
}
