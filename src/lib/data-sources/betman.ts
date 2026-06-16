// 베트맨(betman.co.kr) 배당 스크래퍼 — 한국 합법 스포츠토토(프로토 승부식) 배당.
//
// ⚠️ 주의:
//  - 베트맨은 공식 공개 API 가 없어 HTML/내부 JSON 응답 파싱에 의존한다.
//    사이트 구조가 바뀌면 깨질 수 있으므로 엔드포인트/필드/셀렉터를 한 곳(상단 상수)에 모은다.
//  - 배당은 경기 ~24시간 전부터 생성되고, 변동 시 10~30분 내 갱신된다.
//  - robots.txt / 이용약관을 준수하고, 과도한 호출을 피하기 위해 캐시(10분)를 둔다.
//  - 개인적/비상업적 통합관리 용도로만 사용한다.
//
// 설계 원칙:
//  1) parseBetmanOdds() 는 순수 함수이며 절대 throw 하지 않는다(실패 시 빈 배열).
//  2) 응답이 JSON 이면 JSON 으로, 아니면 HTML 로 간주해 파싱한다(이중 전략).
//  3) 모든 필드는 옵셔널 취급하고, 승/무/패 배당 3개가 모두 유효할 때만 Odds 를 만든다.
//  4) 실제 베트맨 응답 구조를 확보하기 전까지 필드/셀렉터는 "추정값"이며,
//     실데이터 확보 시 아래 상수만 교체하면 된다.

import type { Match, MarketOdds, MarketType, Odds } from '@/lib/types';
import { teamCanon } from '@/lib/teams/korea';

// ── 설정 상수 (구조 변경 시 여기만 수정) ─────────────────────

const BETMAN_PROTO_LIST_URL =
  process.env.BETMAN_PROTO_URL ??
  'https://www.betman.co.kr/main/mainPage/gamebuy/protoMatchList.do';

const BETMAN_HEADERS: Record<string, string> = {
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
    '(KHTML, like Gecko) Chrome/124.0 Safari/537.36',
  Referer: 'https://www.betman.co.kr/',
  'Accept-Language': 'ko-KR,ko;q=0.9',
};

// JSON 응답에서 한 행(경기)을 찾을 후보 키들. 앞에서부터 순차 탐색.
const JSON_FIELDS = {
  rows: ['list', 'rows', 'data', 'matchList', 'gameList'],
  gameNo: ['gameNo', 'gameId', 'gameSeq', 'no'],
  home: ['homeTeam', 'home', 'teamHome', 'homeNm'],
  away: ['awayTeam', 'away', 'teamAway', 'awayNm'],
  win: ['winRate', 'homeRate', 'rate1', 'wRate'],
  draw: ['drawRate', 'rate0', 'rateX', 'dRate'],
  lose: ['loseRate', 'awayRate', 'rate2', 'lRate'],
  closeAt: ['closeDate', 'gameDate', 'deadline', 'matchDate'],
} as const;

