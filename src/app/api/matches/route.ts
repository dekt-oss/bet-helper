import { NextResponse } from 'next/server';
import { getMatches } from '@/lib/data-sources';

export async function GET() {
  try {
    const { matches, source } = await getMatches();
    return NextResponse.json({ source, count: matches.length, matches });
  } catch (err) {
    return NextResponse.json(
      { error: '경기 데이터를 불러오지 못했습니다.', detail: String(err) },
      { status: 502 },
    );
  }
}
