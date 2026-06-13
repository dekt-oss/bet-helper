// Supabase 클라이언트 팩토리.
// 환경변수가 없으면 null 을 반환하고, 상위 코드는 JSON 파일 저장소로 폴백한다.
// 따라서 크레덴셜 없이도 빌드/개발이 가능하고, env 만 채우면 공유 DB 로 전환된다.

import { createClient, type SupabaseClient } from '@supabase/supabase-js';

const RAW_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

// URL 에 끝 슬래시나 경로(/rest/v1 등)가 섞이면 supabase-js 가 만드는 REST 경로가
// 깨져 모든 요청이 PGRST125("Invalid path specified in request URL")로 실패한다.
// origin(스킴+호스트)만 남겨 이를 원천 차단한다.
function normalizeUrl(u?: string): string | undefined {
  if (!u) return undefined;
  try {
    return new URL(u).origin;
  } catch {
    return u.replace(/\/+$/, '');
  }
}
const URL_ = normalizeUrl(RAW_URL);

/** 진단용: 설정된 원본 URL 과 정규화 결과. (NEXT_PUBLIC 이라 비밀 아님) */
export function supabaseUrlDebug(): { raw: string | null; normalized: string | null } {
  return { raw: RAW_URL ?? null, normalized: URL_ ?? null };
}

export function isSupabaseConfigured(): boolean {
  return Boolean(URL_ && ANON_KEY);
}

// 서버 전용 (쓰기 포함). service role 키가 있으면 사용, 없으면 anon 키.
let serverClient: SupabaseClient | null | undefined;
export function getSupabaseServer(): SupabaseClient | null {
  if (serverClient !== undefined) return serverClient;
  serverClient =
    URL_ && ANON_KEY
      ? createClient(URL_, SERVICE_KEY ?? ANON_KEY, {
          auth: { persistSession: false },
        })
      : null;
  return serverClient;
}

// 브라우저용 (읽기 + Realtime 구독). anon 키만 사용.
let browserClient: SupabaseClient | null | undefined;
export function getSupabaseBrowser(): SupabaseClient | null {
  if (browserClient !== undefined) return browserClient;
  browserClient = URL_ && ANON_KEY ? createClient(URL_, ANON_KEY) : null;
  return browserClient;
}
