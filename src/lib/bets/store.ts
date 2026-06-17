// 공동 베팅내역 저장소.
// Supabase(공유 DB)가 설정돼 있으면 그쪽을, 아니면 로컬 JSON 파일을 사용한다.
// 인터페이스(listBets/addBet/updateBet)는 동일하므로 화면/액션 코드는 바뀌지 않는다.

import { promises as fs } from 'fs';
import path from 'path';
import { randomUUID } from 'crypto';
import { cache } from 'react';
import type { Bet, Match, Outcome } from '@/lib/types';
import { SEED_BETS } from '@/lib/pool/config';
import { isSupabaseConfigured, getSupabaseServer } from '@/lib/db/supabase';

// placedBy(건 사람)는 공동자금이라 더 이상 입력받지 않는다 — 없으면 '공동' 기본.
export type NewBet = Omit<Bet, 'id' | 'status' | 'createdAt' | 'placedBy'> &
  Partial<Pick<Bet, 'status' | 'placedBy'>>;

// ── 공개 API (백엔드 자동 선택) ──────────────────────────

export const listBets = cache(async (): Promise<Bet[]> => {
  if (isSupabaseConfigured()) {
    try {
      return await sbListBets();
    } catch (err) {
      // Supabase 실패(테이블 없음/권한 등) 시에도 페이지가 죽지 않도록 폴백.
      console.error('[store] Supabase 조회 실패 → 시드/파일로 폴백:', err);
      return fileListBets();
    }
  }
  return fileListBets();
});

/** 경기 결과(승/무/패). 스코어 없으면 null. */
function outcomeOf(m: Match): Outcome | null {
  if (m.status !== 'FINISHED' || !m.score) return null;
  if (m.score.home > m.score.away) return 'HOME';
  if (m.score.home < m.score.away) return 'AWAY';
  return 'DRAW';
}

/**
 * 베팅 목록을 조회하되, 경기가 종료된 PENDING 베팅을 결과대로 자동 정산한다.
 * - 적중: payout = round(stake × 배당), status WON / 미적중: 0, LOST.
 * - VOID·수정은 기존 수동 정산(SettleBet)으로.
 */
export async function listBetsSettled(matches: Match[]): Promise<Bet[]> {
  const bets = await listBets();
  const byId = new Map(matches.map((m) => [m.id, m]));
  const out: Bet[] = [];
  for (const b of bets) {
    if (b.status === 'PENDING') {
      const m = byId.get(b.matchId);
      const result = m ? outcomeOf(m) : null;
      if (result) {
        const won = result === b.pick;
        const patch: Partial<Bet> = won
          ? { status: 'WON', payout: Math.round(b.stake * b.oddsAtPlacement) }
          : { status: 'LOST', payout: 0 };
        try {
          await updateBet(b.id, patch);
          out.push({ ...b, ...patch });
          continue;
        } catch (err) {
          console.warn('[store] 자동 정산 실패(무시):', err);
        }
      }
    }
    out.push(b);
  }
  return out;
}

export async function addBet(input: NewBet): Promise<Bet> {
  return isSupabaseConfigured() ? sbAddBet(input) : fileAddBet(input);
}

export async function updateBet(
  id: string,
  patch: Partial<Bet>,
): Promise<Bet | null> {
  return isSupabaseConfigured()
    ? sbUpdateBet(id, patch)
    : fileUpdateBet(id, patch);
}

/** 베팅 한 건을 삭제한다. 삭제됐으면 true, 없으면 false. */
export async function deleteBet(id: string): Promise<boolean> {
  return isSupabaseConfigured() ? sbDeleteBet(id) : fileDeleteBet(id);
}

/** 모임 자금 현황 요약: 총 베팅액 / 적중 수령액 / 손익. (순수 함수) */
export function summarize(bets: Bet[]) {
  const totalStake = bets.reduce((s, b) => s + b.stake, 0);
  const totalPayout = bets.reduce((s, b) => s + (b.payout ?? 0), 0);
  const settled = bets.filter((b) => b.status === 'WON' || b.status === 'LOST');
  const won = bets.filter((b) => b.status === 'WON').length;
  return {
    count: bets.length,
    totalStake,
    totalPayout,
    profit: totalPayout - totalStake,
    settledCount: settled.length,
    winRate: settled.length ? won / settled.length : 0,
  };
}

// ── Supabase 백엔드 ──────────────────────────────────────

