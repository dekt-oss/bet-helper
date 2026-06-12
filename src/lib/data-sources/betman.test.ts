// 베트맨 파서 단위 테스트 — 실데이터 없이 픽스처로 검증.
// 실행: npm run test  (node --test --import tsx)

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { parseBetmanOdds, matchOddsToMatches } from './betman';
import type { Match } from '@/lib/types';

const here = (p: string) => fileURLToPath(new URL(p, import.meta.url));
const jsonRaw = readFileSync(here('./__fixtures__/betman-sample.json'), 'utf-8');
const htmlRaw = readFileSync(here('./__fixtures__/betman-sample.html'), 'utf-8');

test('JSON 응답을 Odds[] 로 정규화하고 비정상 행은 버린다', async () => {
  const odds = await parseBetmanOdds(jsonRaw);
  // 3행 중 1행은 배당이 비정상(0/abc/빈값) → 버려져 2개만 남아야 한다.
  assert.equal(odds.length, 2);
  const kor = odds.find((o) => o.externalRef === '대한민국|브라질');
  assert.ok(kor);
  assert.equal(kor.home, 3.1);
  assert.equal(kor.draw, 3.3);
  assert.equal(kor.away, 2.05);
  assert.equal(kor.source, 'betman');
  assert.equal(kor.matchId, 'betman-0712001');
});

test('HTML 응답도 동일하게 파싱한다', async () => {
  const odds = await parseBetmanOdds(htmlRaw);
  assert.equal(odds.length, 2);
  assert.ok(odds.every((o) => o.source === 'betman'));
});

test('빈/비정상 입력은 throw 없이 [] 반환', async () => {
  assert.deepEqual(await parseBetmanOdds(''), []);
  assert.deepEqual(await parseBetmanOdds('   '), []);
  assert.deepEqual(await parseBetmanOdds('<html></html>'), []);
  assert.deepEqual(await parseBetmanOdds('not json at all'), []);
});

test('matchOddsToMatches 는 한↔영 별칭으로 matchId 를 보정한다', async () => {
  const odds = await parseBetmanOdds(jsonRaw);
  const matches: Match[] = [
    {
      id: 'wc2026-42',
      competition: 'FIFA World Cup 2026',
      kickoff: '2026-07-12T11:00:00Z',
      status: 'SCHEDULED',
      home: { id: 'KOR', name: 'Korea Republic' },
      away: { id: 'BRA', name: 'Brazil' },
      source: 'openfootball',
    },
  ];
  const matched = matchOddsToMatches(odds, matches);
  const kor = matched.find((o) => o.externalRef === '대한민국|브라질');
  assert.equal(kor?.matchId, 'wc2026-42');
});
