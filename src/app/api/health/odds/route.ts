// 배당 쓰기 실패 정밀 진단: upsert vs insert, 전체 에러(code/details/hint).
// 예: /api/health/odds
import { NextResponse } from 'next/server';
import { getSupabaseServer, isSupabaseConfigured } from '@/lib/db/supabase';

export const dynamic = 'force-dynamic';

type PgErr = { code?: string; details?: string; hint?: string; message?: string };

async function tryWrite(useUpsert: boolean) {
  const sb = getSupabaseServer();
  if (!sb) return { ok: false, error: 'no client' };
  const row = {
    match_id: '__healthcheck__',
    home: 1.5,
    draw: 3,
    away: 5,
    source: 'oddsapi',
    updated_at: new Date().toISOString(),
  };
  const q = useUpsert
    ? sb.from('odds').upsert(row, { onConflict: 'match_id' })
    : sb.from('odds').insert(row);
  const { error } = await q.select();
  if (!error) return { ok: true };
  const e = error as PgErr;
  return { ok: false, message: e.message, code: e.code, details: e.details, hint: e.hint };
}

async function tryReadColumns() {
  const sb = getSupabaseServer();
  if (!sb) return { ok: false, error: 'no client' };
  // 한 행 읽어 컬럼 구조 확인(테이블이 우리가 기대한 스키마인지).
  const { data, error } = await sb.from('odds').select('*').limit(1);
  if (error) return { ok: false, message: (error as PgErr).message };
  return { ok: true, columns: data && data[0] ? Object.keys(data[0]) : '(빈 테이블)' };
}

export async function GET() {
  return NextResponse.json({
    persistent: isSupabaseConfigured(),
    read: await tryReadColumns(),
    upsert: await tryWrite(true),
    insert: await tryWrite(false),
  });
}
