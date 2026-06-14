'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

// 매 분(기본 60초)마다 서버 컴포넌트를 새로고침해 최신 데이터를 반영한다.
// router.refresh() 는 클라이언트 상태는 유지한 채 서버 데이터만 다시 가져온다.
export function AutoRefresh({ intervalMs = 60000 }: { intervalMs?: number }) {
  const router = useRouter();
  const [updatedAt, setUpdatedAt] = useState<Date | null>(null);

  useEffect(() => {
    const tick = () => {
      // 탭이 백그라운드일 때는 새로고침하지 않는다.
      // (보이지 않는 화면을 갱신하느라 생기는 불필요한 서버 부하/버퍼링 방지)
      if (typeof document !== 'undefined' && document.hidden) return;
      router.refresh();
      setUpdatedAt(new Date());
    };
    const t = setInterval(tick, intervalMs);
    return () => clearInterval(t);
  }, [router, intervalMs]);

  return (
    <span className="muted" style={{ fontSize: 12 }}>
      🔄 자동 갱신 {Math.round(intervalMs / 1000)}초
      {updatedAt
        ? ` · 마지막 ${updatedAt.toLocaleTimeString('ko-KR')}`
        : ''}
    </span>
  );
}