// 월드컵 출전국 별칭(매칭용). 키는 normalizeTeamName 의 "기본 정규화" 결과
// (소문자·공백/괄호 제거)이며, 한글명과 영문 변형을 모두 같은 표준값으로 모은다.
// 필요 시 점진적으로 채운다.
const TEAM_ALIASES: Record<string, string> = {
  // 한글 ↔ 영문 변형을 같은 표준값으로 수렴. 베트맨은 한글, 우리 일정(openfootball)은 영문.
  // 대한민국
  대한민국: 'korea',
  한국: 'korea',
  korearepublic: 'korea',
  republicofkorea: 'korea',
  southkorea: 'korea',
  // 남미
  브라질: 'brazil',
  아르헨티나: 'argentina',
  우루과이: 'uruguay',
  콜롬비아: 'colombia',
  에콰도르: 'ecuador',
  파라과이: 'paraguay',
  페루: 'peru',
  칠레: 'chile',
  볼리비아: 'bolivia',
  베네수엘라: 'venezuela',
  // 유럽
  프랑스: 'france',
  독일: 'germany',
  스페인: 'spain',
  잉글랜드: 'england',
  포르투갈: 'portugal',
  네덜란드: 'netherlands',
  이탈리아: 'italy',
  벨기에: 'belgium',
  크로아티아: 'croatia',
  스위스: 'switzerland',
  오스트리아: 'austria',
  폴란드: 'poland',
  덴마크: 'denmark',
  노르웨이: 'norway',
  스웨덴: 'sweden',
  우크라이나: 'ukraine',
  세르비아: 'serbia',
  스코틀랜드: 'scotland',
  웨일스: 'wales',
  터키: 'turkey',
  튀르키예: 'turkey',
  turkiye: 'turkey',
  체코: 'czechrepublic',
  체코공화국: 'czechrepublic',
  czechia: 'czechrepublic',
  // 아시아
  일본: 'japan',
  이란: 'iran',
  이라크: 'iraq',
  사우디아라비아: 'saudiarabia',
  사우디: 'saudiarabia',
  카타르: 'qatar',
  호주: 'australia',
  오스트레일리아: 'australia',
  우즈베키스탄: 'uzbekistan',
  요르단: 'jordan',
  아랍에미리트: 'unitedarabemirates',
  uae: 'unitedarabemirates',
  오만: 'oman',
  바레인: 'bahrain',
  팔레스타인: 'palestine',
  // 북중미·카리브
  멕시코: 'mexico',
  미국: 'usa',
  unitedstates: 'usa',
  us: 'usa',
  캐나다: 'canada',
  코스타리카: 'costarica',
  파나마: 'panama',
  자메이카: 'jamaica',
  온두라스: 'honduras',
  아이티: 'haiti',
  // 아프리카
  모로코: 'morocco',
  세네갈: 'senegal',
  가나: 'ghana',
  나이지리아: 'nigeria',
  카메룬: 'cameroon',
  이집트: 'egypt',
  알제리: 'algeria',
  튀니지: 'tunisia',
  코트디부아르: 'ivorycoast',
  남아프리카공화국: 'southafrica',
  남아공: 'southafrica',
  카보베르데: 'capeverde',
  // 오세아니아
  뉴질랜드: 'newzealand',
  // 기타
  퀴라소: 'curacao',
  보스니아헤르체고비나: 'bosniaandherzegovina',
  보스니아: 'bosniaandherzegovina',
};

// ── 공개 API ──────────────────────────────────────────────

export function isBetmanEnabled(): boolean {
  return process.env.ENABLE_BETMAN_SCRAPER === 'true';
}

/**
 * 베트맨에서 월드컵 승부식(1X2) 배당을 가져온다.
 * 비활성화 상태면 조용히 빈 배열을 반환한다(다른 소스로 폴백).
 */
export async function fetchBetmanOdds(): Promise<Odds[]> {
  if (!isBetmanEnabled()) return [];

  const res = await fetch(BETMAN_PROTO_LIST_URL, {
    headers: BETMAN_HEADERS,
    signal: AbortSignal.timeout(8000),
    next: { revalidate: 600 }, // 10분 캐시
  });
  if (!res.ok) {
    throw new Error(`betman fetch 실패: ${res.status}`);
  }
  const raw = await res.text();
  return parseBetmanOdds(raw);
}

/**
 * 베트맨 응답(JSON 또는 HTML 문자열)을 Odds[] 로 정규화한다.
 * 순수 함수이며 어떤 입력에도 throw 하지 않는다(실패 시 []).
 */
export async function parseBetmanOdds(raw: string): Promise<Odds[]> {
  if (!raw || !raw.trim()) return [];

  // 0순위: gameSlip.do 형식(compSchedules.keys/datas)
  const gs = parseBetmanGameSlip(raw);
  if (gs.length > 0) return gs;

  // 1순위: JSON 파싱 시도 (베트맨 내부 XHR 이 JSON 일 가능성)
  try {
    const json = JSON.parse(raw) as unknown;
    const rows = findRows(json);
    if (rows.length > 0) return rows.map(rowToOdds).filter(isOdds);
  } catch {
    // JSON 아님 → HTML 로 폴백
  }

  // 2순위: HTML 파싱 (cheerio 는 동적 import, 미설치/실패해도 [] 반환)
  try {
    return await parseBetmanHtml(raw);
  } catch {
    return [];
  }
}

