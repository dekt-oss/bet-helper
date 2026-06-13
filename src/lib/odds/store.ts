// 베트맨 승부식 배당 저장소.
// 베트맨이 공식 API/스크래핑을 막아두어, 배당은 화면에서 입력해 DB(또는 JSON)에 저장한다.
// 저장된 배당은 승부식 탭과 베팅 등록 폼(승/무/패 배당)에 즉시 반영된다.

import { promises as fs } from 'fs';
import path from 'path';
import type { Odds } from '@/lib/types';
import { isSupabaseConfigured, getSupabaseServer } from '@/lib/db/supabase';

export interface OddsInput {
  matchId: string;
  home: number;
  draw: number;
  away: number;
  /** 배당 출처. 생략 시 'betman'(수동 입력). 자동 배당 스냅샷은 'oddsapi'. */
  source?: Odds['source'];
}

// ── 공개 API ──────────────────────────────────────────────

export async function listOdds(): Promise<Odds[]> {
  if (isSupabaseConfigured()) {
    try {
      return await sbListOdds();
    } catch (err) {
      console.error('[odds] Supabase 조회 실패 → 파일 폴백:', err);
      return fileListOdds();
    }
  }
  return fileListOdds();
}

export async function upsertOdds(input: OddsInput): Promise<Odds> {
  return isSupabaseConfigured() ? sbUpsertOdds(input) : fileUpsertOdds(input);
}

/** 배당을 matchId → Odds 맵으로. (폼 자동채움용) */
export function oddsMap(odds: Odds[]): Record<string, Odds> {
  const m: Record<string, Odds> = {};
  for (const o of odds) m[o.matchId] = o;
  return m;
}

// ── Supabase 백엔드 ──────────────────────────────────────

interface OddsRow {
  match_id: string;
  home: number;
  draw: number;
  away: number;
  source: string;
  updated_at: string;
}

function rowToOdds(r: OddsRow): Odds {
  return {
    matchId: r.match_id,
    home: Number(r.home),
    draw: Number(r.draw),
    away: Number(r.away),
    updatedAt: r.updated_at,
    source: (r.source as Odds['source']) ?? 'betman',
  };
}

async function sbListOdds(): Promise<Odds[]> {
  const sb = getSupabaseServer()!;
  const { data, error } = await sb
    .from('odds')
    .select('*')
    .order('updated_at', { ascending: false });
  if (error) throw new Error(`supabase listOdds: ${error.message}`);
  return (data as OddsRow[]).map(rowToOdds);
}

async function sbUpsertOdds(input: OddsInput): Promise<Odds> {
  const sb = getSupabaseServer()!;
  const { data, error } = await sb
    .from('odds')
    .upsert(
      {
        match_id: input.matchId,
        home: input.home,
        draw: input.draw,
        away: input.away,
        source: input.source ?? 'betman',
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'match_id' },
    )
    .select()
    .single();
  if (error) throw new Error(`supabase upsertOdds: ${error.message}`);
  return rowToOdds(data as OddsRow);
}

// ── 로컬 JSON 백엔드 (폴백) ──────────────────────────────

const DATA_DIR = path.join(process.cwd(), 'data');
const ODDS_FILE = path.join(DATA_DIR, 'odds.json');

async function readAll(): Promise<Odds[]> {
  try {
    return JSON.parse(await fs.readFile(ODDS_FILE, 'utf-8')) as Odds[];
  } catch (err: unknown) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return [];
    throw err;
  }
}

async function fileListOdds(): Promise<Odds[]> {
  return readAll();
}

async function fileUpsertOdds(input: OddsInput): Promise<Odds> {
  const all = await readAll();
  const odds: Odds = {
    matchId: input.matchId,
    home: input.home,
    draw: input.draw,
    away: input.away,
    updatedAt: new Date().toISOString(),
    source: input.source ?? 'betman',
  };
  const idx = all.findIndex((o) => o.matchId === input.matchId);
  if (idx === -1) all.push(odds);
  else all[idx] = odds;
  await fs.mkdir(DATA_DIR, { recursive: true });
  await fs.writeFile(ODDS_FILE, JSON.stringify(all, null, 2), 'utf-8');
  return odds;
}
