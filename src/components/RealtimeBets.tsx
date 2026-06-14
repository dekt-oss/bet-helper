'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { getSupabaseBrowser } from '@/lib/db/supabase';

// Supabase Realtime 으로 bets/odds/opinions 변경을 구독한다.
// 누군가 베팅을 입력/정산하면 모든 접속자 화면이 즉시 갱신된다.
// (Supabase 미설정 시 no-op — AutoRefresh 60초 폴링이 폴백)
//
// ⚠️ 이 컴포넌트는 루트 레이아웃에 있어 error.tsx 경계 밖이다.
// 여기서 동기 예외가 나면 global-error 로 앱 전체가 죽으므로,
// 구독 설정 전체를 try/catch 로 감싸 어떤 경우에도 앱을 무너뜨리지 않는다.
// (실시간 구독이 실패해도 AutoRefresh 폴링이 데이터를 갱신한다.)
export function RealtimeBets() {
  const router = useRouter();
  useEffect(() => {
    let cleanup: (() => void) | undefined;
    try {
      const sb = getSupabaseBrowser();
      if (!sb) return;
      const refresh = () => {
        try {
          router.refresh();
        } catch {
          /* 갱신 실패는 무시 — 다음 폴링이 보정 */
        }
      };
      const channel = sb
        .channel('db-changes')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'bets' }, refresh)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'odds' }, refresh)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'opinions' }, refresh)
        .subscribe();
      cleanup = () => {
        try {
          sb.removeChannel(channel);
        } catch {
          /* 정리 실패 무시 */
        }
      };
    } catch (err) {
      // 실시간 구독 실패가 앱을 죽이지 않게 한다(폴백: AutoRefresh 폴링).
      console.warn('[realtime] 구독 설정 실패(무시):', err);
    }
    return () => cleanup?.();
  }, [router]);
  return null;
}
