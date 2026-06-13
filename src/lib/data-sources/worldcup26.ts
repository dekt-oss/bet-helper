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
}

function num(s: string | undefined): number {
  const n = Number(s);
  return Number.isFinite(n) ? n : 0;
}

// worldcup26.ir 의 local_date 는 이란(테헤란, UTC+3:30) 기준이다.
// (persian_date 와 시:분이 동일 → 테헤란 시계). 분 단위 오프셋으로 UTC 로 환산한다.
// 혹시 다른 기준이면 WORLDCUP26_TZ_OFFSET_MINUTES 로 조정(테헤란=210, 한국=540, UTC=0).
const TZ_OFFSET_MIN = Number(
  process.env.WORLDCUP26_TZ_OFFSET_MINUTES ?? 210,
);

function toKickoffIso(local?: string): string {
  // "MM/DD/YYYY HH:mm" 를 TZ_OFFSET_MIN 시간대의 벽시계로 보고 UTC 로 환산.
  if (!local) return new Date(0).toISOString();
  const m = local.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})[ T]+(\d{1,2}):(\d{2})/);
  if (!m) {
    const d = new Date(local);
    return Number.isNaN(d.getTime()) ? new Date(0).toISOString() : d.toISOString();
  }
  const [, mo, day, y, h, mi] = m;
  const utcMs =
    Date.UTC(+y, +mo - 1, +day, +h, +mi) - TZ_OFFSET_MIN * 60_000;
  return new Date(utcMs).toISOString();
}

function parseScorers(raw: string | undefined): string[] {
  if (!raw) return [];
  // 원본 예: {“J. Quiñones 9'”,”R. Jiménez 67'”} — 중괄호/곡선따옴표 제거(분 표기 ' 는 유지).
  const cleaned = raw.replace(/[{}“”"]/g, '').trim();
  if (!cleaned || cleaned.toLowerCase() === 'null') return [];
  return cleaned
    .split(/[,;]/)
    .map((s) => s.trim())
    .filter((s) => s && s.toLowerCase() !== 'null');
}

function deriveStatus(g: WcGame): Match['status'] {
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

function gameToMatch(g: WcGame, venues: Map<string, string>): Match {
  const status = deriveStatus(g);
  const started = status !== 'SCHEDULED';
  const homeScorers = parseScorers(g.home_scorers);
  const awayScorers = parseScorers(g.away_scorers);
  const hasScorers = homeScorers.length > 0 || awayScorers.length > 0;
  return {
    id: `wc2026-${g.id}`,
    competition: 'FIFA World Cup 2026',
    stage: g.group ? `Group ${g.group}` : (g.type ?? undefined),
    kickoff: toKickoffIso(g.local_date),
    status,
    minute: deriveMinute(g),
    home: toTeam(g.home_team_name_en, g.home_team_id),
    away: toTeam(g.away_team_name_en, g.away_team_id),
    score: started ? { home: num(g.home_score), away: num(g.away_score) } : undefined,
    venue: g.stadium_id ? venues.get(g.stadium_id) : undefined,
    matchday: g.matchday,
    scorers: hasScorers ? { home: homeScorers, away: awayScorers } : undefined,
    source: 'worldcup26',
  };
}

// ── 공개 API ─────────────────────────────────────────────

/** 경기장 id → 이름 맵. (실패 시 빈 맵) */
async function fetchStadiums(): Promise<Map<string, string>> {
  try {
    const body = await apiGet<unknown>('/get/stadiums', 86400);
    const list: WcStadium[] = Array.isArray(body)
      ? (body as WcStadium[])
      : (((body as { stadiums?: WcStadium[] })?.stadiums ?? []) as WcStadium[]);
    const map = new Map<string, string>();
    for (const s of list) {
      if (s?.id && s.name_en) map.set(String(s.id), s.name_en);
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
    apiGet<{ games?: WcGame[] }>('/get/games', 60),
    fetchStadiums(),
  ]);
  const games = body.games ?? [];
  return games.map((g) => gameToMatch(g, venues));
}
