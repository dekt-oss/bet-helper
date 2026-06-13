// worldcup26.ir — 월드컵 2026 상세 데이터(진행시간·득점자·경기장 포함).
// 공개 웹사이트는 봇 차단(403)이지만 뒤에 JSON API 가 있다.
//   GET /get/games      전체 경기 (점수/득점자/진행시간/경기장)
//   GET /get/stadiums   경기장 목록
//   POST /auth/register, /auth/authenticate (JWT)
// 인증이 필요해, 설정된 계정으로 로그인(없으면 자동 등록)해 토큰을 받아 캐시한다.
// ⚠️ 외부 egress 가 막힌 개발 환경에서는 실패하므로, 호출부에서 반드시 폴백한다.

import type { Match, Team } from '@/lib/types';

const BASE = process.env.WORLDCUP26_BASE_URL ?? 'https://worldcup26.ir';
// 공개 월드컵 데이터라 민감하지 않다. 환경변수로 덮어쓸 수 있게 둔다.
// 로그인 키는 email + password, 등록 시 추가로 name 이 필요하다.
const EMAIL = process.env.WORLDCUP26_EMAIL ?? 'bet-helper@worldcup.app';
const PASSWORD = process.env.WORLDCUP26_PASSWORD ?? 'BetHelper!wc2026';
const NAME = process.env.WORLDCUP26_USERNAME ?? 'bet-helper';

/** worldcup26.ir 사용 여부. WORLDCUP26_DISABLED=true 로 끌 수 있다. */
export function isWorldcup26Enabled(): boolean {
  return process.env.WORLDCUP26_DISABLED !== 'true';
}

// 일부 사이트는 기본 fetch UA 를 봇으로 보고 403 을 준다 → 브라우저처럼 위장.
const COMMON_HEADERS: Record<string, string> = {
  'user-agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36',
  accept: 'application/json, text/plain, */*',
  'accept-language': 'en-US,en;q=0.9',
};

// ── 인증(JWT) ────────────────────────────────────────────
// 토큰을 모듈 스코프에 캐시한다(웜 람다 재사용). 50분 후 만료로 간주해 재발급.
let cachedToken: { value: string; expiresAt: number } | null = null;
const TOKEN_TTL_MS = 50 * 60 * 1000;

function pickToken(body: unknown): string | null {
  if (!body || typeof body !== 'object') return null;
  const b = body as Record<string, unknown>;
  for (const k of ['token', 'accessToken', 'access_token', 'jwt']) {
    const v = b[k];
    if (typeof v === 'string' && v.length > 0) return v;
  }
  // { data: { token } } 같은 중첩도 한 단계 본다.
  if (b.data && typeof b.data === 'object') return pickToken(b.data);
  return null;
}

async function rawPost(
  path: string,
  body: Record<string, unknown>,
): Promise<Response> {
  return fetch(`${BASE}${path}`, {
    method: 'POST',
    headers: { ...COMMON_HEADERS, 'content-type': 'application/json' },
    body: JSON.stringify(body),
    cache: 'no-store',
  });
}

async function authenticate(): Promise<string | null> {
  const res = await rawPost('/auth/authenticate', {
    email: EMAIL,
    password: PASSWORD,
  });
  if (!res.ok) return null;
  return pickToken(await res.json().catch(() => null));
}

async function register(): Promise<string | null> {
  // 계정이 없으면 자동 등록을 시도한다. 성공 시 응답에 토큰이 포함된다.
  try {
    const res = await rawPost('/auth/register', {
      name: NAME,
      email: EMAIL,
      password: PASSWORD,
    });
    if (!res.ok) return null;
    return pickToken(await res.json().catch(() => null));
  } catch (err) {
    console.warn('[worldcup26] 자동 등록 실패(무시):', err);
    return null;
  }
}

async function getToken(): Promise<string | null> {
  if (cachedToken && cachedToken.expiresAt > Date.now()) return cachedToken.value;

  // 로그인 → 실패하면 계정 자동 등록(등록 응답에 토큰 포함).
  let token = await authenticate();
  if (!token) token = await register();
  if (!token) return null;
  cachedToken = { value: token, expiresAt: Date.now() + TOKEN_TTL_MS };
  return token;
}

