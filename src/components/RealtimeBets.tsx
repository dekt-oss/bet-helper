'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { getSupabaseBrowser } from '@/lib/db/supabase';

// Supabase Realtime 으로 bets 테이블 변경을 구독한다.
// 누군가 베팅을 입력/정산하면 모든 접속자 화면이 즉시 갱신된다.
// (Supabase 미설정 시 no-op — AutoRefresh 60초 폴링이 폴백)
export function RealtimeBets() {
  const router = useRouter();
  useEffect(() => {
    const sb = getSupabaseBrowser();
    if (!sb) return;
    const channel = sb
      .channel('db-changes')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'bets' },
        () => router.refresh(),
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'odds' },
        () => router.refresh(),
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'opinions' },
        () => router.refresh(),
      )
      .subscribe();
    return () => {
      sb.removeChannel(channel);
    };
  }, [router]);
  return null;
}
