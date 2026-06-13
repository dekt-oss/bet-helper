// 배당 저장소 상태 진단용. 스냅샷 영속 여부(Supabase 설정/소스별 개수)를 확인한다.
// 예: /api/health/odds
import { NextResponse } from 'next/server';
import { listOdds } from '@/lib/odds/store';
import { isSupabaseConfigured } from '@/lib/db/supabase';
import { isOddsApiConfigured } from '@/lib/data-sources/theOddsApi';

export const dynamic = 'force-dynamic';

export async function GET() {
  let odds: Awaited<ReturnType<typeof listOdds>> = [];
  let error: string | undefined;
  try {
    odds = await listOdds();
  } catch (err) {
    error = err instanceof Error ? err.message : String(err);
  }
  const bySource: Record<string, number> = {};
  for (const o of odds) bySource[o.source] = (bySource[o.source] ?? 0) + 1;

  return NextResponse.json({
    // 스냅샷이 Vercel 에서 살아남으려면 Supabase 가 켜져 있어야 한다(파일은 휘발).
    persistent: isSupabaseConfigured(),
    oddsApiConfigured: isOddsApiConfigured(),
    totalOdds: odds.length,
    bySource, // 예: { betman: 3, oddsapi: 12 } — oddsapi 가 스냅샷
    sampleMatchIds: odds.slice(0, 5).map((o) => o.matchId),
    error,
  });
}
