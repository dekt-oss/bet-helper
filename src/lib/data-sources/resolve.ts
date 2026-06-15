// 옛 ID 복구(remap) — 순수 로직(React/IO 의존 없음 → 단위테스트 가능).
//
// 의견·배당·베팅은 저장 당시의 경기 ID 에 묶인다. 소스/ID 체계가 바뀌면
// 옛 ID 가 현재 경기와 안 맞아 "사라진 것처럼" 보인다. 아래 리졸버가 옛 ID 를
// 현재 안정 ID 로 되돌려, 별도 마이그레이션 없이 데이터를 복구한다.

import type { Match } from '@/lib/types';
import { teamCanon } from '@/lib/teams/korea';

function pairKeyCanon(a: string, b: string): string {
  return [teamCanon(a), teamCanon(b)].sort().join('|');
}

/** 경기 목록으로 "옛/별칭 ID → 현재 ID" 해석 함수를 만든다. */
export function buildMatchIdResolver(
  matches: Match[],
): (id: string) => string {
  const direct = new Map<string, string>();
  const byPair = new Map<string, string>();
  for (const m of matches) {
    direct.set(m.id, m.id);
    for (const a of m.altIds ?? []) direct.set(a, m.id);
    byPair.set(pairKeyCanon(m.home.name, m.away.name), m.id);
  }
  return (id: string): string => {
    const hit = direct.get(id);
    if (hit) return hit;
    // 'betman-{홈}-{원정}' 처럼 ID 에 팀명이 들어있으면 팀쌍으로 재매칭.
    if (id.startsWith('betman-')) {
      const parts = id.slice('betman-'.length).split('-');
      for (let i = 1; i < parts.length; i++) {
        const a = parts.slice(0, i).join('-');
        const b = parts.slice(i).join('-');
        const m = byPair.get(pairKeyCanon(a, b));
        if (m) return m;
      }
    }
    return id; // 못 찾으면 원본 유지
  };
}

/** matchId 를 가진 레코드(의견/배당/베팅)들의 ID 를 현재 경기 ID 로 복구. */
export function resolveMatchIds<T extends { matchId: string }>(
  records: T[],
  matches: Match[],
): T[] {
  const resolve = buildMatchIdResolver(matches);
  return records.map((r) =>
    r.matchId ? { ...r, matchId: resolve(r.matchId) } : r,
  );
}
