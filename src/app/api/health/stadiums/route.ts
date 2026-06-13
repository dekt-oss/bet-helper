// 진단용: worldcup26 경기장 목록 + 계산된 시간대 오프셋. 시간 매핑 교정용.
// 예: /api/health/stadiums
import { NextResponse } from 'next/server';
import { debugStadiums } from '@/lib/data-sources/worldcup26';

export const dynamic = 'force-dynamic';

export async function GET() {
  return NextResponse.json({ stadiums: await debugStadiums() });
}
