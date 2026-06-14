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
  /** 최근 채점 경기 적중 여부(오래된→최신, 최대 5개). */
  form: boolean[];
  /** 최신부터 연속 적중 수(현재 연승). */
  streak: number;
  /** 적중률 기준 공동 순위(1-based). 기록 없으면 null. */
  rank: number | null;
}

/** 스코어로 실제 결과(승/무/패)를 정한다. 스코어 없으면 null. */
export function resultOf(match: Match): Outcome | null {
  if (!match.score) return null;
  const { home, away } = match.score;
  if (home > away) return 'HOME';
  if (home < away) return 'AWAY';
  return 'DRAW';
}

const FORM_SIZE = 5;

/**
 * 멤버별 예측 적중 통계를 계산해 순위순으로 반환한다.
 * 정렬: 승률↓ → 적중수↓ → 시도수↓ → 이름. (기록 없는 사람은 맨 뒤)
 * 공동 순위(rank)는 적중률이 같으면 같은 값을 부여한다.
 */
export function computePredictionLeaderboard(
  opinions: Opinion[],
  matches: Match[],
  members: string[],
  advisoryMembers: string[] = [],
): PredictionStat[] {
  // 종료+스코어 있는 경기의 실제 결과/킥오프 맵.
  const resultByMatch = new Map<string, Outcome>();
  const kickoffByMatch = new Map<string, string>();
  for (const m of matches) {
    if (m.status !== 'FINISHED') continue;
    const r = resultOf(m);
    if (r) {
      resultByMatch.set(m.id, r);
      kickoffByMatch.set(m.id, m.kickoff);
    }
  }

  // 멤버별 채점된 픽을 모은다(폼/연승 계산용).
  const graded = new Map<string, { kickoff: string; correct: boolean }[]>();
  for (const mem of members) graded.set(mem, []);
  for (const o of opinions) {
    if (!o.pick) continue;
    const result = resultByMatch.get(o.matchId);
    if (!result) continue;
    const list = graded.get(o.member);
    if (!list) continue; // 멤버 목록 밖이면 무시
    list.push({
      kickoff: kickoffByMatch.get(o.matchId) ?? '',
      correct: o.pick === result,
    });
  }

  const advisory = new Set(advisoryMembers);
  const rows: PredictionStat[] = members.map((member) => {
    const list = graded
      .get(member)!
      .sort((a, b) => a.kickoff.localeCompare(b.kickoff)); // 오래된→최신
    const attempts = list.length;
    const correct = list.filter((g) => g.correct).length;
    const form = list.slice(-FORM_SIZE).map((g) => g.correct);
    // 최신부터 연속 적중.
    let streak = 0;
    for (let i = list.length - 1; i >= 0 && list[i].correct; i--) streak++;
    return {
      member,
      advisory: advisory.has(member),
      attempts,
      correct,
      winRate: attempts > 0 ? correct / attempts : 0,
      form,
      streak,
      rank: null,
    };
  });

  rows.sort(
    (a, b) =>
      b.winRate - a.winRate ||
      b.correct - a.correct ||
      b.attempts - a.attempts ||
      a.member.localeCompare(b.member, 'ko'),
  );

  // 공동 순위: 적중률이 같으면 같은 등수(1,2,2,4 …). 기록 없는 사람은 rank null.
  let lastRate = -1;
  let lastRank = 0;
  rows.forEach((r, i) => {
    if (r.attempts === 0) {
      r.rank = null;
      return;
    }
    if (r.winRate !== lastRate) {
      lastRank = i + 1;
      lastRate = r.winRate;
    }
    r.rank = lastRank;
  });

  return rows;
}

// ── 경기별 예측 상세 ───────────────────────────────────────

export interface MemberPick {
  member: string;
  advisory: boolean;
  pick: Outcome;
  /** 적중 여부. 결과가 아직 없으면 null. */
  correct: boolean | null;
}

export interface MatchPrediction {
  matchId: string;
  homeName: string;
  awayName: string;
  kickoff: string;
  status: Match['status'];
  score?: { home: number; away: number };
  /** 실제 결과(승/무/패). 종료+스코어 없으면 null. */
  result: Outcome | null;
  picks: MemberPick[];
  /** 합의 대상 전원이 같은 픽이면 그 픽, 아니면 null. */
  consensusPick: Outcome | null;
  /** 합의 픽 적중 여부. 결과 전이거나 합의 없으면 null. */
  consensusCorrect: boolean | null;
}

/**
 * "누가 뭘 예상했고 결과는 어땠는지"를 경기별로 정리한다.
 * - 멤버 중 한 명이라도 픽을 낸 경기만 포함.
 * - 정렬: 채점된(결과 있는) 경기 먼저 → 킥오프 늦은(최근) 순.
 * - consensusMembers 전원이 같은 픽이면 합의 정보도 함께 담는다.
 */
export function computePredictionDetails(
  opinions: Opinion[],
  matches: Match[],
  members: string[],
  advisoryMembers: string[] = [],
  consensusMembers: string[] = [],
): MatchPrediction[] {
  const advisory = new Set(advisoryMembers);
  const order = new Map(members.map((m, i) => [m, i]));
  const matchById = new Map(matches.map((m) => [m.id, m]));

  // matchId → member → pick (합의 판정용)
  const pickByMatchMember = new Map<string, Map<string, Outcome>>();
  // matchId → 표시용 픽 목록
  const byMatch = new Map<string, MemberPick[]>();
  for (const o of opinions) {
    if (!o.pick) continue;
    const m = matchById.get(o.matchId);
    if (!m) continue; // 현재 경기 목록에 없는 의견은 무시
    const mm = pickByMatchMember.get(o.matchId) ?? new Map<string, Outcome>();
    mm.set(o.member, o.pick);
    pickByMatchMember.set(o.matchId, mm);

    if (!order.has(o.member)) continue; // 표시 대상 멤버만 카드에 노출
    const result = m.status === 'FINISHED' ? resultOf(m) : null;
    const list = byMatch.get(o.matchId) ?? [];
    list.push({
      member: o.member,
      advisory: advisory.has(o.member),
      pick: o.pick,
      correct: result ? o.pick === result : null,
    });
    byMatch.set(o.matchId, list);
  }

  function consensusPickOf(matchId: string): Outcome | null {
    if (consensusMembers.length === 0) return null;
    const mm = pickByMatchMember.get(matchId);
    if (!mm) return null;
    const picks = consensusMembers.map((m) => mm.get(m));
    if (picks.some((p) => !p)) return null; // 미입력자 있으면 합의 아님
    return new Set(picks).size === 1 ? picks[0]! : null;
  }

  const out: MatchPrediction[] = [];
  for (const [matchId, picks] of byMatch) {
    const m = matchById.get(matchId)!;
    picks.sort((a, b) => (order.get(a.member)! - order.get(b.member)!));
    const result = m.status === 'FINISHED' ? resultOf(m) : null;
    const consensusPick = consensusPickOf(matchId);
    out.push({
      matchId,
      homeName: m.home.name,
      awayName: m.away.name,
      kickoff: m.kickoff,
      status: m.status,
      score: m.score,
      result,
      picks,
      consensusPick,
      consensusCorrect:
        consensusPick && result ? consensusPick === result : null,
    });
  }

  return out.sort((a, b) => {
    const ag = a.result != null ? 0 : 1;
    const bg = b.result != null ? 0 : 1;
    return ag - bg || b.kickoff.localeCompare(a.kickoff);
  });
}

