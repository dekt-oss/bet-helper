import { NextResponse } from 'next/server';
import { getOdds } from '@/lib/data-sources';

export async function GET() {
  const { odds, scraper } = await getOdds();
  return NextResponse.json({ scraper, count: odds.length, odds });
}
