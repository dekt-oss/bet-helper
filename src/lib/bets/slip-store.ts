// 구매전표(BetSlip) 저장소 — 복수게임(조합/다폴) 구매.
// Supabase(bet_slips + bet_legs) 또는 로컬 JSON(data/slips.json) 사용.
// 옛 단일 Bet 은 1폴 슬립으로 변환해 통합 목록에 함께 보여준다(무중단 하위호환).

import { promises as fs } from 'fs';
import path from 'path';
import { randomUUID } from 'crypto';
import type { BetLeg, BetSlip, Match } from '@/lib/types';
import { isSupabaseConfigured, getSupabaseServer } from '@/lib/db/supabase';
import { listBetsSettled } from './store';
import { combinedOdds, settleSlip, type Score } from './settle';

export type NewLeg = Omit<BetLeg, 'status'>;

export interface NewSlip {
  legs: NewLeg[];
  stake: number;
  placedBy?: string;
  note?: string;
}

/** 옛 단일 Bet 에서 변환된 경우 원본 id 를 들고 있는 표시용 슬립. */
export interface SlipView extends BetSlip {
  legacyBetId?: string;
}

// ── 공개 API ──────────────────────────────────────────────

export async function listSlips(): Promise<BetSlip[]> {
  if (isSupabaseConfigured()) {
    try {
      return await sbListSlips();
    } catch (err) {
      console.error('[slip] Supabase 조회 실패 → 파일 폴백:', err);
      return fileListSlips();
    }
  }
  return fileListSlips();
}

export async function addSlip(input: NewSlip): Promise<BetSlip> {
  const slip: BetSlip = {
    id: randomUUID(),
    placedBy: input.placedBy ?? '공동',
    legs: input.legs.map((l) => ({ ...l, status: 'PENDING' as const })),
    combinedOdds: combinedOdds(input.legs),
    stake: Math.round(input.stake),
    status: 'PENDING',
    note: input.note,
    createdAt: new Date().toISOString(),
  };
  if (isSupabaseConfigured()) {
    try {
      await sbAddSlip(slip);
      return slip;
    } catch (err) {
      console.error('[slip] Supabase 저장 실패 → 파일 폴백:', err);
    }
  }
  await fileAddSlip(slip);
  return slip;
}

export async function deleteSlip(id: string): Promise<boolean> {
  if (isSupabaseConfigured()) {
    try {
      return await sbDeleteSlip(id);
    } catch (err) {
      console.error('[slip] Supabase 삭제 실패 → 파일 폴백:', err);
    }
  }
  return fileDeleteSlip(id);
}

async function persistSettlement(slip: BetSlip): Promise<void> {
  if (isSupabaseConfigured()) {
    try {
      await sbUpdateSlip(slip);
      return;
    } catch (err) {
      console.warn('[slip] 정산 저장 실패(무시):', err);
      return;
    }
  }
  await fileUpdateSlip(slip);
}

function scoreMapOf(matches: Match[]): Map<string, Score | undefined> {
  const m = new Map<string, Score | undefined>();
  for (const match of matches) {
    if (match.status === 'FINISHED' && match.score) m.set(match.id, match.score);
  }
  return m;
}

/** 옛 단일 Bet 을 1폴 슬립으로 변환(표시용). */
function adaptBet(b: Awaited<ReturnType<typeof listBetsSettled>>[number]): SlipView {
  return {
    id: b.id,
    legacyBetId: b.id,
    placedBy: b.placedBy,
    legs: [
      {
        matchId: b.matchId,
        market: '1X2',
        pick: b.pick,
        oddsAtPlacement: b.oddsAtPlacement,
        status: b.status,
      },
    ],
    combinedOdds: b.oddsAtPlacement,
    stake: b.stake,
    status: b.status,
    payout: b.payout,
    note: b.note,
    createdAt: b.createdAt,
  };
}

/**
 * 통합 목록: (옛 단일 Bet → 1폴 슬립) + 네이티브 슬립.
 * 종료 경기의 PENDING 네이티브 슬립은 결과대로 자동 정산하고 결과를 영속화한다.
 */
export async function listSlipsUnified(matches: Match[]): Promise<SlipView[]> {
  const [legacyBets, native] = await Promise.all([
    listBetsSettled(matches), // 옛 단일 베팅(자동 정산 포함)
    listSlips(),
  ]);
  const scores = scoreMapOf(matches);

  const settledNative: SlipView[] = [];
  for (const slip of native) {
    if (slip.status === 'PENDING') {
      const r = settleSlip(slip, scores);
      if (r.status !== 'PENDING') {
        const next: BetSlip = {
          ...slip,
          status: r.status,
          payout: r.payout ?? undefined,
          legs: slip.legs.map((l, i) => ({ ...l, status: r.legStatuses[i] })),
        };
        await persistSettlement(next);
        settledNative.push(next);
        continue;
      }
    }
    settledNative.push(slip);
  }

  return [...settledNative, ...legacyBets.map(adaptBet)].sort((a, b) =>
    b.createdAt.localeCompare(a.createdAt),
  );
}

/** 통합 슬립 요약(총 구매액/적중금/손익/적중률). 순수 함수. */
export function summarizeSlips(slips: BetSlip[]) {
  const totalStake = slips.reduce((s, x) => s + x.stake, 0);
  const totalPayout = slips.reduce((s, x) => s + (x.payout ?? 0), 0);
  const settled = slips.filter((x) => x.status === 'WON' || x.status === 'LOST');
  const won = slips.filter((x) => x.status === 'WON').length;
  return {
    count: slips.length,
    totalStake,
    totalPayout,
    profit: totalPayout - totalStake,
    settledCount: settled.length,
    winRate: settled.length ? won / settled.length : 0,
  };
}

