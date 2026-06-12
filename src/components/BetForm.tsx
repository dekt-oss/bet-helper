'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useFormState, useFormStatus } from 'react-dom';
import { createBetAction, type ActionState } from '@/lib/bets/actions';
import type { Outcome } from '@/lib/types';

export interface MatchOption {
  id: string;
  home: string;
  away: string;
}

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
}: {
  matches: MatchOption[];
  oddsByMatch: Record<string, OddsTriple>;
}) {
  const [state, formAction] = useFormState(createBetAction, initial);
  const formRef = useRef<HTMLFormElement>(null);
  const [matchId, setMatchId] = useState('');
  const [pick, setPick] = useState<Outcome | ''>('');
  const [odds, setOdds] = useState('');
  // 사용자가 배당을 직접 수정했으면 자동채움이 덮어쓰지 않는다.
  const [oddsTouched, setOddsTouched] = useState(false);

  const hasMatches = matches.length > 0;

  // 등록 성공 시 폼을 초기화해 중복 베팅을 막는다.
  useEffect(() => {
    if (state.ok) {
      formRef.current?.reset();
      setMatchId('');
      setPick('');
      setOdds('');
      setOddsTouched(false);
    }
  }, [state]);

  const selected = useMemo(
    () => matches.find((m) => m.id === matchId),
    [matches, matchId],
  );

  // 경기/선택이 바뀌면 배당이 있을 때만 자동으로 채운다(사용자가 수정했으면 보류).
  function autofillOdds(nextMatchId: string, nextPick: Outcome | '') {
    if (oddsTouched) return;
    const triple = oddsByMatch[nextMatchId];
    if (triple && nextPick) {
      const v =
        nextPick === 'HOME'
          ? triple.home
          : nextPick === 'DRAW'
            ? triple.draw
            : triple.away;
      setOdds(String(v));
    }
  }

  const pickLabels: { value: Outcome; label: string }[] = [
    { value: 'HOME', label: selected ? `${selected.home} 승` : '승' },
    { value: 'DRAW', label: '무' },
    { value: 'AWAY', label: selected ? `${selected.away} 승` : '패' },
  ];

  return (
    <form action={formAction} ref={formRef} className="card" style={{ marginBottom: 24 }}>
      <h2 style={{ marginTop: 0 }}>베팅 등록</h2>

      {!hasMatches && (
        <p className="error" style={{ marginTop: 0 }}>
          ⚠ 경기 데이터를 불러오지 못했습니다. 경기명을 직접 입력해 등록할 수 있습니다.
        </p>
      )}

      <div className="form-grid">
        <div className="full">
          <label htmlFor="matchId">경기</label>
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
                  {m.home} vs {m.away}
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
          <label>선택 (승/무/패)</label>
          <div className="radio-row">
            {pickLabels.map((p) => (
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
                <span>{p.label}</span>
              </label>
            ))}
          </div>
        </div>

        <div>
          <label htmlFor="oddsAtPlacement">
            배당{' '}
            {oddsByMatch[matchId] && !oddsTouched
              ? '(자동 채움, 수정 가능)'
              : '(수동 입력)'}
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
            placeholder="예: 10000"
            required
          />
        </div>

        <div>
          <label htmlFor="placedBy">건 사람</label>
          <input
            id="placedBy"
            name="placedBy"
            type="text"
            placeholder="예: 철수"
            required
          />
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