async function apiGet<T>(path: string, revalidate: number): Promise<T> {
  const token = await getToken();
  if (!token) throw new Error('worldcup26: 인증 토큰을 받지 못했습니다');
  const res = await fetch(`${BASE}${path}`, {
    headers: { ...COMMON_HEADERS, authorization: `Bearer ${token}` },
    next: { revalidate },
  });
  if (res.status === 401) {
    // 토큰 만료 가능 → 1회 무효화 후 재시도.
    cachedToken = null;
    const fresh = await getToken();
    if (!fresh) throw new Error('worldcup26: 재인증 실패');
    const retry = await fetch(`${BASE}${path}`, {
      headers: { authorization: `Bearer ${fresh}` },
      next: { revalidate },
    });
    if (!retry.ok) throw new Error(`worldcup26 ${path}: ${retry.status}`);
    return (await retry.json()) as T;
  }
  if (!res.ok) throw new Error(`worldcup26 ${path}: ${res.status}`);
  return (await res.json()) as T;
}

// ── 응답 타입 & 매핑 ─────────────────────────────────────

interface WcGame {
  id: string;
  home_team_id?: string;
  away_team_id?: string;
  home_score?: string;
  away_score?: string;
  home_scorers?: string;
  away_scorers?: string;
  group?: string;
  matchday?: string;
  local_date?: string; // "06/11/2026 13:00"
  stadium_id?: string;
  finished?: string; // "TRUE" | "FALSE"
  time_elapsed?: string; // "notstarted" | "45" | "HT" | "FT" ...
  type?: string; // "group" | "round16" ...
  home_team_name_en?: string;
  away_team_name_en?: string;
}

interface WcStadium {
  id: string;
  name_en?: string;
  city_en?: string;
  country_en?: string;
}

/** 진단용: 경기장 목록 + 우리가 계산한 시간대 오프셋. (시간 매핑 교정용) */
export async function debugStadiums(): Promise<unknown> {
  try {
    const body = await apiGet<unknown>('/get/stadiums', 0);
    const list: WcStadium[] = Array.isArray(body)
      ? (body as WcStadium[])
      : (((body as { stadiums?: WcStadium[] })?.stadiums ?? []) as WcStadium[]);
    return list.map((s) => ({
      id: s.id,
      name: s.name_en,
      city: s.city_en,
      country: s.country_en,
      offsetMin: stadiumOffsetMin(s.name_en, s.city_en),
    }));
  } catch (e) {
    return { error: e instanceof Error ? e.message : String(e) };
  }
}

function num(s: string | undefined): number {
  const n = Number(s);
  return Number.isFinite(n) ? n : 0;
}

// worldcup26.ir 의 local_date 는 경기장 현지시간이다(멕시코 개최지 = UTC-6).
// 체코전(=Estadio Akron, 과달라하라): local 20:00 → 실제 한국시간 11:00 로 확인됨.
// 개최지가 여러 시간대(US 동/중/서부, 캐나다)면 경기별로 다를 수 있어 오프셋을
// WORLDCUP26_TZ_OFFSET_MINUTES 로 조정 가능(UTC-6=-360, 동부 EDT=-240, 서부 PDT=-420).
const TZ_OFFSET_MIN = Number(
  process.env.WORLDCUP26_TZ_OFFSET_MINUTES ?? -360,
);

// 2026 월드컵 16개 개최지의 6월(여름) UTC 오프셋(분).
//  - 멕시코(아즈테카/아크론/BBVA): UTC-6, DST 없음.
//  - US 동부/캐나다 동부(애틀랜타·보스턴·마이애미·뉴욕/뉴저지·필라델피아·토론토): EDT, UTC-4
//  - US 중부(댈러스·휴스턴·캔자스시티): CDT, UTC-5
//  - US 서부/캐나다 서부(LA·샌프란시스코·시애틀·밴쿠버): PDT, UTC-7
// 경기장 이름/도시 키워드로 매칭. 못 찾으면 undefined → 기본 오프셋(TZ_OFFSET_MIN) 폴백.
export function stadiumOffsetMin(
  name?: string,
  city?: string,
): number | undefined {
  const hay = `${name ?? ''} ${city ?? ''}`.toLowerCase();
  if (/los angeles|sofi|san francisco|santa clara|levi|seattle|lumen|vancouver|bc place/.test(hay))
    return -420; // PDT
  if (/dallas|arlington|at&t|at and t|houston|nrg|kansas city|arrowhead/.test(hay))
    return -300; // CDT
  if (/atlanta|mercedes-benz|boston|foxborough|gillette|miami|hard rock|new york|new jersey|rutherford|metlife|philadelphia|lincoln financial|toronto|bmo/.test(hay))
    return -240; // EDT
  if (/mexico|azteca|guadalajara|akron|monterrey|bbva/.test(hay))
    return -360; // 멕시코(CST, DST 없음)
  return undefined;
}

