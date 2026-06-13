import { test } from 'node:test';
import assert from 'node:assert/strict';
import { computeStageSections } from './standings';
import type { Match, MatchStatus } from './types';

function mk(
  id: string,
  stage: string,
  status: MatchStatus,
  home = 'Korea Republic',
  away = 'Brazil',
): Match {
  return {
    id,
    competition: 'FIFA World Cup 2026',
    stage,
    kickoff: '2026-06-20T10:00:00.000Z',
    status,
    home: { id: home, name: home },
    away: { id: away, name: away },
    score: status === 'FINISHED' ? { home: 1, away: 0 } : undefined,
    source: 'worldcup26',
  };
}

test('조별리그 진행 중이면 조별리그 섹션이 맨 위', () => {
  const sections = computeStageSections([
    mk('g1', 'Group A', 'LIVE'),
    mk('g2', 'Group A', 'SCHEDULED'),
    mk('k1', 'round32', 'SCHEDULED'),
  ]);
  assert.equal(sections[0].title, '조별리그');
  assert.equal(sections[0].active, true);
});

test('32강에 진행중 경기가 있으면 32강이 맨 위', () => {
  const sections = computeStageSections([
    mk('g1', 'Group A', 'FINISHED'),
    mk('k1', 'round32', 'LIVE'),
    mk('k2', 'round16', 'SCHEDULED'),
  ]);
  assert.equal(sections[0].title, '32강');
  assert.equal(sections[0].active, true);
  // 나머지는 진행순서대로(조별리그 → 16강)
  assert.deepEqual(
    sections.slice(1).map((s) => s.title),
    ['조별리그', '16강'],
  );
});

test('스테이지 한글 라벨 매핑(16강/8강/4강/결승)', () => {
  const titles = computeStageSections([
    mk('a', 'round16', 'SCHEDULED'),
    mk('b', 'quarter', 'SCHEDULED'),
    mk('c', 'semi', 'SCHEDULED'),
    mk('d', 'final', 'SCHEDULED'),
  ]).map((s) => s.title);
  for (const t of ['16강', '8강', '4강', '결승']) assert.ok(titles.includes(t));
});
