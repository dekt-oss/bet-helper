// 배당 저장소/스냅샷 진단용. 어느 Supabase 프로젝트에 연결됐는지 + 테이블 접근 가능 여부.
// 예: /api/health/odds
import { NextResponse } from 'next/server';
import { getOdds } from '@/lib/data-sources';
import { getSupabaseServer, isSupabaseConfigured } from '@/lib/db/supabase';

export const dynamic = 'force-dynamic';

async function probe(table: string) {
  const sb = getSupabaseServer();
  if (!sb) return { ok: false, error: 'no supabase client' };
  const { error, count } = await sb
    .from(table)
    .select('*', { count: 'exact', head: true });
  return error
    ? { ok: false, code: (error as { code?: string }).code, error: error.message }
    : { ok: true, count };
}

export async function GET() {
  const { odds, api } = await getOdds();
  const matched = odds.filter((o) => !o.matchId.startsWith('oddsapi-'));

  // 앱이 실제 연결된 Supabase 프로젝트 호스트(= 프로젝트 ref). NEXT_PUBLIC 이라 비밀 아님.
  let projectHost: string | null = null;
  try {
    const u = process.env.NEXT_PUBLIC_SUPABASE_URL;
    projectHost = u ? new URL(u).host : null;
  } catch {
    projectHost = 'invalid-url';
  }

  return NextResponse.json({
    persistent: isSupabaseConfigured(),
    projectHost, // 이 프로젝트에서 odds 테이블 SQL 을 실행했는지 확인하세요.
    oddsApiConfigured: api,
    getOddsTotal: odds.length,
    matchedCount: matched.length,
    // bets(기존 테이블)는 되는데 odds 만 안 되면 → odds 테이블이 이 프로젝트에 없음.
    oddsTable: await probe('odds'),
    betsTable: await probe('bets'),
  });
}
