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

import type { Match, Odds } from '@/lib/types';

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

/**
 * 베트맨 gameSlip.do 응답(compSchedules.keys/datas)을 파싱한다.
 * 축구 월드컵 "승무패"(1X2) 행만 골라 Odds 로 변환한다.
 *  winAllot=홈 승, drawAllot=무, loseAllot=원정 승(=홈 패).
 * 어떤 입력에도 throw 하지 않는다(실패 시 []).
 */
export function parseBetmanGameSlip(raw: string): Odds[] {
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
  const iBetId = idx('betId'); // betId='1' = 정규시간 승무패('118'=전반 승무패 등 제외)
  if (iHome < 0 || iWin < 0 || iLose < 0) return [];

  const now = new Date().toISOString();
  const out: Odds[] = [];
  for (const row of cs.datas as unknown[][]) {
    if (iItem >= 0 && row[iItem] !== 'SC') continue; // 축구만
    if (iBet >= 0 && row[iBet] !== '승무패') continue; // 1X2 마켓만(핸디캡 등 제외)
    if (iBetId >= 0 && String(row[iBetId]) !== '1') continue; // 정규시간만(전반 승무패 제외)
    if (iLeague >= 0 && !String(row[iLeague] ?? '').includes('월드컵')) continue;

    const home = str(row[iHome]);
    const away = str(row[iAway]);
    const w = parseOdd(row[iWin]);
    const d = iDraw >= 0 ? parseOdd(row[iDraw]) : null;
    const l = parseOdd(row[iLose]);
    if (w == null || d == null || l == null || !home || !away) continue;

    out.push({
      matchId: `betman-${home}-${away}`,
      externalRef: `${home}|${away}`,
      home: w,
      draw: d,
      away: l,
      updatedAt: now,
      source: 'betman',
    });
  }
  return out;
}

/**
 * 베트맨 배당(Odds[])을 우리 경기 목록(Match[])과 팀명 기준으로 매칭한다.
 * 매칭되면 odds.matchId 를 해당 Match.id 로 보정한다. 순수 함수.
 */
export function matchOddsToMatches(odds: Odds[], matches: Match[]): Odds[] {
  const index = new Map<string, string>(); // 정렬된 팀쌍 키 → matchId
  for (const m of matches) {
    index.set(teamPairKey(m.home.name, m.away.name), m.id);
  }
  return odds.map((o) => {
    // externalRef 에 "홈|원정" 원문이 보존돼 있다고 가정(rowToOdds 에서 기록)
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
  return [normalizeTeamName(a), normalizeTeamName(b)].sort().join('|');
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
