import { NextResponse } from 'next/server';
import { deleteSlip } from '@/lib/bets/slip-store';

// 전표 삭제.
export async function DELETE(
  _req: Request,
  { params }: { params: { id: string } },
) {
  const deleted = await deleteSlip(params.id);
  if (!deleted) {
    return NextResponse.json({ error: '해당 전표를 찾을 수 없습니다.' }, { status: 404 });
  }
  return NextResponse.json({ ok: true });
}
