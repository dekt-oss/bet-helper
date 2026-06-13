// 배당 저장소/스냅샷 진단용. 종료 경기 배당 미표시 원인을 좁힌다.
// 예: /api/health/odds
import { NextResponse } from 'next/server';
import { getOdds } from '@/lib/data-sources';
import { listOdds, upsertOdds } from '@/lib/odds/store';
import { isSupabaseConfigured } from '@/lib/db/supabase';

export const dynamic = 'force-dynamic';

export async function GET() {
  // 1) getOdds 가 실제로 반환하는 배당(라이브 매칭 포함)
  const { odds, api } = await getOdds();
  const matched = odds.filter((o) => !o.matchId.startsWith('oddsapi-'));
  const unmatched = odds.filter((o) => o.matchId.startsWith('oddsapi-'));

  // 2) DB 쓰기가 되는지 직접 테스트(스냅샷 소스)
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

  // 3) 쓰기 후 테이블 상태
  const stored = await listOdds().catch(() => []);
  const bySource: Record<string, number> = {};
  for (const o of stored) bySource[o.source] = (bySource[o.source] ?? 0) + 1;

  return NextResponse.json({
    persistent: isSupabaseConfigured(),
    oddsApiConfigured: api,
    getOddsTotal: odds.length,
    matchedCount: matched.length,
    unmatchedCount: unmatched.length,
    matchedSample: matched.slice(0, 5).map((o) => o.matchId),
    // 매칭 실패한 자동 배당의 팀쌍(어떤 팀이 안 붙는지 확인)
    unmatchedTeamsSample: unmatched.slice(0, 8).map((o) => o.externalRef),
    writeOk,
    writeError,
    storedTotal: stored.length,
    bySource,
  });
}
