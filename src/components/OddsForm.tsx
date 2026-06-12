'use client';

import { useState } from 'react';
import { useFormState, useFormStatus } from 'react-dom';
import { saveOddsAction, type OddsActionState } from '@/lib/odds/actions';
import { type MatchOption, matchOptionLabel } from '@/lib/teams/options';

const initial: OddsActionState = { ok: false };

function SaveButton() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className="primary" disabled={pending}>
      {pending ? '저장 중…' : '배당 저장'}
    </button>
  );
}

/** 베트맨 승부식 배당(승/무/패) 입력 폼. 저장하면 베팅 폼에도 자동 반영된다. */
export function OddsForm({ matches }: { matches: MatchOption[] }) {
  const [state, formAction] = useFormState(saveOddsAction, initial);
  const [matchId, setMatchId] = useState('');

  return (
    <form action={formAction} className="card" style={{ marginBottom: 24 }}>
      <h2 style={{ marginTop: 0 }}>베트맨 배당 입력</h2>
      <p className="muted" style={{ fontSize: 13, marginTop: 0 }}>
        베트맨 승부식의 승/무/패 배당을 입력하면 승부식 탭과 베팅 등록에 반영됩니다.
      </p>
      <div className="form-grid">
        <div className="full">
          <label htmlFor="odds-match">경기</label>
          <select
            id="odds-match"
            name="matchId"
            value={matchId}
            onChange={(e) => setMatchId(e.target.value)}
            required
          >
            <option value="">경기를 선택하세요</option>
            {matches.map((m) => (
              <option key={m.id} value={m.id}>
                {matchOptionLabel(m)}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="odds-home">승 (홈)</label>
          <input id="odds-home" name="home" type="number" step="0.01" min="1" placeholder="2.10" required />
        </div>
        <div>
          <label htmlFor="odds-draw">무</label>
          <input id="odds-draw" name="draw" type="number" step="0.01" min="1" placeholder="3.20" required />
        </div>
        <div>
          <label htmlFor="odds-away">패 (원정)</label>
          <input id="odds-away" name="away" type="number" step="0.01" min="1" placeholder="2.80" required />
        </div>
        <div className="full btn-row">
          <SaveButton />
          {state.error && <span className="error">⚠ {state.error}</span>}
          {state.ok && <span className="success">✓ 저장됨</span>}
        </div>
      </div>
    </form>
  );
}
