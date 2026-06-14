import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  computePredictionLeaderboard,
  computePredictionDetails,
  resultOf,
} from './leaderboard';
import type { Match, Opinion, Outcome } from '@/lib/types';

const MEMBERS = ['임준혁', '양준환', '전인우'];
const ADVISORY = ['김민석'];

function op(matchId: string, member: string, pick: Outcome | ''): Opinion {
  return { matchId, member, pick, updatedAt: '2026-06-13T00:00:00Z' };
}

function match(
  id: string,
  home: number,
  away: number,
  finished = true,
  kickoff = '2026-06-13T00:00:00Z',
): Match {
  return {
    id,
    competition: 'FIFA World Cup 2026',
    kickoff,
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

test('폼/연승: 최신순 연속 적중 + 공동 순위', () => {
  // m1(이른) HOME, m2(늦은) AWAY 결과.
  const matches = [
    match('m1', 1, 0, true, '2026-06-11T00:00:00Z'),
    match('m2', 0, 1, true, '2026-06-12T00:00:00Z'),
  ];
  const opinions = [
    op('m1', '임준혁', 'HOME'), // 적중
    op('m2', '임준혁', 'AWAY'), // 적중 → 2연승
    op('m1', '양준환', 'HOME'), // 적중
    op('m2', '양준환', 'HOME'), // 실패 → streak 0
  ];
  const rows = computePredictionLeaderboard(opinions, matches, MEMBERS);
  const im = rows.find((r) => r.member === '임준혁')!;
  const yang = rows.find((r) => r.member === '양준환')!;
  assert.deepEqual(im.form, [true, true]); // 오래된→최신
  assert.equal(im.streak, 2);
  assert.deepEqual(yang.form, [true, false]);
  assert.equal(yang.streak, 0);
  assert.equal(im.rank, 1);
  assert.equal(yang.rank, 2);
});

test('공동 순위: 적중률 같으면 동일 등수', () => {
  const matches = [match('m1', 1, 0)];
  const opinions = [
    op('m1', '임준혁', 'HOME'), // 적중 100%
    op('m1', '양준환', 'HOME'), // 적중 100%
  ];
  const rows = computePredictionLeaderboard(opinions, matches, MEMBERS);
  const im = rows.find((r) => r.member === '임준혁')!;
  const yang = rows.find((r) => r.member === '양준환')!;
  assert.equal(im.rank, 1);
  assert.equal(yang.rank, 1); // 공동 1위
  assert.equal(rows.find((r) => r.member === '전인우')!.rank, null);
});

test('경기별 예측 상세: 합의 + 합의 적중 여부', () => {
  const matches = [match('m1', 2, 0)]; // HOME
  const opinions = [
    op('m1', '임준혁', 'HOME'),
    op('m1', '양준환', 'HOME'),
    op('m1', '전인우', 'HOME'),
  ];
  const details = computePredictionDetails(opinions, matches, MEMBERS, [], MEMBERS);
  assert.equal(details[0].consensusPick, 'HOME');
  assert.equal(details[0].consensusCorrect, true);
});

test('경기별 예측 상세: 결과 있는 경기 먼저 + 적중 표시', () => {
  const matches = [match('m1', 2, 0), match('m2', 1, 2, false)]; // m1 종료(HOME), m2 예정
  const opinions = [
    op('m1', '임준혁', 'HOME'), // 적중
    op('m1', '양준환', 'DRAW'), // 실패
    op('m2', '임준혁', 'AWAY'), // 결과 대기
    op('m1', '없는사람', 'HOME'), // 멤버 밖 → 무시
  ];
  const details = computePredictionDetails(opinions, matches, MEMBERS, ADVISORY);
  // 채점된 m1 이 먼저
  assert.equal(details[0].matchId, 'm1');
  assert.equal(details[0].result, 'HOME');
  assert.equal(details[0].picks.length, 2); // 멤버 밖 픽 제외
  assert.equal(details[0].picks[0].member, '임준혁');
  assert.equal(details[0].picks[0].correct, true);
  assert.equal(details[0].picks[1].correct, false);
  // m2 는 결과 대기
  assert.equal(details[1].matchId, 'm2');
  assert.equal(details[1].result, null);
  assert.equal(details[1].picks[0].correct, null);
});