// 마켓별 추가 필드 후보 키(구조 변경 시 여기만 수정). 앞에서부터 우선 탐색.
// ✅ 'handi' 는 실데이터에서 확인된 기준선 컬럼이다(collector/inspect.js 가 이 컬럼을 읽음).
//    베트맨 proto 는 핸디캡·언더오버 모두 'handi' 에 기준선을 둔다(핸디 정수 / U/O 기준점).
//    나머지 후보는 구조 변형 대비 폴백. 새 실응답에서 다른 키가 보이면 앞에 추가하면 된다.
const MARKET_FIELDS = {
  // 핸디캡 기준선(홈 기준 정수, 예: -1)
  handicap: ['handi', 'handicapScore', 'wdlScore', 'hdcScore', 'handicap'],
  // 언더오버 기준선(예: 2.5) — 베트맨은 동일 'handi' 컬럼 재사용
  ouLine: ['handi', 'ouScore', 'uoScore', 'baseScore', 'stdScore', 'line'],
  // 언더오버 오버/언더 배당 — 베트맨은 별도 컬럼 없이 winAllot=오버, loseAllot=언더 재사용.
  over: ['overAllot', 'ovrAllot', 'uoOverAllot', 'ouOverAllot'],
  under: ['underAllot', 'udrAllot', 'uoUnderAllot', 'ouUnderAllot'],
} as const;

/** betTypNm(게임유형명)을 우리 MarketType 으로 분류. 모르는 유형은 null(버림). */
function classifyMarket(betTypNm: string): MarketType | null {
  if (betTypNm === '승무패') return '1X2';
  if (betTypNm.includes('핸디')) return 'HANDICAP';
  if (
    betTypNm.includes('언더오버') ||
    betTypNm.includes('오버언더') ||
    betTypNm.includes('U/O')
  )
    return 'OU';
  return null;
}

/** keys 배열에서 후보 키들 중 처음 발견되는 인덱스(없으면 -1). */
function firstIndex(keys: string[], candidates: readonly string[]): number {
  for (const c of candidates) {
    const i = keys.indexOf(c);
    if (i >= 0) return i;
  }
  return -1;
}

/** 부호 있는 숫자(핸디/기준선용). parseOdd 와 달리 음수·0 허용. */
function parseSigned(value: unknown): number | null {
  const n = typeof value === 'number' ? value : parseFloat(String(value ?? ''));
  return Number.isFinite(n) ? n : null;
}

/**
 * 베트맨 gameSlip.do 응답(compSchedules.keys/datas)을 파싱해 전 마켓을 추출한다.
 * 축구 월드컵의 승무패(1X2)·핸디캡·언더오버 정규시간 행을 MarketOdds 로 변환한다.
 *  - 1X2/HANDICAP: winAllot=승, drawAllot=무, loseAllot=패. HANDICAP 은 핸디 기준선도 가짐.
 *  - OU: over/under 배당 + 기준선(line).
 * 어떤 입력에도 throw 하지 않는다(실패 시 []).
 */
