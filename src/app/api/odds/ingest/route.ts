import { NextResponse } from 'next/server';
import { ingestBetmanRaw } from '@/lib/odds/ingest';

export const runtime = 'nodejs';

// 크롬 확장(사용자 브라우저)이 캡처한 베트맨 gameSlip.do 원본을 받아 저장한다.
// POST { raw: string }  헤더 x-ingest-token: ODDS_INGEST_TOKEN
export async function POST(req: Request) {
  const token = process.env.ODDS_INGEST_TOKEN;
  if (!token) {
    return NextResponse.json(
      { ok: false, error: 'ODDS_INGEST_TOKEN 이 서버에 설정되지 않았습니다.' },
      { status: 500 },
    );
  }
  if (req.headers.get('x-ingest-token') !== token) {
    return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 });
  }

  let raw = '';
  try {
    const body = (await req.json()) as { raw?: unknown };
    if (typeof body?.raw === 'string') raw = body.raw;
  } catch {
    return NextResponse.json({ ok: false, error: 'JSON 본문이 올바르지 않습니다.' }, { status: 400 });
  }
  if (!raw.trim()) {
    return NextResponse.json({ ok: false, error: 'raw(베트맨 응답)가 필요합니다.' }, { status: 400 });
  }

  try {
    const { count } = await ingestBetmanRaw(raw);
    if (count === 0) {
      return NextResponse.json(
        { ok: false, error: '월드컵 승무패 배당을 찾지 못했습니다. gameSlip.do 응답이 맞는지 확인하세요.' },
        { status: 422 },
      );
    }
    return NextResponse.json({ ok: true, count });
  } catch (err) {
    console.error('[ingest] 저장 실패:', err);
    return NextResponse.json(
      { ok: false, error: '저장 실패: Supabase odds 테이블을 확인하세요 (odds.sql 실행).' },
      { status: 500 },
    );
  }
}
