// worldcup26.ir 연동 진단용. 운영에서 실제 응답 상태/원인을 확인한다.
// 예: /api/health/worldcup26
import { NextResponse } from 'next/server';
import { diagnoseWorldcup26 } from '@/lib/data-sources/worldcup26';

export const dynamic = 'force-dynamic';

export async function GET() {
  const diag = await diagnoseWorldcup26();
  return NextResponse.json(diag);
}