export function parseBetmanMarkets(raw: string): MarketOdds[] {
  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch {
    return [];
  }
  const cs = (json as { compSchedules?: { keys?: unknown; datas?: unknown } })
    ?.compSchedules;
  if (!cs || !Array.isArray(cs.keys) || !Array.isArray(cs.datas)) return [];

  const keys = cs.keys as string[];
  const idx = (k: string) => keys.indexOf(k);
  const iItem = idx('itemCode');
  // 월드컵 여부는 leagueName('축구 월드컵')에 있다. gameName 은 보통 null.
  const iLeague = idx('leagueName');
  const iHome = idx('homeName');
  const iAway = idx('awayName');
  const iWin = idx('winAllot');
  const iDraw = idx('drawAllot');
  const iLose = idx('loseAllot');
  const iBet = idx('betTypNm');
  const iBetId = idx('betId'); // 1X2 는 betId='1'(정규시간)만, '118'(전반 승무패) 등 제외
  const iHd = firstIndex(keys, MARKET_FIELDS.handicap);
  const iOuLine = firstIndex(keys, MARKET_FIELDS.ouLine);
  const iOver = firstIndex(keys, MARKET_FIELDS.over);
  const iUnder = firstIndex(keys, MARKET_FIELDS.under);
  if (iHome < 0 || iWin < 0 || iLose < 0) return [];

  const now = new Date().toISOString();
  const out: MarketOdds[] = [];
  for (const row of cs.datas as unknown[][]) {
    if (iItem >= 0 && row[iItem] !== 'SC') continue; // 축구만
    if (iLeague >= 0 && !String(row[iLeague] ?? '').includes('월드컵')) continue;

    const betTyp = iBet >= 0 ? (str(row[iBet]) ?? '') : '승무패';
    if (betTyp.includes('전반')) continue; // 정규시간만(전반전 마켓 제외)
    const market = classifyMarket(betTyp);
    if (!market) continue;
    // 1X2 는 정규시간(betId='1')만. 핸디/언오는 유형별 betId 가 달라 필터하지 않는다.
    if (market === '1X2' && iBetId >= 0 && String(row[iBetId]) !== '1') continue;

    const home = str(row[iHome]);
    const away = str(row[iAway]);
    if (!home || !away) continue;

    const base = {
      matchId: `betman-${home}-${away}`,
      externalRef: `${home}|${away}`,
      betId: iBetId >= 0 ? str(row[iBetId]) : undefined,
      market,
      updatedAt: now,
      source: 'betman' as const,
    };

    if (market === 'OU') {
      const over = iOver >= 0 ? parseOdd(row[iOver]) : parseOdd(row[iWin]);
      const under = iUnder >= 0 ? parseOdd(row[iUnder]) : parseOdd(row[iLose]);
      if (over == null || under == null) continue;
      const line = iOuLine >= 0 ? parseSigned(row[iOuLine]) : null;
      out.push({ ...base, line: line ?? undefined, over, under });
      continue;
    }

    // 1X2 / HANDICAP — 3-way
    const w = parseOdd(row[iWin]);
    const d = iDraw >= 0 ? parseOdd(row[iDraw]) : null;
    const l = parseOdd(row[iLose]);
    if (w == null || l == null) continue;
    const o: MarketOdds = { ...base, home: w, draw: d ?? undefined, away: l };
    if (market === 'HANDICAP' && iHd >= 0) {
      const h = parseSigned(row[iHd]);
      if (h != null) o.handicap = h;
    }
    out.push(o);
  }
  return out;
}

/**
 * 하위호환: 승무패(1X2)만 골라 옛 Odds 형태로 반환.
 * 기존 ingest(/api/odds)·테스트가 이 시그니처에 의존한다.
 */
export function parseBetmanGameSlip(raw: string): Odds[] {
  return parseBetmanMarkets(raw)
    .filter(
      (o) =>
        o.market === '1X2' &&
        o.home != null &&
        o.draw != null &&
        o.away != null,
    )
    .map((o) => ({
      matchId: o.matchId,
      externalRef: o.externalRef,
      home: o.home as number,
      draw: o.draw as number,
      away: o.away as number,
      updatedAt: o.updatedAt,
      source: o.source,
    }));
}

/**
 * 베트맨 배당을 우리 경기 목록(Match[])과 팀명 기준으로 매칭한다.
 * externalRef("홈|원정")로 팀쌍을 찾아 matchId 를 해당 Match.id 로 보정한다. 순수 함수.
 * Odds / MarketOdds 모두에 동작(제네릭).
 */
export function matchOddsToMatches<
  T extends { externalRef?: string; matchId: string },
>(odds: T[], matches: Match[]): T[] {
  const index = new Map<string, string>(); // 정렬된 팀쌍 키 → matchId
  for (const m of matches) {
    index.set(teamPairKey(m.home.name, m.away.name), m.id);
  }
  return odds.map((o) => {
    const [home, away] = (o.externalRef ?? '').split('|');
    const matchId = index.get(teamPairKey(home ?? '', away ?? ''));
    return matchId ? { ...o, matchId } : o;
  });
}

// ── 내부 헬퍼 ─────────────────────────────────────────────

interface BetmanRow {
  gameNo?: string;
  home?: string;
  away?: string;
  win?: number;
  draw?: number;
  lose?: number;
  closeAt?: string;
}

function findRows(json: unknown): Record<string, unknown>[] {
  if (Array.isArray(json)) return json as Record<string, unknown>[];
  if (json && typeof json === 'object') {
    const obj = json as Record<string, unknown>;
    for (const key of JSON_FIELDS.rows) {
      if (Array.isArray(obj[key])) return obj[key] as Record<string, unknown>[];
    }
  }
  return [];
}

function pickField(obj: Record<string, unknown>, keys: readonly string[]): unknown {
  for (const k of keys) {
    if (obj[k] != null && obj[k] !== '') return obj[k];
  }
  return undefined;
}

