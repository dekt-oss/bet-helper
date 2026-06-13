import { NextResponse } from 'next/server';
import { parseBetmanOdds } from '@/lib/data-sources/betman';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// 진단용(임시): Vercel 서버에서 베트맨이 응답하는지 확인한다.
// 브라우저로 /api/odds/diag-betman?url=<엔드포인트> 를 열면 결과 JSON 이 보인다.
// url 미지정 시 기본 protoMatchList.do 를 시도. 검증 끝나면 이 파일은 삭제한다.
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const target =
    searchParams.get('url') ||
    process.env.BETMAN_PROTO_URL ||
    'https://www.betman.co.kr/main/mainPage/gamebuy/protoMatchList.do';

  const headers: Record<string, string> = {
    'User-Agent':
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36',
    Referer: 'https://www.betman.co.kr/',
    'Accept-Language': 'ko-KR,ko;q=0.9',
    Accept: 'application/json, text/plain, */*',
  };

  const started = Date.now();
  try {
    const res = await fetch(target, { headers, signal: AbortSignal.timeout(12000) });
    const body = await res.text();
    let parsedCount = -1;
    try {
      parsedCount = (await parseBetmanOdds(body)).length;
    } catch {
      parsedCount = -2;
    }
    return NextResponse.json({
      ok: res.ok,
      target,
      httpStatus: res.status,
      elapsedMs: Date.now() - started,
      contentType: res.headers.get('content-type'),
      bodyLength: body.length,
      looksLikeJson: body.trimStart().startsWith('{') || body.trimStart().startsWith('['),
      parsedOddsCount: parsedCount, // >0 이면 서버 수집 가능!
      snippet: body.slice(0, 600),
    });
  } catch (err) {
    return NextResponse.json(
      {
        ok: false,
        target,
        elapsedMs: Date.now() - started,
        error: String(err),
        hint: '연결 거부/타임아웃이면 베트맨이 서버 IP 를 막는 것 → 확장 방식 유지.',
      },
      { status: 502 },
    );
  }
}
