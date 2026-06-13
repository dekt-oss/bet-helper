// 배당 저장소 최종 점검: 쓰기 성공 여부 + 실제 저장 개수.
// 예: /api/health/odds
import { NextResponse } from 'next/server';
import { getOdds } from '@/lib/data-sources';
import { listOdds, upsertOdds } from '@/lib/odds/store';
import { isSupabaseConfigured } from '@/lib/db/supabase';

export const dynamic = 'force-dynamic';

export async function GET() {
  // getOdds 가 매칭 배당을 스냅샷으로 DB 에 기록(odds 테이블).
  const { odds, api } = await getOdds();
  const matched = odds.filter((o) => !o.matchId.startsWith('oddsapi-'));

  // 직접 쓰기 테스트.
  let writeOk = false;
  let writeError: string | undefined;
  try {
    await upsertOdds({
      matchId: '__healthcheck__',
      home: 1.5,
      draw: 3,
      away: 5,
      source: 'oddsapi',
    });
    writeOk = true;
  } catch (err) {
    writeError = err instanceof Error ? err.message : String(err);
  }

  const stored = await listOdds().catch(() => []);
  const bySource: Record<string, number> = {};
  for (const o of stored) bySource[o.source] = (bySource[o.source] ?? 0) + 1;

  return NextResponse.json({
    persistent: isSupabaseConfigured(),
    oddsApiConfigured: api,
    matchedCount: matched.length,
    writeOk,
    writeError,
    storedTotal: stored.length, // 0 보다 크면 배당이 DB 에 저장되는 중 = 종료 경기 배당 유지 OK
    bySource, // 예: { oddsapi: 60+ }
  });
}