/** 배당 숫자 정규화. 비정상치(NaN/0이하/100초과)는 null. */
function parseOdd(value: unknown): number | null {
  const n = typeof value === 'number' ? value : parseFloat(String(value ?? ''));
  if (!Number.isFinite(n) || n <= 0 || n > 100) return null;
  return n;
}

function rowToOdds(obj: Record<string, unknown>): Odds | null {
  const row: BetmanRow = {
    gameNo: str(pickField(obj, JSON_FIELDS.gameNo)),
    home: str(pickField(obj, JSON_FIELDS.home)),
    away: str(pickField(obj, JSON_FIELDS.away)),
    win: parseOdd(pickField(obj, JSON_FIELDS.win)) ?? undefined,
    draw: parseOdd(pickField(obj, JSON_FIELDS.draw)) ?? undefined,
    lose: parseOdd(pickField(obj, JSON_FIELDS.lose)) ?? undefined,
    closeAt: str(pickField(obj, JSON_FIELDS.closeAt)),
  };
  return buildOdds(row);
}

function buildOdds(row: BetmanRow): Odds | null {
  if (row.win == null || row.draw == null || row.lose == null) return null;
  return {
    matchId: row.gameNo ? `betman-${row.gameNo}` : `betman-${row.home}-${row.away}`,
    externalRef: `${row.home ?? ''}|${row.away ?? ''}`,
    home: row.win,
    draw: row.draw,
    away: row.lose,
    updatedAt: new Date().toISOString(),
    source: 'betman',
  };
}

/** HTML 표 파싱. cheerio 를 동적 import 하여 미설치 시에도 빌드가 깨지지 않게 한다. */
async function parseBetmanHtml(html: string): Promise<Odds[]> {
  let load: typeof import('cheerio')['load'];
  try {
    ({ load } = await import('cheerio'));
  } catch {
    // cheerio 미설치 — HTML 경로 비활성, 빈 배열
    return [];
  }
  const $ = load(html);
  const out: Odds[] = [];
  // 한 행(tr)에서 팀명/배당 셀을 추정 추출. 구조 변경 시 이 셀렉터만 수정.
  $('table tr').each((_, tr) => {
    const cells = $(tr)
      .find('td')
      .map((__, td) => $(td).text().trim())
      .get();
    if (cells.length < 5) return;
    // 추정 컬럼 순서: [게임번호, 홈팀, 승, 무, 패, 원정팀, ...]
    const row: BetmanRow = {
      gameNo: cells[0] || undefined,
      home: cells[1] || undefined,
      win: parseOdd(cells[2]) ?? undefined,
      draw: parseOdd(cells[3]) ?? undefined,
      lose: parseOdd(cells[4]) ?? undefined,
      away: cells[5] || undefined,
    };
    const odds = buildOdds(row);
    if (odds) out.push(odds);
  });
  return out;
}

function teamPairKey(a: string, b: string): string {
  // teamCanon(영문→한글 표준명)으로 먼저 통일한 뒤 정규화한다.
  // 베트맨은 한글 팀명("브라질"), 경기 소스는 영문("Brazil")을 주므로
  // 번역 없이는 매칭이 안 된다. teamCanon 이 양쪽을 같은 한글로 맞춰준다.
  return [
    normalizeTeamName(teamCanon(a)),
    normalizeTeamName(teamCanon(b)),
  ]
    .sort()
    .join('|');
}

function normalizeTeamName(name: string): string {
  // 기본 정규화: 괄호 제거 → 소문자 → 악센트(발음기호) 제거 → 공백 제거.
  // (Curaçao→curacao 처럼 영문 일정과 베트맨 표기가 악센트 때문에 안 맞던 문제 방지)
  const base = name
    .replace(/\(.*?\)/g, '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .normalize('NFC') // 한글은 다시 결합(자모 분해 방지)
    .replace(/\s+/g, '');
  // 별칭 테이블(한글/영문 변형)을 표준값으로 수렴.
  return TEAM_ALIASES[base] ?? base;
}

function str(v: unknown): string | undefined {
  if (v == null) return undefined;
  const s = String(v).trim();
  return s === '' ? undefined : s;
}

function isOdds(o: Odds | null): o is Odds {
  return o !== null;
}
