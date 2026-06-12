import { NextResponse } from 'next/server';
import { getOdds } from '@/lib/data-sources';

export async function GET() {
  const { odds, enabled } = await getOdds();
  return NextResponse.json({ enabled, count: odds.length, odds });
}
