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
  /** 경기장 이름 (worldcup26.ir 등에서 제공) */
  venue?: string;
  /** 라운드/매치데이 라벨 (예: "1", "조별 2차전") */
  matchday?: string;
  /** 득점자 목록 (있으면) */
  scorers?: {
    home: string[];
    away: string[];
  };
  /** 데이터를 어디서 가져왔는지 추적용 */
  source: DataSourceId;
  /**
   * 이 경기가 과거(다른 소스/구버전)에 가졌을 수 있는 ID들(별칭).
   * 옛 ID 로 저장된 의견·배당을 현재 경기에 다시 연결(복구)하는 데 쓴다.
   */
  altIds?: string[];
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

/** 경기별 멤버 의견(합의용). 3인이 같은 pick 이면 합의. */
export interface Opinion {
  matchId: string;
  member: string;
  /** 예상 결과(승/무/패). 미정이면 빈 문자열. */
  pick: Outcome | '';
  comment?: string;
  updatedAt: string;
}

export type DataSourceId =
  | 'openfootball'
  | 'football-data'
  | 'worldcup26'
  | 'api-football'
  | 'oddsapi'
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
