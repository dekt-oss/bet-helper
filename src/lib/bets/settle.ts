// 전표(BetSlip)·폴(BetLeg) 정산 엔진 — 전부 순수 함수(테스트 용이).
//
// 경기 결과(스코어)만 있으면 모든 마켓을 계산한다(배당 테이블 의존 X).
//  - 1X2:      홈>원정→HOME, 동점→DRAW, 홈<원정→AWAY
//  - HANDICAP: (홈+handicap) vs 원정 으로 위와 동일 판정(정수 핸디 → 무 가능)
//  - OU:       (홈+원정) vs line → 초과 OVER / 미만 UNDER / 동일(정수 line)→환급(VOID)

import type { BetLeg, BetSlip, BetStatus, LegPick, MarketType } from '@/lib/types';

export interface Score {
  home: number;
  away: number;
}

/** 폴 배당의 곱을 소수 둘째 자리로 반올림한 총배당. */
export function combinedOdds(legs: Pick<BetLeg, 'oddsAtPlacement'>[]): number {
  const product = legs.reduce((p, l) => p * (l.oddsAtPlacement || 1), 1);
  return Math.round(product * 100) / 100;
}

/** 3-way(승무패/핸디 적용 후) 결과. */
function threeWay(home: number, away: number): LegPick {
  if (home > away) return 'HOME';
  if (home < away) return 'AWAY';
  return 'DRAW';
}

/**
 * 폴 한 줄을 경기 스코어로 정산한다.
 * 스코어가 없으면(미종료) 'PENDING'.
 */
export function settleLeg(
  leg: Pick<BetLeg, 'market' | 'pick' | 'line'>,
  score: Score | null | undefined,
): BetStatus {
  if (!score) return 'PENDING';
  const result = pickResult(leg.market, leg.line, score);
  if (result === 'VOID') return 'VOID';
  return result === leg.pick ? 'WON' : 'LOST';
}

/** 마켓별 정산 결과(적중 선택지) 또는 'VOID'(환급). */
function pickResult(
  market: MarketType,
  line: number | undefined,
  score: Score,
): LegPick | 'VOID' {
  if (market === 'OU') {
    const total = score.home + score.away;
    const l = line ?? 0;
    if (total === l) return 'VOID'; // 정수 기준선 동점 → 적중특례(환급)
    return total > l ? 'OVER' : 'UNDER';
  }
  // 1X2 / HANDICAP
  const adj = market === 'HANDICAP' ? score.home + (line ?? 0) : score.home;
  return threeWay(adj, score.away);
}

export interface SlipSettlement {
  status: BetStatus;
  payout: number | null;
  legStatuses: BetStatus[];
}

/**
 * 전표를 경기별 스코어 맵으로 정산한다.
 *  - 한 폴이라도 미종료 → 전표 PENDING(payout null).
 *  - 한 폴이라도 LOST → 전표 LOST, payout 0.
 *  - 전 폴 VOID → 전표 VOID, payout = 원금.
 *  - 그 외(WON/VOID 혼합) → 전표 WON, payout = round(stake × ∏ WON 폴 배당). (VOID 폴은 배당 1)
 */
export function settleSlip(
  slip: Pick<BetSlip, 'legs' | 'stake'>,
  scoreByMatch: Map<string, Score | undefined> | Record<string, Score | undefined>,
): SlipSettlement {
  const get = (id: string): Score | undefined =>
    scoreByMatch instanceof Map ? scoreByMatch.get(id) : scoreByMatch[id];

  const legStatuses = slip.legs.map((leg) => settleLeg(leg, get(leg.matchId)));

  if (legStatuses.some((s) => s === 'PENDING')) {
    return { status: 'PENDING', payout: null, legStatuses };
  }
  if (legStatuses.some((s) => s === 'LOST')) {
    return { status: 'LOST', payout: 0, legStatuses };
  }
  if (legStatuses.every((s) => s === 'VOID')) {
    return { status: 'VOID', payout: slip.stake, legStatuses };
  }
  // WON(+ 일부 VOID): 적중 폴 배당만 곱한다(환급 폴은 배당 1).
  const effective = slip.legs.reduce(
    (p, leg, i) => (legStatuses[i] === 'WON' ? p * leg.oddsAtPlacement : p),
    1,
  );
  return {
    status: 'WON',
    payout: Math.round(slip.stake * effective),
    legStatuses,
  };
}
