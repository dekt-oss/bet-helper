// 베트맨 gameSlip.do 원본(JSON 문자열)을 파싱·매칭·저장하는 코어.
// Server Action(importBetmanAction)과 API 라우트(/api/odds/ingest)가 공유한다.

import { parseBetmanGameSlip, matchOddsToMatches } from '@/lib/data-sources/betman';
import { getMatches } from '@/lib/data-sources';
import { upsertOdds } from './store';
import { recordBetmanHeartbeat } from './status';

export interface IngestResult {
  count: number;
}

/**
 * 베트맨 승부식 응답(raw)을 받아 월드컵 1X2 배당을 저장한다.
 * - 파싱 결과가 없으면 count: 0 (저장 안 함, throw 안 함).
 * - 우리 경기 목록과 팀명으로 매칭해 matchId 를 보정한다.
 * 저장 실패(예: Supabase 오류)는 throw 한다.
 */
export async function ingestBetmanRaw(raw: string): Promise<IngestResult> {
  const parsed = parseBetmanGameSlip(raw);
  if (parsed.length === 0) return { count: 0 };

  const { matches } = await getMatches();
  const matched = matchOddsToMatches(parsed, matches);
  for (const o of matched) {
    await upsertOdds({ matchId: o.matchId, home: o.home, draw: o.draw, away: o.away });
  }
  // 베트맨 데이터를 성공적으로 받았으므로(파싱>0) 마지막 수집 시각 기록 → 배너 정확도.
  await recordBetmanHeartbeat();
  return { count: matched.length };
}
