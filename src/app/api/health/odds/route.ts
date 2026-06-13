// 배당 저장소 상태 점검(읽기 전용). 진단 테스트 찌꺼기(__healthcheck__)도 정리.
// 예: /api/health/odds
import { NextResponse } from 'next/server';
import { listOdds } from '@/lib/odds/store';
import { getSupabaseServer, isSupabaseConfigured } from '@/lib/db/supabase';
import { isOddsApiConfigured } from '@/lib/data-sources/theOddsApi';

export const dynamic = 'force-dynamic';

export async function GET() {
  // 이전 진단에서 남은 헬스체크 행 정리(있으면).
  try {
    await getSupabaseServer()?.from('odds').delete().eq('match_id', '__healthcheck__');
  } catch {
    /* 무시 */
  }

  const odds = await listOdds().catch(() => []);
  const bySource: Record<string, number> = {};
  for (const o of odds) bySource[o.source] = (bySource[o.source] ?? 0) + 1;

  return NextResponse.json({
    persistent: isSupabaseConfigured(),
    oddsApiConfigured: isOddsApiConfigured(),
    storedTotal: odds.length,
    bySource,
  });
}