interface BetRow {
  id: string;
  match_id: string;
  placed_by: string;
  pick: Bet['pick'];
  odds_at_placement: number;
  stake: number;
  status: Bet['status'];
  payout: number | null;
  note: string | null;
  created_at: string;
}

function rowToBet(r: BetRow): Bet {
  return {
    id: r.id,
    matchId: r.match_id,
    placedBy: r.placed_by,
    pick: r.pick,
    oddsAtPlacement: Number(r.odds_at_placement),
    stake: r.stake,
    status: r.status,
    payout: r.payout ?? undefined,
    note: r.note ?? undefined,
    createdAt: r.created_at,
  };
}

async function sbListBets(): Promise<Bet[]> {
  const sb = getSupabaseServer()!;
  const { data, error } = await sb
    .from('bets')
    .select('*')
    .order('created_at', { ascending: false });
  if (error) throw new Error(`supabase listBets: ${error.message}`);
  return (data as BetRow[]).map(rowToBet);
}

async function sbAddBet(input: NewBet): Promise<Bet> {
  const sb = getSupabaseServer()!;
  const { data, error } = await sb
    .from('bets')
    .insert({
      match_id: input.matchId,
      placed_by: input.placedBy ?? '공동',
      pick: input.pick,
      odds_at_placement: input.oddsAtPlacement,
      stake: input.stake,
      status: input.status ?? 'PENDING',
      payout: input.payout ?? null,
      note: input.note ?? null,
    })
    .select()
    .single();
  if (error) throw new Error(`supabase addBet: ${error.message}`);
  return rowToBet(data as BetRow);
}

async function sbUpdateBet(
  id: string,
  patch: Partial<Bet>,
): Promise<Bet | null> {
  const sb = getSupabaseServer()!;
  const row: Record<string, unknown> = {};
  if (patch.status !== undefined) row.status = patch.status;
  if (patch.payout !== undefined) row.payout = patch.payout;
  if (patch.note !== undefined) row.note = patch.note;
  if (patch.oddsAtPlacement !== undefined)
    row.odds_at_placement = patch.oddsAtPlacement;
  const { data, error } = await sb
    .from('bets')
    .update(row)
    .eq('id', id)
    .select()
    .maybeSingle();
  if (error) throw new Error(`supabase updateBet: ${error.message}`);
  return data ? rowToBet(data as BetRow) : null;
}

async function sbDeleteBet(id: string): Promise<boolean> {
  const sb = getSupabaseServer()!;
  const { error } = await sb.from('bets').delete().eq('id', id);
  if (error) throw new Error(`supabase deleteBet: ${error.message}`);
  return true;
}

// ── 로컬 JSON 백엔드 (폴백) ──────────────────────────────

const DATA_DIR = path.join(process.cwd(), 'data');
const BETS_FILE = path.join(DATA_DIR, 'bets.json');

async function readAll(): Promise<Bet[]> {
  try {
    const raw = await fs.readFile(BETS_FILE, 'utf-8');
    return JSON.parse(raw) as Bet[];
  } catch (err: unknown) {
    // 저장 파일이 없으면 시드(체코전 등) 내역으로 시작한다.
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return [...SEED_BETS];
    throw err;
  }
}

async function writeAll(bets: Bet[]): Promise<void> {
  await fs.mkdir(DATA_DIR, { recursive: true });
  await fs.writeFile(BETS_FILE, JSON.stringify(bets, null, 2), 'utf-8');
}

async function fileListBets(): Promise<Bet[]> {
  const bets = await readAll();
  return bets.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

async function fileAddBet(input: NewBet): Promise<Bet> {
  const bets = await readAll();
  const bet: Bet = {
    ...input,
    placedBy: input.placedBy ?? '공동',
    id: randomUUID(),
    status: input.status ?? 'PENDING',
    createdAt: new Date().toISOString(),
  };
  bets.push(bet);
  await writeAll(bets);
  return bet;
}

async function fileUpdateBet(
  id: string,
  patch: Partial<Bet>,
): Promise<Bet | null> {
  const bets = await readAll();
  const idx = bets.findIndex((b) => b.id === id);
  if (idx === -1) return null;
  bets[idx] = { ...bets[idx], ...patch, id };
  await writeAll(bets);
  return bets[idx];
}

async function fileDeleteBet(id: string): Promise<boolean> {
  const bets = await readAll();
  const idx = bets.findIndex((b) => b.id === id);
  if (idx === -1) return false;
  bets.splice(idx, 1);
  await writeAll(bets);
  return true;
}