export function toKickoffIso(
  local?: string,
  offsetMin: number = TZ_OFFSET_MIN,
): string {
  // "MM/DD/YYYY HH:mm" 를 offsetMin 시간대의 벽시계로 보고 UTC 로 환산.
  if (!local) return new Date(0).toISOString();
  const m = local.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})[ T]+(\d{1,2}):(\d{2})/);
  if (!m) {
    const d = new Date(local);
    return Number.isNaN(d.getTime()) ? new Date(0).toISOString() : d.toISOString();
  }
  const [, mo, day, y, h, mi] = m;
  const utcMs = Date.UTC(+y, +mo - 1, +day, +h, +mi) - offsetMin * 60_000;
  return new Date(utcMs).toISOString();
}

export function parseScorers(raw: string | undefined): string[] {
  if (!raw) return [];
  // 원본 예: {“J. Quiñones 9'”,”R. Jiménez 67'”} — 중괄호/곡선따옴표 제거(분 표기 ' 는 유지).
  const cleaned = raw.replace(/[{}“”"]/g, '').trim();
  if (!cleaned || cleaned.toLowerCase() === 'null') return [];
  return cleaned
    .split(/[,;]/)
    .map((s) => s.trim())
    .filter((s) => s && s.toLowerCase() !== 'null');
}

export function deriveStatus(g: WcGame): Match['status'] {
  const t = (g.time_elapsed ?? '').toLowerCase().trim();
  if (g.finished === 'TRUE' || ['ft', 'finished', 'fulltime', 'full-time'].includes(t))
    return 'FINISHED';
  if (t === '' || t === 'notstarted' || t === 'not started') return 'SCHEDULED';
  if (['ht', 'halftime', 'half-time'].includes(t)) return 'PAUSED';
  return 'LIVE';
}

function deriveMinute(g: WcGame): number | undefined {
  const n = parseInt(g.time_elapsed ?? '', 10);
  return Number.isFinite(n) ? n : undefined;
}

function toTeam(name: string | undefined, id: string | undefined): Team {
  return { id: id ?? name ?? 'TBD', name: name ?? '미정' };
}

interface VenueInfo {
  name: string;
  offset?: number; // 개최지 UTC 오프셋(분). 못 구하면 기본값 폴백.
}

// worldcup26 는 knockout 라운드코드(R32/SF 등)를 group 필드에 넣는다.
// A~L 만 진짜 조별리그이고, 그 외는 토너먼트 스테이지 토큰으로 정규화한다.
const KNOCKOUT_CODE: Record<string, string> = {
  r32: 'round32', round32: 'round32', roundof32: 'round32', last32: 'round32',
  r16: 'round16', round16: 'round16', roundof16: 'round16', last16: 'round16',
  qf: 'quarter', quarter: 'quarter', quarterfinal: 'quarter', round8: 'quarter',
  sf: 'semi', semi: 'semi', semifinal: 'semi', round4: 'semi',
  f: 'final', final: 'final',
  '3p': 'third', tp: 'third', third: 'third', thirdplace: 'third',
};

export function mapStage(group?: string, type?: string): string | undefined {
  const t = (type ?? '').trim().toLowerCase();
  const norm = (x: string) => x.replace(/[\s._-]/g, '');
  // type 이 'group' 이 아니면 토너먼트 → 코드/타입을 표준 토큰으로.
  // (그래야 'F'(Final)가 'Group F' 로 오인되지 않음)
  if (t && t !== 'group') return KNOCKOUT_CODE[norm(t)] ?? t;
  const g = (group ?? '').trim();
  if (/^[A-L]$/i.test(g)) return `Group ${g.toUpperCase()}`;
  // type 이 비었거나 'group' 인데 group 이 A~L 이 아님 → 라운드코드일 수 있어 변환 시도.
  const key = norm((g || t).toLowerCase());
  return KNOCKOUT_CODE[key] ?? (g || t || undefined);
}

function gameToMatch(g: WcGame, venues: Map<string, VenueInfo>): Match {
  const status = deriveStatus(g);
  const started = status !== 'SCHEDULED';
  const homeScorers = parseScorers(g.home_scorers);
  const awayScorers = parseScorers(g.away_scorers);
  const hasScorers = homeScorers.length > 0 || awayScorers.length > 0;
  const venue = g.stadium_id ? venues.get(g.stadium_id) : undefined;
  return {
    id: `wc2026-${g.id}`,
    competition: 'FIFA World Cup 2026',
    stage: mapStage(g.group, g.type),
    // 개최지별 시간대로 환산(없으면 기본 -360).
    kickoff: toKickoffIso(g.local_date, venue?.offset ?? TZ_OFFSET_MIN),
    status,
    minute: deriveMinute(g),
    home: toTeam(g.home_team_name_en, g.home_team_id),
    away: toTeam(g.away_team_name_en, g.away_team_id),
    score: started ? { home: num(g.home_score), away: num(g.away_score) } : undefined,
    venue: venue?.name,
    matchday: g.matchday,
    scorers: hasScorers ? { home: homeScorers, away: awayScorers } : undefined,
    source: 'worldcup26',
  };
}

// ── 공개 API ─────────────────────────────────────────────

/** 경기장 id → {이름, 시간대 오프셋} 맵. (실패 시 빈 맵) */
async function fetchStadiums(): Promise<Map<string, VenueInfo>> {
  try {
    const body = await apiGet<unknown>('/get/stadiums', 86400);
    const list: WcStadium[] = Array.isArray(body)
      ? (body as WcStadium[])
      : (((body as { stadiums?: WcStadium[] })?.stadiums ?? []) as WcStadium[]);
    const map = new Map<string, VenueInfo>();
    for (const s of list) {
      if (s?.id && s.name_en)
        map.set(String(s.id), {
          name: s.name_en,
          offset: stadiumOffsetMin(s.name_en, s.city_en),
        });
    }
    return map;
  } catch (err) {
    console.warn('[worldcup26] 경기장 조회 실패(무시):', err);
    return new Map();
  }
}

// ── 진단(디버그) ─────────────────────────────────────────
// 운영에서 실제 응답 상태를 확인하기 위한 헬퍼. 민감정보(토큰)는 노출하지 않는다.

export interface Wc26Diag {
  base: string;
  email: string;
  authStatus: number | null;
  authBodySnippet?: string;
  registerStatus: number | null;
  registerBodySnippet?: string;
  tokenObtained: boolean;
  gamesStatus: number | null;
  gamesCount: number | null;
  firstGame?: unknown;
  error?: string;
}

export async function diagnoseWorldcup26(): Promise<Wc26Diag> {
  const diag: Wc26Diag = {
    base: BASE,
    email: EMAIL,
    authStatus: null,
    registerStatus: null,
    tokenObtained: false,
    gamesStatus: null,
    gamesCount: null,
  };
  try {
    const authRes = await rawPost('/auth/authenticate', {
      email: EMAIL,
      password: PASSWORD,
    });
    diag.authStatus = authRes.status;
    let body = await authRes.text();
    let token = pickToken(safeJson(body));
    diag.authBodySnippet = body.slice(0, 200);

    if (!token) {
      const reg = await rawPost('/auth/register', {
        name: NAME,
        email: EMAIL,
        password: PASSWORD,
      });
      diag.registerStatus = reg.status;
      body = await reg.text();
      diag.registerBodySnippet = body.slice(0, 200);
      token = pickToken(safeJson(body));
    }
    diag.tokenObtained = Boolean(token);

    if (token) {
      const gamesRes = await fetch(`${BASE}/get/games`, {
        headers: { ...COMMON_HEADERS, authorization: `Bearer ${token}` },
        cache: 'no-store',
      });
      diag.gamesStatus = gamesRes.status;
      const gtext = await gamesRes.text();
      const parsed = safeJson(gtext) as { games?: unknown[] } | null;
      diag.gamesCount = Array.isArray(parsed?.games) ? parsed!.games!.length : null;
      diag.firstGame = parsed?.games?.[0] ?? gtext.slice(0, 200);
    }
  } catch (err) {
    diag.error = err instanceof Error ? err.message : String(err);
  }
  return diag;
}

function safeJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

/** worldcup26.ir 전체 경기를 우리 Match 로 정규화해 반환. */
export async function fetchWorldcup26Matches(): Promise<Match[]> {
  const [body, venues] = await Promise.all([
    apiGet<{ games?: WcGame[] }>('/get/games', 300),
    fetchStadiums(),
  ]);
  const games = body.games ?? [];
  return games.map((g) => gameToMatch(g, venues));
}
