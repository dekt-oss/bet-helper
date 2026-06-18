// 전표/폴 정산 엔진 단위 테스트.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { settleLeg, settleSlip, combinedOdds } from './settle';
import type { BetLeg } from '@/lib/types';

test('settleLeg 1X2: 스코어로 승/무/패 판정', () => {
  assert.equal(settleLeg({ market: '1X2', pick: 'HOME' }, { home: 2, away: 0 }), 'WON');
  assert.equal(settleLeg({ market: '1X2', pick: 'AWAY' }, { home: 2, away: 0 }), 'LOST');
  assert.equal(settleLeg({ market: '1X2', pick: 'DRAW' }, { home: 1, away: 1 }), 'WON');
  assert.equal(settleLeg({ market: '1X2', pick: 'HOME' }, null), 'PENDING');
});

test('settleLeg HANDICAP: 홈 기준 핸디 적용 후 판정', () => {
  // 홈 -1 핸디, 실제 2:0 → 보정 1:0 → 홈 승
  assert.equal(settleLeg({ market: 'HANDICAP', pick: 'HOME', line: -1 }, { home: 2, away: 0 }), 'WON');
  // 홈 -1 핸디, 실제 1:0 → 보정 0:0 → 무
  assert.equal(settleLeg({ market: 'HANDICAP', pick: 'DRAW', line: -1 }, { home: 1, away: 0 }), 'WON');
  assert.equal(settleLeg({ market: 'HANDICAP', pick: 'HOME', line: -1 }, { home: 1, away: 0 }), 'LOST');
  // 약팀 플핸 +1, 실제 0:1 → 보정 1:1 → 무 → AWAY 픽이면 미적중
  assert.equal(settleLeg({ market: 'HANDICAP', pick: 'AWAY', line: 1 }, { home: 0, away: 1 }), 'LOST');
});

test('settleLeg OU: 합산 득점 기준선 비교, 정수 동점은 환급(VOID)', () => {
  assert.equal(settleLeg({ market: 'OU', pick: 'OVER', line: 2.5 }, { home: 2, away: 1 }), 'WON');
  assert.equal(settleLeg({ market: 'OU', pick: 'UNDER', line: 2.5 }, { home: 1, away: 1 }), 'WON');
  assert.equal(settleLeg({ market: 'OU', pick: 'OVER', line: 3 }, { home: 1, away: 2 }), 'VOID'); // 합 3 = 기준 3
  assert.equal(settleLeg({ market: 'OU', pick: 'OVER', line: 3 }, { home: 2, away: 2 }), 'WON');
});

test('combinedOdds: 베트맨 적중배당률(셋째자리 절사 후 둘째자리 절상=1자리 올림)', () => {
  // 1.24×1.67×2.13 = 4.4108 → 4.41 → 4.5 (베트맨 표기와 일치)
  assert.equal(
    combinedOdds([
      { oddsAtPlacement: 1.24 },
      { oddsAtPlacement: 1.67 },
      { oddsAtPlacement: 2.13 },
    ]),
    4.5,
  );
  // 1.85×2.1 = 3.885 → 3.88 → 3.9
  assert.equal(combinedOdds([{ oddsAtPlacement: 1.85 }, { oddsAtPlacement: 2.1 }]), 3.9);
  // 1.8×1.5 = 2.7 → 2.7 (정수 1자리는 그대로)
  assert.equal(combinedOdds([{ oddsAtPlacement: 1.8 }, { oddsAtPlacement: 1.5 }]), 2.7);
  // 단폴: 배당 그대로(절상 안 함) — 2.13 → 2.13, 1.5 → 1.5
  assert.equal(combinedOdds([{ oddsAtPlacement: 2.13 }]), 2.13);
  assert.equal(combinedOdds([{ oddsAtPlacement: 1.5 }]), 1.5);
});

function leg(over: Partial<BetLeg>): BetLeg {
  return { matchId: 'm', market: '1X2', pick: 'HOME', oddsAtPlacement: 2, status: 'PENDING', ...over };
}

test('settleSlip: 전 폴 적중이면 WON, 총배당으로 수령', () => {
  const slip = {
    stake: 10000,
    legs: [
      leg({ matchId: 'a', oddsAtPlacement: 2 }),
      leg({ matchId: 'b', oddsAtPlacement: 1.5 }),
    ],
  };
  const r = settleSlip(slip, { a: { home: 1, away: 0 }, b: { home: 1, away: 0 } });
  assert.equal(r.status, 'WON');
  assert.equal(r.payout, 30000); // 10000 × 2 × 1.5
});

test('settleSlip: 한 폴이라도 미적중이면 LOST(payout 0)', () => {
  const slip = {
    stake: 10000,
    legs: [leg({ matchId: 'a' }), leg({ matchId: 'b', pick: 'AWAY' })],
  };
  const r = settleSlip(slip, { a: { home: 1, away: 0 }, b: { home: 1, away: 0 } });
  assert.equal(r.status, 'LOST');
  assert.equal(r.payout, 0);
});

test('settleSlip: 환급 폴은 배당 1로 제외, 나머지 적중이면 WON', () => {
  const slip = {
    stake: 10000,
    legs: [
      leg({ matchId: 'a', oddsAtPlacement: 2 }),
      leg({ matchId: 'b', market: 'OU', pick: 'OVER', line: 3, oddsAtPlacement: 1.9 }),
    ],
  };
  // b 는 합 3 = 기준 3 → VOID. a 는 적중. payout = 10000 × 2 = 20000
  const r = settleSlip(slip, { a: { home: 1, away: 0 }, b: { home: 1, away: 2 } });
  assert.equal(r.status, 'WON');
  assert.equal(r.payout, 20000);
});

test('settleSlip: 미종료 폴이 있으면 PENDING', () => {
  const slip = { stake: 10000, legs: [leg({ matchId: 'a' }), leg({ matchId: 'b' })] };
  const r = settleSlip(slip, { a: { home: 1, away: 0 } });
  assert.equal(r.status, 'PENDING');
  assert.equal(r.payout, null);
});

test('settleSlip: 먼저 끝난 폴이 낙첨이면 나머지 대기여도 전체 낙첨', () => {
  const slip = {
    stake: 10000,
    legs: [leg({ matchId: 'a', pick: 'AWAY' }), leg({ matchId: 'b' })],
  };
  // a 는 종료(홈승)인데 픽이 AWAY → 낙첨. b 는 미종료.
  const r = settleSlip(slip, { a: { home: 1, away: 0 } });
  assert.equal(r.status, 'LOST');
  assert.equal(r.payout, 0);
  assert.equal(r.legStatuses[0], 'LOST');
  assert.equal(r.legStatuses[1], 'PENDING');
});

test('settleSlip: 전 폴 환급이면 VOID(원금 반환)', () => {
  const slip = {
    stake: 10000,
    legs: [leg({ matchId: 'a', market: 'OU', pick: 'OVER', line: 2 })],
  };
  const r = settleSlip(slip, { a: { home: 1, away: 1 } }); // 합 2 = 기준 2 → VOID
  assert.equal(r.status, 'VOID');
  assert.equal(r.payout, 10000);
});
