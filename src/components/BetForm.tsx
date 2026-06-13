'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useFormState, useFormStatus } from 'react-dom';
import { createBetAction, type ActionState } from '@/lib/bets/actions';
import type { Outcome } from '@/lib/types';
import { type MatchOption, matchOptionLabel } from '@/lib/teams/options';

export type { MatchOption };

export interface OddsTriple {
  home: number;
  draw: number;
  away: number;
}

const initial: ActionState = { ok: false };

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className="primary" disabled={pending}>
      {pending ? '등록 중…' : '베팅 등록'}
    </button>
  );
}

export function BetForm({
  matches,
  oddsByMatch,
  initialMatchId,
  initialPick,
  embedded,
  onSuccess,
}: {
  matches: MatchOption[];
  oddsByMatch: Record<string, OddsTriple>;
  /** 승부식에서 넘어올 때 미리 선택할 경기 id */
  initialMatchId?: string;
  /** 승부식 배당 버튼에서 넘어올 때 미리 선택할 승/무/패 */
  initialPick?: Outcome;
  /** 승부식 인라인 패널 안에 임베드할 때(제목 숨김 등 컴팩트) */
  embedded?: boolean;
  /** 등록 성공 시 콜백(인라인 패널 닫기 등) */
  onSuccess?: () => void;
}) {
  const [state, formAction] = useFormState(createBetAction, initial);
  const formRef = useRef<HTMLFormElement>(null);
  // 승부식에서 경기를 눌러 넘어온 경우 해당 경기를 미리 선택.
  const presetMatchId =
    initialMatchId && matches.some((m) => m.id === initialMatchId)
      ? initialMatchId
      : '';
  const [matchId, setMatchId] = useState(presetMatchId);
  const [pick, setPick] = useState<Outcome | ''>(initialPick ?? '');
  const [odds, setOdds] = useState(() => {
    const t = presetMatchId ? oddsByMatch[presetMatchId] : undefined;
    if (t && initialPick) {
      const v =
        initialPick === 'HOME' ? t.home : initialPick === 'DRAW' ? t.draw : t.away;
      return String(v);
    }
    return '';
  });
  const [oddsTouched, setOddsTouched] = useState(false);
  // onSuccess 는 매 렌더 새 함수일 수 있어 ref 로 최신값만 호출(effect 루프 방지).
  const onSuccessRef = useRef(onSuccess);
  onSuccessRef.current = onSuccess;

  const hasMatches = matches.length > 0;
  const triple = oddsByMatch[matchId];

  useEffect(() => {
    if (state.ok) {
      formRef.current?.reset();
      setMatchId('');
      setPick('');
      setOdds('');
      setOddsTouched(false);
      onSuccessRef.current?.();
    }
  }, [state]);

  const selected = useMemo(
    () => matches.find((m) => m.id === matchId),
    [matches, matchId],
  );

  function autofillOdds(nextMatchId: string, nextPick: Outcome | '') {
    if (oddsTouched) return;
    const t = oddsByMatch[nextMatchId];
    if (t && nextPick) {
      const v =
        nextPick === 'HOME' ? t.home : nextPick === 'DRAW' ? t.draw : t.away;
      setOdds(String(v));
    }
  }

  // 승/무/패 라벨 + 베트맨 배당 표시.
  const pickOptions: { value: Outcome; label: string; odd?: number }[] = [
    { value: 'HOME', label: selected ? `${selected.home} 승` : '승', odd: triple?.home },
    { value: 'DRAW', label: '무승부', odd: triple?.draw },
    { value: 'AWAY', label: selected ? `${selected.away} 승` : '패', odd: triple?.away },
  ];

  return (
    <form
      action={formAction}
      ref={formRef}
      className={embedded ? '' : 'card'}
      style={{ marginBottom: embedded ? 0 : 24 }}
    >
      {!embedded && <h2 style={{ marginTop: 0 }}>베팅 등록</h2>}

      {!hasMatches && (
        <p className="error" style={{ marginTop: 0 }}>
          ⚠ 경기 데이터를 불러오지 못했습니다. 경기명을 직접 입력해 등록할 수 있습니다.
        </p>
      )}

      <div className="form-grid">
        <div className="full">
          <label htmlFor="matchId">경기 (한국 경기 우선 · 날짜 표시)</label>
          {hasMatches ? (
            <select
              id="matchId"
              name="matchId"
              value={matchId}
              onChange={(e) => {
                setMatchId(e.target.value);
                setOddsTouched(false);
                autofillOdds(e.target.value, pick);
              }}
              required
            >
              <option value="">경기를 선택하세요</option>
              {matches.map((m) => (
                <option key={m.id} value={m.id}>
                  {matchOptionLabel(m)}
                </option>
              ))}
            </select>
          ) : (
            <input
              id="matchId"
              name="matchId"
              type="text"
              value={matchId}
              onChange={(e) => setMatchId(e.target.value)}
              placeholder="예: 대한민국 vs 브라질"
              required
            />
          )}
        </div>

        <div className="full">
          <label>선택 (승/무/패) — 괄호는 베트맨 배당</label>
          <div className="radio-row">
            {pickOptions.map((p) => (
              <label key={p.value} htmlFor={`pick-${p.value}`}>
                <input
                  id={`pick-${p.value}`}
                  type="radio"
                  name="pick"
                  value={p.value}
                  checked={pick === p.value}
                  onChange={() => {
                    setPick(p.value);
                    autofillOdds(matchId, p.value);
                  }}
                  required
                />
                <span>
                  {p.label}
                  {p.odd ? (
                    <>
                      <br />
                      <small style={{ color: 'var(--accent)' }}>
                        {p.odd.toFixed(2)}
                      </small>
                    </>
                  ) : null}
                </span>
              </label>
            ))}
          </div>
        </div>

        <div>
          <label htmlFor="oddsAtPlacement">
            배당{' '}
            {triple && !oddsTouched ? '(베트맨 자동, 수정 가능)' : '(수동 입력)'}
          </label>
          <input
            id="oddsAtPlacement"
            name="oddsAtPlacement"
            type="number"
            step="0.01"
            min="1"
            value={odds}
            onChange={(e) => {
              setOdds(e.target.value);
              setOddsTouched(true);
            }}
            placeholder="예: 2.10"
            required
          />
        </div>

        <div>
          <label htmlFor="stake">금액 (원)</label>
          <input
            id="stake"
            name="stake"
            type="number"
            step="1000"
            min="1000"
            placeholder="예: 30000"
            required
          />
        </div>

        <div>
          <label htmlFor="placedBy">건 사람</label>
          <input id="placedBy" name="placedBy" type="text" placeholder="예: 철수" required />
        </div>

        <div>
          <label htmlFor="note">메모 (선택)</label>
          <input id="note" name="note" type="text" placeholder="비고" />
        </div>

        <div className="full btn-row">
          <SubmitButton />
          {state.error && <span className="error">⚠ {state.error}</span>}
          {state.ok && <span className="success">✓ 등록됨</span>}
        </div>
      </div>
    </form>
  );
}
