'use client';

// 구매 슬립 패널(장바구니 창) — 화면 우하단 고정.
// 담긴 폴 목록·총배당·구매금액·예상 적중금을 보여주고 "구매 확정"으로 전표를 저장한다.

import { useEffect, useRef, useState } from 'react';
import { useFormState, useFormStatus } from 'react-dom';
import { useRouter } from 'next/navigation';
import { useSlip } from './SlipProvider';
import { createSlipAction, type SlipActionState } from '@/lib/bets/slip-actions';

const initial: SlipActionState = { ok: false };

const marketLabel: Record<string, string> = {
  '1X2': '승무패',
  HANDICAP: '핸디캡',
  OU: '언더오버',
};

function ConfirmButton({ disabled }: { disabled: boolean }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className="primary slip-buy" disabled={pending || disabled}>
      {pending ? '구매 중…' : '구매 확정'}
    </button>
  );
}

export function SlipPanel() {
  const { legs, combined, remove, clear, open, setOpen } = useSlip();
  const [state, formAction] = useFormState(createSlipAction, initial);
  const [stake, setStake] = useState('');
  const router = useRouter();
  const okRef = useRef(false);

  // 구매 성공 시 슬립 비우고 패널 접고 목록 갱신.
  useEffect(() => {
    if (state.ok && !okRef.current) {
      okRef.current = true;
      clear();
      setStake('');
      setOpen(false);
      router.refresh();
      const t = setTimeout(() => {
        okRef.current = false;
      }, 1500);
      return () => clearTimeout(t);
    }
    if (!state.ok) okRef.current = false;
  }, [state, clear, router, setOpen]);

  const count = legs.length;
  const stakeNum = Number(stake);
  const expected =
    stakeNum > 0 && combined > 1 ? Math.round(stakeNum * combined) : null;

  // 닫혀 있으면 FAB 만 보인다(X 로 언제든 접을 수 있게 open 만으로 판단).
  if (!open) {
    return (
      <button
        type="button"
        className="slip-fab"
        onClick={() => setOpen(true)}
        aria-label="구매 슬립 열기"
      >
        🧾 슬립{count > 0 && <span className="slip-count">{count}</span>}
      </button>
    );
  }

  return (
    <div className={`slip-panel ${open ? 'open' : ''}`}>
      <div className="slip-head">
        <strong>🧾 구매 슬립 {count > 0 && <span className="slip-count">{count}</span>}</strong>
        <button type="button" className="slip-x" onClick={() => setOpen(false)} aria-label="닫기">
          ✕
        </button>
      </div>

      {count === 0 ? (
        <p className="muted slip-empty">
          경기·베팅 화면에서 배당을 누르면 여기에 담깁니다.
          {state.ok && <span className="success"> ✓ 구매 완료</span>}
        </p>
      ) : (
        <>
          <ul className="slip-legs">
            {legs.map((l) => (
              <li key={l.matchId} className="slip-leg">
                <div className="slip-leg-main">
                  <span className="slip-leg-match">{l.matchLabel}</span>
                  <span className="slip-leg-pick">
                    <span className="slip-leg-market">{marketLabel[l.market] ?? l.market}</span>
                    {l.pickLabel}
                    <b> {l.odds.toFixed(2)}</b>
                  </span>
                </div>
                <button
                  type="button"
                  className="slip-leg-del"
                  onClick={() => remove(l.matchId)}
                  aria-label="폴 제거"
                >
                  ✕
                </button>
              </li>
            ))}
          </ul>

          <div className="slip-summary">
            <div className="slip-row">
              <span>{count}폴 {count >= 2 ? '조합' : '단폴'} · 총배당</span>
              <b className="slip-combined">{combined.toFixed(2)}</b>
            </div>
          </div>

          <form action={formAction} className="slip-form">
            <input type="hidden" name="legs" value={JSON.stringify(legPayload(legs))} />
            <label htmlFor="slip-stake" className="slip-stake-label">
              구매금액 (원)
            </label>
            <input
              id="slip-stake"
              name="stake"
              type="number"
              step="1000"
              min="1000"
              value={stake}
              onChange={(e) => setStake(e.target.value)}
              placeholder="예: 10000"
              required
            />
            {expected != null && (
              <div className="slip-expected">
                예상 적중금 <b>{expected.toLocaleString('ko-KR')}원</b>
                <span className="muted">
                  {' '}
                  (순이익 +{(expected - Math.round(stakeNum)).toLocaleString('ko-KR')}원)
                </span>
              </div>
            )}
            <div className="slip-actions">
              <ConfirmButton disabled={count === 0} />
              <button type="button" className="slip-clear" onClick={clear}>
                비우기
              </button>
            </div>
            {state.error && <span className="error">⚠ {state.error}</span>}
            {state.ok && <span className="success">✓ 구매 완료</span>}
          </form>
        </>
      )}
    </div>
  );
}

function legPayload(legs: ReturnType<typeof useSlip>['legs']) {
  return legs.map((l) => ({
    matchId: l.matchId,
    market: l.market,
    pick: l.pick,
    line: l.line,
    oddsAtPlacement: l.odds,
  }));
}
