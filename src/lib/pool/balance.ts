// 공동자금 잔액/정산 계산 — 실제 현금 흐름을 모델링한다.
//
//   잔액 = 초기자본 - 나간돈(베팅액 합계) + 들어온돈(수령액 합계)
//   손익 = 들어온돈 - 나간돈
//
// 대기(PENDING) 베팅은 돈이 이미 나간 상태이므로 잔액에서 빠진다(잠긴 금액).
// 적중/무효로 수령액이 들어오면 다시 더해진다.

import type { Bet } from '@/lib/types';
import { INITIAL_CAPITAL, POOL } from './config';

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

export function computePoolBalance(bets: Bet[]): PoolBalance {
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

export interface MemberShare {
  id: string;
  name: string;
  contribution: number;
  /** 손익을 출자비율로 나눈 몫 */
  profitShare: number;
  /** 현재 지분 가치 = 출자액 + 손익몫 */
  equity: number;
}

/** 손익을 출자비율대로 나눠 멤버별 지분 가치를 계산한다. */
export function computeMemberShares(profit: number): MemberShare[] {
  const total = INITIAL_CAPITAL || 1;
  return POOL.members.map((m) => {
    const ratio = m.contribution / total;
    const profitShare = Math.round(profit * ratio);
    return {
      id: m.id,
      name: m.name,
      contribution: m.contribution,
      profitShare,
      equity: m.contribution + profitShare,
    };
  });
}
