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
const USERNAME = process.env.WORLDCUP26_USERNAME ?? 'bet-helper';
const PASSWORD = process.env.WORLDCUP26_PASSWORD ?? 'BetHelper!wc2026';
const EMAIL = process.env.WORLDCUP26_EMAIL ?? 'bet-helper@example.com';

/** worldcup26.ir 사용 여부. WORLDCUP26_DISABLED=true 로 끌 수 있다. */
export function isWorldcup26Enabled(): boolean {
  return process.env.WORLDCUP26_DISABLED !== 'true';
}

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

async function authenticate(): Promise<string | null> {
  const res = await fetch(`${BASE}/auth/authenticate`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ username: USERNAME, email: EMAIL, password: PASSWORD }),
    cache: 'no-store',
  });
  if (!res.ok) return null;
  return pickToken(await res.json().catch(() => null));
}

async function register(): Promise<void> {
  // 계정이 없으면 자동 등록을 시도한다. 이미 있으면 에러가 나도 무시.
  try {
    await fetch(`${BASE}/auth/register`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ username: USERNAME, email: EMAIL, password: PASSWORD }),
      cache: 'no-store',
    });
  } catch (err) {
    console.warn('[worldcup26] 자동 등록 실패(무시):', err);
  }
}

async function getToken(): Promise<string | null> {
  if (cachedToken && cachedToken.expiresAt > Date.now()) return cachedToken.value;

  let token = await authenticate();
  if (!token) {
    // 로그인 실패 → 계정 자동 등록 후 재시도.
    await register();
    token = await authenticate();
  }
  if (!token) return null;
  cachedToken = { value: token, expiresAt: Date.now() + TOKEN_TTL_MS };
  return token;
}

async function apiGet<T>(path: string, revalidate: number): Promise<T> {
  const token = await getToken();
  if (!token) throw new Error('worldcup26: 인증 토큰을 받지 못했습니다');
  const res = await fetch(`${BASE}${path}`, {
    headers: { authorization: `Bearer ${token}` },
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

function toKickoffIso(local?: string): string {
  // "MM/DD/YYYY HH:mm" → ISO. openfootball 과 동일하게 입력값을 UTC 로 간주(타임존 TODO).
  if (!local) return new Date(0).toISOString();
  const m = local.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})[ T]+(\d{1,2}):(\d{2})/);
  if (!m) {
    const d = new Date(local);
    return Number.isNaN(d.getTime()) ? new Date(0).toISOString() : d.toISOString();
  }
  const [, mo, day, y, h, mi] = m;
  const p = (x: string) => x.padStart(2, '0');
  return new Date(`${y}-${p(mo)}-${p(day)}T${p(h)}:${p(mi)}:00Z`).toISOString();
}

function parseScorers(raw: string | undefined): string[] {
  if (!raw || raw === 'null' || raw.trim() === '') return [];
  return raw
    .split(/[,;]/)
    .map((s) => s.trim())
    .filter(Boolean);
}

function deriveStatus(g: WcGame): Match['status'] {
  const t = (g.time_elapsed ?? '').toLowerCase();
  if (g.finished === 'TRUE' || t === 'ft') return 'FINISHED';
  if (t === '' || t === 'notstarted') return 'SCHEDULED';
  if (t === 'ht' || t === 'halftime') return 'PAUSED';
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

/** worldcup26.ir 전체 경기를 우리 Match 로 정규화해 반환. */
export async function fetchWorldcup26Matches(): Promise<Match[]> {
  const [body, venues] = await Promise.all([
    apiGet<{ games?: WcGame[] }>('/get/games', 60),
    fetchStadiums(),
  ]);
  const games = body.games ?? [];
  return games.map((g) => gameToMatch(g, venues));
}
