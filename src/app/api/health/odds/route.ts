// 배당 저장소/스냅샷 진단용(읽기 전용). 종료 경기 배당 미표시 원인 확인.
// 예: /api/health/odds
import { NextResponse } from 'next/server';
import { getOdds } from '@/lib/data-sources';
import { listOdds, upsertOdds } from '@/lib/odds/store';
import { isSupabaseConfigured } from '@/lib/db/supabase';

export const dynamic = 'force-dynamic';

export async function GET() {
  const { odds, api } = await getOdds();
  const matched = odds.filter((o) => !o.matchId.startsWith('oddsapi-'));
  const unmatched = odds.filter((o) => o.matchId.startsWith('oddsapi-'));

  // 직접 쓰기 테스트 — 실패 시 전체 에러 메시지 노출(스냅샷 미저장 원인 확인).
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

  const stored = await listOdds().catch((e) => {
    writeError = writeError ?? `listOdds: ${e instanceof Error ? e.message : e}`;
    return [] as Awaited<ReturnType<typeof listOdds>>;
  });
  const bySource: Record<string, number> = {};
  for (const o of stored) bySource[o.source] = (bySource[o.source] ?? 0) + 1;

  return NextResponse.json({
    persistent: isSupabaseConfigured(),
    oddsApiConfigured: api,
    getOddsTotal: odds.length,
    matchedCount: matched.length,
    unmatchedCount: unmatched.length,
    writeOk,
    writeError,
    storedTotal: stored.length,
    bySource,
  });
}
