// 베트맨 파서 단위 테스트 — 실데이터 없이 픽스처로 검증.
// 실행: npm run test  (node --test --import tsx)

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import {
  parseBetmanOdds,
  matchOddsToMatches,
  parseBetmanGameSlip,
} from './betman';
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

test('parseBetmanGameSlip: 축구 월드컵 승무패만 추출하고 승/무/패 매핑', async () => {
  // 실데이터 구조: 월드컵 여부는 leagueName('축구 월드컵'), gameName 은 null.
  // 핸디캡(betTypNm '일반 정수핸디캡')과 타 종목(BS)은 제외돼야 한다.
  const sample = {
    compSchedules: {
      keys: ['itemCode', 'leagueName', 'gameName', 'homeName', 'awayName', 'winAllot', 'drawAllot', 'loseAllot', 'betTypNm'],
      datas: [
        ['SC', '축구 월드컵', null, '아이티', '스코틀랜드', 5.4, 3.65, 1.53, '승무패'],
        ['SC', '축구 월드컵', null, '브라질', '모로코', 1.62, 3.4, 5.0, '승무패'],
        ['SC', '축구 월드컵', null, '아이티', '스코틀랜드', 2.31, 3.6, 2.35, '일반 정수핸디캡'],
        ['BS', 'MLB', null, '볼티모어', '샌디에이고', 1.58, 0, 1.99, '일반 승패'],
      ],
    },
  };
  const odds = parseBetmanGameSlip(JSON.stringify(sample));
  // 승무패 축구만 → 2행(핸디캡·야구 제외).
  assert.equal(odds.length, 2);
  const m = odds.find((o) => o.externalRef === '아이티|스코틀랜드');
  assert.ok(m);
  assert.equal(m.home, 5.4); // winAllot
  assert.equal(m.draw, 3.65); // drawAllot
  assert.equal(m.away, 1.53); // loseAllot
  assert.equal(m.source, 'betman');
  assert.ok(!odds.some((o) => o.externalRef?.includes('볼티모어')));
});

test('parseBetmanGameSlip: 잘못된 입력은 [] 반환', () => {
  assert.deepEqual(parseBetmanGameSlip('not json'), []);
  assert.deepEqual(parseBetmanGameSlip('{}'), []);
});
