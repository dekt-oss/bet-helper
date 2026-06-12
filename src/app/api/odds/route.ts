import { NextResponse } from 'next/server';
import { getOdds } from '@/lib/data-sources';

export async function GET() {
  const { odds, scraper, api } = await getOdds();
  return NextResponse.json({ scraper, api, count: odds.length, odds });
}
