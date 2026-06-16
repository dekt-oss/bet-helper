// 멀티마켓 배당(승무패+핸디캡+언더오버) 저장소.
// 기존 odds(1X2 단일) 저장소와 별도로, market_odds 테이블/JSON 에 마켓별로 저장한다.
// 키: (matchId, market, line) — 같은 경기라도 핸디/기준선이 다르면 별도 행.

import { promises as fs } from 'fs';
import path from 'path';
import type { MarketOdds, MarketType } from '@/lib/types';
import { isSupabaseConfigured, getSupabaseServer } from '@/lib/db/supabase';

/** (matchId, market, line) 복합키 문자열. line 은 핸디 또는 OU 기준선. */
export function marketKey(o: {
  matchId: string;
  market: MarketType;
  handicap?: number;
  line?: number;
}): string {
  const lineVal = o.market === 'HANDICAP' ? o.handicap : o.line;
  return `${o.matchId}::${o.market}::${lineVal ?? ''}`;
}

// ── 공개 API ──────────────────────────────────────────────

export async function listMarketOdds(): Promise<MarketOdds[]> {
  if (isSupabaseConfigured()) {
    try {
      return await sbList();
    } catch (err) {
      console.error('[market-odds] Supabase 조회 실패 → 파일 폴백:', err);
      return fileList();
    }
  }
  return fileList();
}

export async function upsertMarketOdds(input: MarketOdds): Promise<void> {
  if (isSupabaseConfigured()) {
    try {
      await sbUpsert(input);
      return;
    } catch (err) {
      console.error('[market-odds] Supabase 저장 실패 → 파일 폴백:', err);
    }
  }
  await fileUpsert(input);
}

/** 여러 건을 한 번에 upsert. */
export async function upsertMarketOddsMany(rows: MarketOdds[]): Promise<number> {
  let count = 0;
  for (const r of rows) {
    await upsertMarketOdds(r);
    count += 1;
  }
  return count;
}

/** matchId → 마켓 목록 맵(화면용). */
export function marketOddsByMatch(
  odds: MarketOdds[],
): Record<string, MarketOdds[]> {
  const m: Record<string, MarketOdds[]> = {};
  for (const o of odds) (m[o.matchId] ??= []).push(o);
  return m;
}

// ── Supabase 백엔드 ──────────────────────────────────────

interface Row {
  match_id: string;
  market: string;
  bet_id: string | null;
  home: number | null;
  draw: number | null;
  away: number | null;
  handicap: number | null;
  line: number | null;
  over: number | null;
  under: number | null;
  source: string;
  updated_at: string;
}

function rowToMarketOdds(r: Row): MarketOdds {
  return {
    matchId: r.match_id,
    market: r.market as MarketType,
    betId: r.bet_id ?? undefined,
    home: r.home ?? undefined,
    draw: r.draw ?? undefined,
    away: r.away ?? undefined,
    handicap: r.handicap ?? undefined,
    line: r.line ?? undefined,
    over: r.over ?? undefined,
    under: r.under ?? undefined,
    updatedAt: r.updated_at,
    source: (r.source as MarketOdds['source']) ?? 'betman',
  };
}

async function sbList(): Promise<MarketOdds[]> {
  const sb = getSupabaseServer()!;
  const { data, error } = await sb
    .from('market_odds')
    .select('*')
    .order('updated_at', { ascending: false });
  if (error) throw new Error(`supabase listMarketOdds: ${error.message}`);
  return (data as Row[]).map(rowToMarketOdds);
}

async function sbUpsert(o: MarketOdds): Promise<void> {
  const sb = getSupabaseServer()!;
  const lineVal = o.market === 'HANDICAP' ? (o.handicap ?? 0) : (o.line ?? 0);
  const { error } = await sb.from('market_odds').upsert(
    {
      match_id: o.matchId,
      market: o.market,
      line_key: lineVal,
      bet_id: o.betId ?? null,
      home: o.home ?? null,
      draw: o.draw ?? null,
      away: o.away ?? null,
      handicap: o.handicap ?? null,
      line: o.line ?? null,
      over: o.over ?? null,
      under: o.under ?? null,
      source: o.source,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'match_id,market,line_key' },
  );
  if (error) throw new Error(`supabase upsertMarketOdds: ${error.message}`);
}

// ── 로컬 JSON 백엔드 (폴백) ──────────────────────────────

const DATA_DIR = path.join(process.cwd(), 'data');
const FILE = path.join(DATA_DIR, 'market-odds.json');

async function readAll(): Promise<MarketOdds[]> {
  try {
    return JSON.parse(await fs.readFile(FILE, 'utf-8')) as MarketOdds[];
  } catch (err: unknown) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return [];
    throw err;
  }
}

async function fileList(): Promise<MarketOdds[]> {
  return readAll();
}

async function fileUpsert(o: MarketOdds): Promise<void> {
  const all = await readAll();
  const key = marketKey(o);
  const idx = all.findIndex((x) => marketKey(x) === key);
  const next = { ...o, updatedAt: new Date().toISOString() };
  if (idx === -1) all.push(next);
  else all[idx] = next;
  await fs.mkdir(DATA_DIR, { recursive: true });
  await fs.writeFile(FILE, JSON.stringify(all, null, 2), 'utf-8');
}
