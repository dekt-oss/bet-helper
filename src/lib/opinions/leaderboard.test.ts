import { test } from 'node:test';
import assert from 'node:assert/strict';
import { computePredictionLeaderboard, resultOf } from './leaderboard';
import type { Match, Opinion, Outcome } from '@/lib/types';

const MEMBERS = ['임준혁', '양준환', '전인우'];
const ADVISORY = ['김민석'];

function op(matchId: string, member: string, pick: Outcome | ''): Opinion {
  return { matchId, member, pick, updatedAt: '2026-06-13T00:00:00Z' };
}

function match(id: string, home: number, away: number, finished = true): Match {
  return {
    id,
    competition: 'FIFA World Cup 2026',
    kickoff: '2026-06-13T00:00:00Z',
    status: finished ? 'FINISHED' : 'SCHEDULED',
    home: { id: 'h', name: 'Home' },
    away: { id: 'a', name: 'Away' },
    score: finished ? { home, away } : undefined,
    source: 'openfootball',
  } as Match;
}

test('resultOf: 스코어로 승/무/패 판정', () => {
  assert.equal(resultOf(match('m', 2, 1)), 'HOME');
  assert.equal(resultOf(match('m', 0, 3)), 'AWAY');
  assert.equal(resultOf(match('m', 1, 1)), 'DRAW');
  assert.equal(resultOf(match('m', 0, 0, false)), null);
});

test('적중/시도 집계 + 승률 정렬', () => {
  const matches = [match('m1', 2, 0), match('m2', 1, 1)]; // 결과: HOME, DRAW
  const opinions = [
    op('m1', '임준혁', 'HOME'), // 적중
    op('m1', '양준환', 'AWAY'), // 실패
    op('m2', '임준혁', 'DRAW'), // 적중 (2/2)
    op('m2', '양준환', 'DRAW'), // 적중 (1/2)
  ];
  const rows = computePredictionLeaderboard(opinions, matches, MEMBERS, ADVISORY);
  // 임준혁 100% 가 1위, 양준환 50% 가 2위, 전인우(기록없음) 꼴찌
  assert.deepEqual(rows.map((r) => r.member), ['임준혁', '양준환', '전인우']);
  assert.equal(rows[0].correct, 2);
  assert.equal(rows[0].attempts, 2);
  assert.equal(rows[0].winRate, 1);
  assert.equal(rows[1].winRate, 0.5);
  assert.equal(rows[2].attempts, 0);
});

test('미종료 경기/빈 픽은 채점 제외', () => {
  const matches = [match('m1', 2, 0), match('m2', 0, 1, false)];
  const opinions = [
    op('m1', '임준혁', 'HOME'), // 적중
    op('m2', '임준혁', 'AWAY'), // 미종료 → 제외
    op('m1', '양준환', ''), // 빈 픽 → 제외
  ];
  const rows = computePredictionLeaderboard(opinions, matches, MEMBERS, ADVISORY);
  const im = rows.find((r) => r.member === '임준혁')!;
  assert.equal(im.attempts, 1);
  assert.equal(im.correct, 1);
  const yang = rows.find((r) => r.member === '양준환')!;
  assert.equal(yang.attempts, 0);
});

test('참고인 플래그 표시', () => {
  const rows = computePredictionLeaderboard([], [], [...MEMBERS, ...ADVISORY], ADVISORY);
  assert.equal(rows.find((r) => r.member === '김민석')!.advisory, true);
  assert.equal(rows.find((r) => r.member === '임준혁')!.advisory, false);
});
