// 공동 베팅내역 저장소.
// MVP 단계에서는 파일(JSON) 기반으로 단순하게 시작한다.
// 추후 사용량이 늘면 SQLite/Postgres 로 교체하기 쉽도록 인터페이스를 분리해 둔다.

import { promises as fs } from 'fs';
import path from 'path';
import { randomUUID } from 'crypto';
import type { Bet } from '@/lib/types';

const DATA_DIR = path.join(process.cwd(), 'data');
const BETS_FILE = path.join(DATA_DIR, 'bets.json');

async function readAll(): Promise<Bet[]> {
  try {
    const raw = await fs.readFile(BETS_FILE, 'utf-8');
    return JSON.parse(raw) as Bet[];
  } catch (err: unknown) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return [];
    throw err;
  }
}

async function writeAll(bets: Bet[]): Promise<void> {
  await fs.mkdir(DATA_DIR, { recursive: true });
  await fs.writeFile(BETS_FILE, JSON.stringify(bets, null, 2), 'utf-8');
}

export async function listBets(): Promise<Bet[]> {
  const bets = await readAll();
  return bets.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export type NewBet = Omit<Bet, 'id' | 'status' | 'createdAt'> &
  Partial<Pick<Bet, 'status'>>;

export async function addBet(input: NewBet): Promise<Bet> {
  const bets = await readAll();
  const bet: Bet = {
    ...input,
    id: randomUUID(),
    status: input.status ?? 'PENDING',
    createdAt: new Date().toISOString(),
  };
  bets.push(bet);
  await writeAll(bets);
  return bet;
}

export async function updateBet(
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

/** 모임 자금 현황 요약: 총 베팅액 / 적중 수령액 / 손익. */
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
