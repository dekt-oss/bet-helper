// 예측 승률 순위 (순수 함수).
// 베팅(돈)과 무관하게, 각자 낸 경기 의견(승/무/패)이 실제 결과와 얼마나
// 맞았는지로 "예측왕"을 가린다. 종료된 경기 중 스코어가 있는 것만 채점한다.

import type { Match, Opinion, Outcome } from '@/lib/types';

export interface PredictionStat {
  member: string;
  /** 참고인(합의 무영향)인지 — 표에 표시용. */
  advisory: boolean;
  /** 채점 가능한(종료+스코어) 경기 중 의견을 낸 수. */
  attempts: number;
  /** 그중 적중 수. */
  correct: number;
  /** correct / attempts (0~1). attempts 0 이면 0. */
  winRate: number;
}

/** 스코어로 실제 결과(승/무/패)를 정한다. 스코어 없으면 null. */
export function resultOf(match: Match): Outcome | null {
  if (!match.score) return null;
  const { home, away } = match.score;
  if (home > away) return 'HOME';
  if (home < away) return 'AWAY';
  return 'DRAW';
}

/**
 * 멤버별 예측 적중 통계를 계산해 순위순으로 반환한다.
 * 정렬: 승률↓ → 적중수↓ → 시도수↓ → 이름. (기록 없는 사람은 맨 뒤)
 */
export function computePredictionLeaderboard(
  opinions: Opinion[],
  matches: Match[],
  members: string[],
  advisoryMembers: string[] = [],
): PredictionStat[] {
  // 종료+스코어 있는 경기의 실제 결과 맵.
  const resultByMatch = new Map<string, Outcome>();
  for (const m of matches) {
    if (m.status !== 'FINISHED') continue;
    const r = resultOf(m);
    if (r) resultByMatch.set(m.id, r);
  }

  const stat = new Map<string, { attempts: number; correct: number }>();
  for (const mem of members) stat.set(mem, { attempts: 0, correct: 0 });

  for (const o of opinions) {
    if (!o.pick) continue; // 미입력 의견 제외
    const result = resultByMatch.get(o.matchId);
    if (!result) continue; // 아직 결과 없는 경기 제외
    const s = stat.get(o.member);
    if (!s) continue; // 멤버 목록 밖이면 무시
    s.attempts += 1;
    if (o.pick === result) s.correct += 1;
  }

  const advisory = new Set(advisoryMembers);
  const rows: PredictionStat[] = members.map((member) => {
    const s = stat.get(member)!;
    return {
      member,
      advisory: advisory.has(member),
      attempts: s.attempts,
      correct: s.correct,
      winRate: s.attempts > 0 ? s.correct / s.attempts : 0,
    };
  });

  return rows.sort(
    (a, b) =>
      b.winRate - a.winRate ||
      b.correct - a.correct ||
      b.attempts - a.attempts ||
      a.member.localeCompare(b.member, 'ko'),
  );
}