// ── Supabase 백엔드 ──────────────────────────────────────

interface SlipRow {
  id: string;
  placed_by: string;
  combined_odds: number;
  stake: number;
  status: BetSlip['status'];
  payout: number | null;
  note: string | null;
  created_at: string;
}
interface LegRow {
  slip_id: string;
  leg_index: number;
  match_id: string;
  market: BetLeg['market'];
  pick: BetLeg['pick'];
  line: number | null;
  odds_at_placement: number;
  status: BetLeg['status'];
}

async function sbListSlips(): Promise<BetSlip[]> {
  const sb = getSupabaseServer()!;
  const [{ data: slips, error: e1 }, { data: legs, error: e2 }] = await Promise.all([
    sb.from('bet_slips').select('*').order('created_at', { ascending: false }),
    sb.from('bet_legs').select('*').order('leg_index', { ascending: true }),
  ]);
  if (e1) throw new Error(`supabase listSlips: ${e1.message}`);
  if (e2) throw new Error(`supabase listLegs: ${e2.message}`);
  const legsBySlip = new Map<string, BetLeg[]>();
  for (const l of (legs ?? []) as LegRow[]) {
    const leg: BetLeg = {
      matchId: l.match_id,
      market: l.market,
      pick: l.pick,
      line: l.line ?? undefined,
      oddsAtPlacement: Number(l.odds_at_placement),
      status: l.status,
    };
    (legsBySlip.get(l.slip_id) ?? legsBySlip.set(l.slip_id, []).get(l.slip_id)!).push(leg);
  }
  return ((slips ?? []) as SlipRow[]).map((s) => ({
    id: s.id,
    placedBy: s.placed_by,
    legs: legsBySlip.get(s.id) ?? [],
    combinedOdds: Number(s.combined_odds),
    stake: s.stake,
    status: s.status,
    payout: s.payout ?? undefined,
    note: s.note ?? undefined,
    createdAt: s.created_at,
  }));
}

async function sbAddSlip(slip: BetSlip): Promise<void> {
  const sb = getSupabaseServer()!;
  const { error: e1 } = await sb.from('bet_slips').insert({
    id: slip.id,
    placed_by: slip.placedBy,
    combined_odds: slip.combinedOdds,
    stake: slip.stake,
    status: slip.status,
    payout: slip.payout ?? null,
    note: slip.note ?? null,
    created_at: slip.createdAt,
  });
  if (e1) throw new Error(`supabase addSlip: ${e1.message}`);
  const legRows = slip.legs.map((l, i) => ({
    slip_id: slip.id,
    leg_index: i,
    match_id: l.matchId,
    market: l.market,
    pick: l.pick,
    line: l.line ?? null,
    odds_at_placement: l.oddsAtPlacement,
    status: l.status,
  }));
  const { error: e2 } = await sb.from('bet_legs').insert(legRows);
  if (e2) throw new Error(`supabase addLegs: ${e2.message}`);
}

async function sbUpdateSlip(slip: BetSlip): Promise<void> {
  const sb = getSupabaseServer()!;
  const { error: e1 } = await sb
    .from('bet_slips')
    .update({ status: slip.status, payout: slip.payout ?? null })
    .eq('id', slip.id);
  if (e1) throw new Error(`supabase updateSlip: ${e1.message}`);
  for (let i = 0; i < slip.legs.length; i += 1) {
    const { error } = await sb
      .from('bet_legs')
      .update({ status: slip.legs[i].status })
      .eq('slip_id', slip.id)
      .eq('leg_index', i);
    if (error) throw new Error(`supabase updateLeg: ${error.message}`);
  }
}

async function sbDeleteSlip(id: string): Promise<boolean> {
  const sb = getSupabaseServer()!;
  await sb.from('bet_legs').delete().eq('slip_id', id);
  const { error } = await sb.from('bet_slips').delete().eq('id', id);
  if (error) throw new Error(`supabase deleteSlip: ${error.message}`);
  return true;
}

// ── 로컬 JSON 백엔드 (폴백) ──────────────────────────────

const DATA_DIR = path.join(process.cwd(), 'data');
const FILE = path.join(DATA_DIR, 'slips.json');

async function readAll(): Promise<BetSlip[]> {
  try {
    return JSON.parse(await fs.readFile(FILE, 'utf-8')) as BetSlip[];
  } catch (err: unknown) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return [];
    throw err;
  }
}

async function writeAll(slips: BetSlip[]): Promise<void> {
  await fs.mkdir(DATA_DIR, { recursive: true });
  await fs.writeFile(FILE, JSON.stringify(slips, null, 2), 'utf-8');
}

async function fileListSlips(): Promise<BetSlip[]> {
  return (await readAll()).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

async function fileAddSlip(slip: BetSlip): Promise<void> {
  const all = await readAll();
  all.push(slip);
  await writeAll(all);
}

async function fileUpdateSlip(slip: BetSlip): Promise<void> {
  const all = await readAll();
  const idx = all.findIndex((s) => s.id === slip.id);
  if (idx === -1) return;
  all[idx] = slip;
  await writeAll(all);
}

async function fileDeleteSlip(id: string): Promise<boolean> {
  const all = await readAll();
  const idx = all.findIndex((s) => s.id === id);
  if (idx === -1) return false;
  all.splice(idx, 1);
  await writeAll(all);
  return true;
}
