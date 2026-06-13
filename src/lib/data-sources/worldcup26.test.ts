import { test } from 'node:test';
import assert from 'node:assert/strict';
import { toKickoffIso, parseScorers, deriveStatus } from './worldcup26';
import { teamCanon } from '@/lib/teams/korea';

type WcGameArg = Parameters<typeof deriveStatus>[0];

function kstHourMinute(iso: string): string {
  return new Intl.DateTimeFormat('ko-KR', {
    month: 'numeric',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    timeZone: 'Asia/Seoul',
  }).format(new Date(iso));
}

test('toKickoffIso: 체코전(UTC-6, local 20:00) → 한국시간 6/12 11:00', () => {
  const iso = toKickoffIso('06/11/2026 20:00', -360);
  assert.equal(iso, '2026-06-12T02:00:00.000Z');
  // 한국시간으로 6월 12일 11:00 이어야 한다.
  assert.match(kstHourMinute(iso), /6\.\s*12.*11:00/);
});

test('parseScorers: 중괄호+곡선따옴표 형식 정리', () => {
  assert.deepEqual(parseScorers(`{“J. Quiñones 9'”,”R. Jiménez 67'”}`), [
    "J. Quiñones 9'",
    "R. Jiménez 67'",
  ]);
  assert.deepEqual(parseScorers('null'), []);
  assert.deepEqual(parseScorers(undefined), []);
  assert.deepEqual(parseScorers('{}'), []);
});

test('deriveStatus: 다양한 진행상태', () => {
  const s = (g: Partial<WcGameArg>) => deriveStatus(g as WcGameArg);
  assert.equal(s({ finished: 'TRUE', time_elapsed: 'finished' }), 'FINISHED');
  assert.equal(s({ finished: 'FALSE', time_elapsed: 'ft' }), 'FINISHED');
  assert.equal(s({ finished: 'FALSE', time_elapsed: 'notstarted' }), 'SCHEDULED');
  assert.equal(s({ finished: 'FALSE', time_elapsed: 'HT' }), 'PAUSED');
  assert.equal(s({ finished: 'FALSE', time_elapsed: '67' }), 'LIVE');
});

test('팀 매칭: Bosnia & Herzegovina / DR Congo 표준화', () => {
  assert.equal(
    teamCanon('Bosnia & Herzegovina'),
    teamCanon('Bosnia-Herzegovina'),
  );
  assert.equal(teamCanon('DR Congo'), '콩고민주공화국');
  assert.equal(teamCanon('Bosnia & Herzegovina'), '보스니아헤르체고비나');
});
