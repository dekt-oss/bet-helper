// 공동자금 잔액/정산 계산 — 실제 현금 흐름을 모델링한다.
//
//   잔액 = 초기자본 - 나간돈(베팅액 합계) + 들어온돈(수령액 합계)
//   손익 = 들어온돈 - 나간돈
//
// 대기(PENDING) 베팅은 돈이 이미 나간 상태이므로 잔액에서 빠진다(잠긴 금액).
// 적중/무효로 수령액이 들어오면 다시 더해진다.

import type { BetStatus } from '@/lib/types';
import { INITIAL_CAPITAL, POOL } from './config';

/** 잔액 계산에 필요한 최소 형태 — 단일 Bet 과 전표(BetSlip) 모두 만족. */
export interface StakeItem {
  stake: number;
  payout?: number;
  status: BetStatus;
}

export interface PoolBalance {
  initial: number; // 초기 자본
  staked: number; // 누적 베팅액
  returned: number; // 누적 수령액
  balance: number; // 현재 잔액 (현금)
  profit: number; // 손익
  locked: number; // 정산 대기로 잠긴 금액
  betCount: number;
  settledCount: number;
  winRate: number;
  roi: number; // 수익률 (손익 / 초기자본)
}

export function computePoolBalance(bets: StakeItem[]): PoolBalance {
  const staked = bets.reduce((s, b) => s + b.stake, 0);
  const returned = bets.reduce((s, b) => s + (b.payout ?? 0), 0);
  const locked = bets
    .filter((b) => b.status === 'PENDING')
    .reduce((s, b) => s + b.stake, 0);

  const settled = bets.filter(
    (b) => b.status === 'WON' || b.status === 'LOST',
  );
  const won = bets.filter((b) => b.status === 'WON').length;

  return {
    initial: INITIAL_CAPITAL,
    staked,
    returned,
    balance: INITIAL_CAPITAL - staked + returned,
    profit: returned - staked,
    locked,
    betCount: bets.length,
    settledCount: settled.length,
    winRate: settled.length ? won / settled.length : 0,
    roi: INITIAL_CAPITAL ? (returned - staked) / INITIAL_CAPITAL : 0,
  };
}

export interface PerPerson {
  count: number; // 인원수
  contribution: number; // 개인당 출자액
  profit: number; // 개인당 손익(균등)
  balance: number; // 개인당 현재 잔액(균등)
}

/** 출자가 동일하므로 손익/잔액을 인원수로 균등 분배한 개인당 수치. */
export function computePerPerson(pool: PoolBalance): PerPerson {
  const count = POOL.members.length || 1;
  return {
    count,
    contribution: Math.round(pool.initial / count),
    profit: Math.round(pool.profit / count),
    balance: Math.round(pool.balance / count),
  };
}
