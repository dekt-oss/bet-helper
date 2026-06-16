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

// ── 멀티마켓 배당(승무패 + 핸디캡 + 언더오버) ─────────────────

/** 베트맨 발매 마켓(게임유형). 승무패 / 핸디캡 / 언더오버. */
export type MarketType = '1X2' | 'HANDICAP' | 'OU';

/** 폴(전표 한 줄)의 선택지. 1X2·핸디캡은 HOME/DRAW/AWAY, 언더오버는 OVER/UNDER. */
export type LegPick = 'HOME' | 'DRAW' | 'AWAY' | 'OVER' | 'UNDER';

/**
 * 한 경기-한 마켓의 배당. 베트맨 게임번호 1개에 대응.
 *  - 1X2 / HANDICAP: home/draw/away 사용. HANDICAP 은 handicap(홈 기준 핸디)도 가짐.
 *  - OU: line(기준선) + over/under 사용.
 */
export interface MarketOdds {
  matchId: string;
  market: MarketType;
  /** 베트맨 게임번호(마켓 식별) */
  betId?: string;
  /** "홈|원정" 매칭 복구용 */
  externalRef?: string;
  // 승무패 & 핸디캡 (3-way)
  home?: number;
  draw?: number;
  away?: number;
  /** 홈 기준 핸디(HANDICAP 전용, 예: -1) */
  handicap?: number;
  // 언더오버
  /** 합산 득점 기준선(OU 전용, 예: 2.5) */
  line?: number;
  over?: number;
  under?: number;
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

export type BetStatus = 'PENDING' | 'WON' | 'LOST' | 'VOID';

/** 전표 한 줄(폴). 경기 1개 + 마켓 + 선택지. */
export interface BetLeg {
  matchId: string;
  market: MarketType;
  pick: LegPick;
  /** 핸디(홈 기준) 또는 OU 기준선 — 정산·표기에 필요 */
  line?: number;
  /** 폴 배당(베팅 시점 고정) */
  oddsAtPlacement: number;
  status: BetStatus;
}

/**
 * 구매전표. 폴 1개=단폴, 2+=조합(다폴).
 * 총배당 = 각 폴 배당의 곱(환급 폴은 1로 취급).
 */
export interface BetSlip {
  id: string;
  placedBy: string;
  legs: BetLeg[];
  /** 베팅 시점 총배당(폴 배당 곱) */
  combinedOdds: number;
  stake: number;
  status: BetStatus;
  /** 적중 시 수령액 (원) — 정산 후 채워짐 */
  payout?: number;
  note?: string;
  createdAt: string;
}
