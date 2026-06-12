// 도메인 공통 타입 정의 — 데이터 소스가 달라도 이 형태로 정규화한다.

export type MatchStatus =
  | 'SCHEDULED' // 예정
  | 'LIVE' // 진행중
  | 'PAUSED' // 하프타임 등
  | 'FINISHED' // 종료
  | 'POSTPONED'
  | 'CANCELLED';

export interface Team {
  id: string;
  name: string;
  /** ISO 3166 또는 FIFA 코드 (예: KOR) */
  code?: string;
  flagUrl?: string;
}

export interface Match {
  id: string;
  competition: string; // 예: "FIFA World Cup 2026"
  stage?: string; // 예: "Group A", "Round of 16"
  /** 경기 시작 시각 (UTC ISO 8601) */
  kickoff: string;
  status: MatchStatus;
  /** 진행중일 때 경과 분 */
  minute?: number;
  home: Team;
  away: Team;
  score?: {
    home: number;
    away: number;
  };
  /** 데이터를 어디서 가져왔는지 추적용 */
  source: DataSourceId;
}

export type Outcome = 'HOME' | 'DRAW' | 'AWAY';

/** 1X2(승무패) 배당. 베트맨/북메이커 공통. */
export interface Odds {
  matchId: string;
  /** 베트맨 게임번호 등 외부 식별자 */
  externalRef?: string;
  home: number; // 승
  draw: number; // 무
  away: number; // 패
  /** 배당 갱신 시각 (UTC ISO 8601) */
  updatedAt: string;
  source: DataSourceId;
}

export type DataSourceId =
  | 'openfootball'
  | 'football-data'
  | 'api-football'
  | 'betman'
  | 'manual';

// ── 배팅내역(공동 베팅) 관리 ──────────────────────────────

export interface Bettor {
  id: string;
  name: string;
}

export interface Bet {
  id: string;
  matchId: string;
  /** 누가 / 어느 모임 자금으로 걸었는지 */
  placedBy: string;
  pick: Outcome;
  /** 베팅 시점에 기록한 배당 */
  oddsAtPlacement: number;
  /** 베팅 금액 (원) */
  stake: number;
  status: 'PENDING' | 'WON' | 'LOST' | 'VOID';
  /** 적중 시 수령액 (원) — 정산 후 채워짐 */
  payout?: number;
  note?: string;
  createdAt: string;
}
