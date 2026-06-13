// 배당 저장소/스냅샷 진단용(읽기 전용). 종료 경기 배당 미표시 원인 확인.
// 예: /api/health/odds
import { NextResponse } from 'next/server';
import { getOdds } from '@/lib/data-sources';
import { listOdds } from '@/lib/odds/store';
import { isSupabaseConfigured } from '@/lib/db/supabase';

export const dynamic = 'force-dynamic';

export async function GET() {
  const { odds, api } = await getOdds();
  const matched = odds.filter((o) => !o.matchId.startsWith('oddsapi-'));
  const unmatched = odds.filter((o) => o.matchId.startsWith('oddsapi-'));

  const stored = await listOdds().catch(() => []);
  const bySource: Record<string, number> = {};
  for (const o of stored) bySource[o.source] = (bySource[o.source] ?? 0) + 1;

  return NextResponse.json({
    persistent: isSupabaseConfigured(),
    oddsApiConfigured: api,
    getOddsTotal: odds.length,
    matchedCount: matched.length,
    unmatchedCount: unmatched.length,
    unmatchedTeamsSample: unmatched.slice(0, 8).map((o) => o.externalRef),
    // storedTotal 이 0 이면 odds 테이블 미생성(supabase/odds.sql 실행 필요).
    storedTotal: stored.length,
    bySource,
  });
}
