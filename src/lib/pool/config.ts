// 공동자금(풀) 설정 — 친구들끼리 모은 돈과 베팅 규칙을 한 곳에서 관리한다.
// ⚠️ 멤버 이름은 실제 참여자에 맞게 수정하세요.
// (지금은 로컬/시드 기준 설정값. 추후 DB 전환 시 이 값들을 DB의 pool 테이블로 옮긴다.)

import type { Bet } from '@/lib/types';

export interface PoolMember {
  id: string;
  name: string;
  /** 출자액 (원) */
  contribution: number;
}

export interface PoolConfig {
  members: PoolMember[];
  /** 1판(베팅) 기본 베팅액 (원) */
  defaultStake: number;
  currency: string;
}

export const POOL: PoolConfig = {
  members: [
    { id: 'junhyeok', name: '임준혁', contribution: 50000 },
    { id: 'junhwan', name: '양준환', contribution: 50000 },
    { id: 'inwoo', name: '전인우', contribution: 50000 },
  ],
  defaultStake: 30000,
  currency: '원',
};

/** 의견/합의 기능에서 쓰는 고정 멤버 이름 목록. */
export const MEMBERS: string[] = POOL.members.map((m) => m.name);

/** 초기 자본 = 멤버 출자액 합계 (예: 3명 × 5만 = 15만) */
export const INITIAL_CAPITAL = POOL.members.reduce(
  (sum, m) => sum + m.contribution,
  0,
);

// 시드 베팅 — 앱을 처음 켰을 때(저장 파일 없음) 채워지는 초기 내역.
// 체코전: 3만원 베팅, 2.45배 적중, 73,500원 수령.
export const SEED_BETS: Bet[] = [
  {
    id: 'seed-czech-2026',
    matchId: '대한민국 vs 체코',
    placedBy: '공동',
    pick: 'HOME',
    oddsAtPlacement: 2.45,
    stake: 30000,
    status: 'WON',
    payout: 73500,
    note: '체코전 적중',
    createdAt: '2026-06-10T18:00:00.000Z',
  },
];
