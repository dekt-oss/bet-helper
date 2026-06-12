import { NextResponse } from 'next/server';
import { updateBet } from '@/lib/bets/store';
import type { Bet } from '@/lib/types';

// 정산: 적중/미적중/무효 처리 및 수령액 기록
export async function PATCH(
  req: Request,
  { params }: { params: { id: string } },
) {
  let patch: Partial<Bet>;
  try {
    patch = (await req.json()) as Partial<Bet>;
  } catch {
    return NextResponse.json({ error: '잘못된 JSON 입니다.' }, { status: 400 });
  }

  const updated = await updateBet(params.id, patch);
  if (!updated) {
    return NextResponse.json(
      { error: '해당 베팅을 찾을 수 없습니다.' },
      { status: 404 },
    );
  }
  return NextResponse.json(updated);
}
