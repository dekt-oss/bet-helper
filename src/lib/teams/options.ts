// 폼(베팅 등록 / 배당 입력)에서 쓰는 경기 선택지 빌더.
// 한국 경기 최우선, 한글 팀명, 콤보박스에 날짜 표시.

import type { Match } from '@/lib/types';
import { toKoreanTeam, isKoreaMatch, sortKoreaFirst } from './korea';

export interface MatchOption {
  id: string;
  home: string; // 한글 팀명
  away: string; // 한글 팀명
  kickoff: string;
  korea: boolean;
}

/** 예정/진행중 경기를 한국 우선으로 정렬해 선택지로. */
export function buildMatchOptions(matches: Match[]): MatchOption[] {
  return sortKoreaFirst(
    matches.filter((m) => m.status !== 'FINISHED' && m.status !== 'CANCELLED'),
  ).map((m) => ({
    id: m.id,
    home: toKoreanTeam(m.home.name),
    away: toKoreanTeam(m.away.name),
    kickoff: m.kickoff,
    korea: isKoreaMatch(m),
  }));
}

/** 콤보박스 라벨: "🇰🇷 6월 14일 21:00 · 대한민국 vs 브라질" */
export function matchOptionLabel(o: MatchOption): string {
  const date = new Date(o.kickoff).toLocaleString('ko-KR', {
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'Asia/Seoul',
  });
  return `${o.korea ? '🇰🇷 ' : ''}${date} · ${o.home} vs ${o.away}`;
}
