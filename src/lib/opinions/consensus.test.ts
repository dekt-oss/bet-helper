import { test } from 'node:test';
import assert from 'node:assert/strict';
import { consensus } from './consensus';
import type { Opinion, Outcome } from '@/lib/types';

const MEMBERS = ['임준혁', '양준환', '전인우'];

function op(member: string, pick: Outcome | ''): Opinion {
  return { matchId: 'm1', member, pick, updatedAt: '2026-06-13T00:00:00Z' };
}

test('3인 모두 같은 픽 → 합의', () => {
  const r = consensus(
    [op('임준혁', 'HOME'), op('양준환', 'HOME'), op('전인우', 'HOME')],
    MEMBERS,
  );
  assert.equal(r.agreed, true);
  assert.equal(r.pick, 'HOME');
});

test('한 명이라도 다르면 미합의', () => {
  const r = consensus(
    [op('임준혁', 'HOME'), op('양준환', 'DRAW'), op('전인우', 'HOME')],
    MEMBERS,
  );
  assert.equal(r.agreed, false);
});

test('일부 미입력이면 미합의', () => {
  const r = consensus([op('임준혁', 'HOME'), op('양준환', 'HOME')], MEMBERS);
  assert.equal(r.agreed, false);
});

test('참고인(김민석)이 달라도 3인 합의면 합의 유지', () => {
  const r = consensus(
    [
      op('임준혁', 'AWAY'),
      op('양준환', 'AWAY'),
      op('전인우', 'AWAY'),
      op('김민석', 'HOME'), // 참고인 — members 에 없으므로 무영향
    ],
    MEMBERS,
  );
  assert.equal(r.agreed, true);
  assert.equal(r.pick, 'AWAY');
});
