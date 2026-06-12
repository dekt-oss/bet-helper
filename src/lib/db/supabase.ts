// Supabase 클라이언트 팩토리.
// 환경변수가 없으면 null 을 반환하고, 상위 코드는 JSON 파일 저장소로 폴백한다.
// 따라서 크레덴셜 없이도 빌드/개발이 가능하고, env 만 채우면 공유 DB 로 전환된다.

import { createClient, type SupabaseClient } from '@supabase/supabase-js';

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

export function isSupabaseConfigured(): boolean {
  return Boolean(URL && ANON_KEY);
}

// 서버 전용 (쓰기 포함). service role 키가 있으면 사용, 없으면 anon 키.
let serverClient: SupabaseClient | null | undefined;
export function getSupabaseServer(): SupabaseClient | null {
  if (serverClient !== undefined) return serverClient;
  serverClient =
    URL && ANON_KEY
      ? createClient(URL, SERVICE_KEY ?? ANON_KEY, {
          auth: { persistSession: false },
        })
      : null;
  return serverClient;
}

// 브라우저용 (읽기 + Realtime 구독). anon 키만 사용.
let browserClient: SupabaseClient | null | undefined;
export function getSupabaseBrowser(): SupabaseClient | null {
  if (browserClient !== undefined) return browserClient;
  browserClient = URL && ANON_KEY ? createClient(URL, ANON_KEY) : null;
  return browserClient;
}
