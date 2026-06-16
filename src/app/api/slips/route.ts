import { NextResponse } from 'next/server';
import { addSlip, listSlips, summarizeSlips, type NewLeg } from '@/lib/bets/slip-store';
import type { LegPick, MarketType } from '@/lib/types';

export async function GET() {
  const slips = await listSlips();
  return NextResponse.json({ summary: summarizeSlips(slips), slips });
}

const MARKETS: MarketType[] = ['1X2', 'HANDICAP', 'OU'];
const PICKS: LegPick[] = ['HOME', 'DRAW', 'AWAY', 'OVER', 'UNDER'];

// 마켓별 허용 선택지(검증용).
const ALLOWED: Record<MarketType, LegPick[]> = {
  '1X2': ['HOME', 'DRAW', 'AWAY'],
  HANDICAP: ['HOME', 'DRAW', 'AWAY'],
  OU: ['OVER', 'UNDER'],
};

export async function POST(req: Request) {
  let body: { legs?: unknown; stake?: unknown; note?: unknown };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: '잘못된 JSON 입니다.' }, { status: 400 });
  }

  const rawLegs = Array.isArray(body.legs) ? body.legs : [];
  const stake = Number(body.stake);
  if (rawLegs.length === 0) {
    return NextResponse.json({ error: '최소 1개 폴이 필요합니다.' }, { status: 400 });
  }
  if (!Number.isFinite(stake) || stake <= 0) {
    return NextResponse.json({ error: '금액은 0보다 커야 합니다.' }, { status: 400 });
  }

  const legs: NewLeg[] = [];
  const seen = new Set<string>();
  for (const l of rawLegs as Record<string, unknown>[]) {
    const matchId = String(l.matchId ?? '').trim();
    const market = l.market as MarketType;
    const pick = l.pick as LegPick;
    const odds = Number(l.oddsAtPlacement);
    const line = l.line == null ? undefined : Number(l.line);
    if (!matchId) return NextResponse.json({ error: '경기가 비었습니다.' }, { status: 400 });
    if (!MARKETS.includes(market) || !PICKS.includes(pick) || !ALLOWED[market].includes(pick))
      return NextResponse.json({ error: '마켓/선택지가 올바르지 않습니다.' }, { status: 400 });
    if (!Number.isFinite(odds) || odds <= 0)
      return NextResponse.json({ error: '배당이 올바르지 않습니다.' }, { status: 400 });
    // 한 전표에 같은 경기 중복 불가(베트맨 규칙).
    if (seen.has(matchId))
      return NextResponse.json({ error: '같은 경기를 중복해서 담을 수 없습니다.' }, { status: 400 });
    seen.add(matchId);
    legs.push({
      matchId,
      market,
      pick,
      oddsAtPlacement: odds,
      line: line != null && Number.isFinite(line) ? line : undefined,
    });
  }

  const note = typeof body.note === 'string' ? body.note : undefined;
  const slip = await addSlip({ legs, stake, note });
  return NextResponse.json(slip, { status: 201 });
}
