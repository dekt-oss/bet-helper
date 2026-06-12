import { NextResponse } from 'next/server';
import { addBet, listBets, summarize, type NewBet } from '@/lib/bets/store';

export async function GET() {
  const bets = await listBets();
  return NextResponse.json({ summary: summarize(bets), bets });
}

export async function POST(req: Request) {
  let body: Partial<NewBet>;
  try {
    body = (await req.json()) as Partial<NewBet>;
  } catch {
    return NextResponse.json({ error: '잘못된 JSON 입니다.' }, { status: 400 });
  }

  const { matchId, placedBy, pick, oddsAtPlacement, stake } = body;
  if (!matchId || !placedBy || !pick || !oddsAtPlacement || !stake) {
    return NextResponse.json(
      { error: 'matchId, placedBy, pick, oddsAtPlacement, stake 는 필수입니다.' },
      { status: 400 },
    );
  }

  const bet = await addBet({
    matchId,
    placedBy,
    pick,
    oddsAtPlacement,
    stake,
    note: body.note,
  });
  return NextResponse.json(bet, { status: 201 });
}
