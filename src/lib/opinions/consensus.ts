// 3인 합의 판정 (순수 함수). 참고인(김민석)은 members 에 넣지 않으면 합의에 영향 없음.

import type { Opinion, Outcome } from '@/lib/types';

export interface Consensus {
  agreed: boolean;
  pick?: Outcome;
}

/** members 전원이 같은 pick 을 냈으면 합의. (members = 합의 대상 3인) */
export function consensus(
  opinions: Opinion[],
  members: string[],
): Consensus {
  const picks = members
    .map((m) => opinions.find((o) => o.member === m)?.pick)
    .filter((p): p is Outcome => !!p);
  if (picks.length === members.length && new Set(picks).size === 1) {
    return { agreed: true, pick: picks[0] };
  }
  return { agreed: false };
}
