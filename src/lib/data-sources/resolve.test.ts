import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildMatchIdResolver, resolveMatchIds } from './resolve';
import type { Match } from '@/lib/types';

function m(id: string, home: string, away: string, altIds?: string[]): Match {
  return {
    id,
    competition: 'FIFA World Cup 2026',
    kickoff: '2026-06-15T08:00:00Z',
    status: 'SCHEDULED',
    home: { id: home, name: home },
    away: { id: away, name: away },
    source: 'football-data',
    altIds,
  } as Match;
}

const matches: Match[] = [
  // 현재 안정 ID + 옛 별칭(fd-, wc2026-)
  m('wc-대한민국--브라질', 'Korea Republic', 'Brazil', ['fd-100', 'wc2026-42']),
];

test('현재 ID 는 그대로', () => {
  const r = buildMatchIdResolver(matches);
  assert.equal(r('wc-대한민국--브라질'), 'wc-대한민국--브라질');
});

test('옛 별칭 ID(fd-/wc2026-) → 현재 ID 로 복구', () => {
  const r = buildMatchIdResolver(matches);
  assert.equal(r('fd-100'), 'wc-대한민국--브라질');
  assert.equal(r('wc2026-42'), 'wc-대한민국--브라질');
});

test("베트맨 'betman-홈-원정'(한글) → 팀명 매칭으로 복구", () => {
  const r = buildMatchIdResolver(matches);
  // 베트맨은 한글, 경기 소스는 영문 → teamCanon 으로 매칭
  assert.equal(r('betman-대한민국-브라질'), 'wc-대한민국--브라질');
  assert.equal(r('betman-브라질-대한민국'), 'wc-대한민국--브라질');
});

test('알 수 없는 ID 는 원본 유지', () => {
  const r = buildMatchIdResolver(matches);
  assert.equal(r('fd-999'), 'fd-999');
});

test('resolveMatchIds: 레코드들의 matchId 일괄 복구', () => {
  const recs = [
    { matchId: 'fd-100', x: 1 },
    { matchId: 'betman-브라질-대한민국', x: 2 },
    { matchId: 'unknown', x: 3 },
  ];
  const out = resolveMatchIds(recs, matches);
  assert.equal(out[0].matchId, 'wc-대한민국--브라질');
  assert.equal(out[1].matchId, 'wc-대한민국--브라질');
  assert.equal(out[2].matchId, 'unknown');
});
