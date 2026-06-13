// 배당 쓰기 실패 정밀 진단: URL 구성 + bets/odds 동일 쿼리 비교.
// 예: /api/health/odds
import { NextResponse } from 'next/server';
import {
  getSupabaseServer,
  isSupabaseConfigured,
  supabaseUrlDebug,
} from '@/lib/db/supabase';

export const dynamic = 'force-dynamic';

type PgErr = { code?: string; message?: string };

async function probe(table: string) {
  const sb = getSupabaseServer();
  if (!sb) return { ok: false, error: 'no client' };
  const { error, count } = await sb
    .from(table)
    .select('*', { count: 'exact' })
    .limit(1);
  if (!error) return { ok: true, count };
  const e = error as PgErr;
  return { ok: false, code: e.code, message: e.message };
}

async function writeProbe() {
  const sb = getSupabaseServer();
  if (!sb) return { ok: false, error: 'no client' };
  const { error } = await sb
    .from('odds')
    .upsert(
      {
        match_id: '__healthcheck__',
        home: 1.5,
        draw: 3,
        away: 5,
        source: 'oddsapi',
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'match_id' },
    )
    .select();
  if (!error) return { ok: true };
  const e = error as PgErr;
  return { ok: false, code: e.code, message: e.message };
}

export async function GET() {
  return NextResponse.json({
    persistent: isSupabaseConfigured(),
    url: supabaseUrlDebug(), // raw 에 끝슬래시/경로가 있는지 확인
    bets: await probe('bets'),
    odds: await probe('odds'),
    oddsWrite: await writeProbe(),
  });
}
