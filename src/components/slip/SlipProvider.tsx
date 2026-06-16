'use client';

// 구매 슬립(장바구니) 전역 상태. 경기/배당 화면의 배당 셀을 누르면 폴이 담기고,
// SlipPanel 에서 총배당·예상 적중금을 보고 구매를 확정한다.
// 새로고침 보존을 위해 localStorage 에 동기화한다.

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import type { LegPick, MarketType } from '@/lib/types';

export interface SlipLeg {
  matchId: string;
  /** 경기 표시명 (예: "브라질 vs 모로코") */
  matchLabel: string;
  market: MarketType;
  pick: LegPick;
  /** 선택 표시명 (예: "브라질 승", "오버 2.5") */
  pickLabel: string;
  /** 핸디 또는 OU 기준선 */
  line?: number;
  odds: number;
}

interface SlipContextValue {
  legs: SlipLeg[];
  /** 폴 추가/교체(한 경기당 1폴 — 같은 경기는 덮어씀). 같은 선택 재클릭 시 제거(토글). */
  toggle: (leg: SlipLeg) => void;
  remove: (matchId: string) => void;
  clear: () => void;
  /** 해당 경기에 담긴 폴(없으면 undefined). 셀 활성 표시용. */
  legOf: (matchId: string) => SlipLeg | undefined;
  combined: number;
  open: boolean;
  setOpen: (v: boolean) => void;
}

const SlipContext = createContext<SlipContextValue | null>(null);

const KEY = 'gugu-slip-v1';

function sameSelection(a: SlipLeg, b: SlipLeg): boolean {
  return (
    a.matchId === b.matchId &&
    a.market === b.market &&
    a.pick === b.pick &&
    (a.line ?? null) === (b.line ?? null)
  );
}

export function SlipProvider({ children }: { children: React.ReactNode }) {
  const [legs, setLegs] = useState<SlipLeg[]>([]);
  const [open, setOpen] = useState(false);
  const [hydrated, setHydrated] = useState(false);

  // 최초 마운트 시 localStorage 복원.
  useEffect(() => {
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) setLegs(JSON.parse(raw) as SlipLeg[]);
    } catch {
      /* 무시 */
    }
    setHydrated(true);
  }, []);

  // 변경 시 저장.
  useEffect(() => {
    if (!hydrated) return;
    try {
      localStorage.setItem(KEY, JSON.stringify(legs));
    } catch {
      /* 무시 */
    }
  }, [legs, hydrated]);

  const toggle = useCallback((leg: SlipLeg) => {
    setLegs((prev) => {
      const existing = prev.find((l) => l.matchId === leg.matchId);
      // 같은 경기-같은 선택 재클릭 → 제거(토글).
      if (existing && sameSelection(existing, leg)) {
        return prev.filter((l) => l.matchId !== leg.matchId);
      }
      // 같은 경기 다른 선택 → 교체. 새 경기 → 추가.
      const without = prev.filter((l) => l.matchId !== leg.matchId);
      return [...without, leg];
    });
    setOpen(true);
  }, []);

  const remove = useCallback((matchId: string) => {
    setLegs((prev) => prev.filter((l) => l.matchId !== matchId));
  }, []);

  const clear = useCallback(() => setLegs([]), []);

  const legOf = useCallback(
    (matchId: string) => legs.find((l) => l.matchId === matchId),
    [legs],
  );

  const combined = useMemo(
    () => Math.round(legs.reduce((p, l) => p * (l.odds || 1), 1) * 100) / 100,
    [legs],
  );

  const value = useMemo<SlipContextValue>(
    () => ({ legs, toggle, remove, clear, legOf, combined, open, setOpen }),
    [legs, toggle, remove, clear, legOf, combined, open],
  );

  return <SlipContext.Provider value={value}>{children}</SlipContext.Provider>;
}

export function useSlip(): SlipContextValue {
  const ctx = useContext(SlipContext);
  if (!ctx) throw new Error('useSlip 은 SlipProvider 안에서만 사용할 수 있습니다.');
  return ctx;
}
