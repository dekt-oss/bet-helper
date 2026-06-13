'use client';

import { useState } from 'react';
import { useFormState, useFormStatus } from 'react-dom';
import {
  upsertOpinionAction,
  type OpinionState,
} from '@/lib/opinions/actions';
import type { Opinion, Outcome } from '@/lib/types';

const initial: OpinionState = { ok: false };

function SaveBtn() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className="opinion-save" disabled={pending}>
      {pending ? '…' : '저장'}
    </button>
  );
}

/** 한 멤버의 경기 의견(승/무/패 + 코멘트) 입력 행. */
export function OpinionForm({
  matchId,
  member,
  current,
  homeLabel,
  awayLabel,
}: {
  matchId: string;
  member: string;
  current?: Opinion;
  homeLabel: string;
  awayLabel: string;
}) {
  const [state, action] = useFormState(upsertOpinionAction, initial);
  const [pick, setPick] = useState<Outcome | ''>(current?.pick ?? '');
  const [comment, setComment] = useState(current?.comment ?? '');

  const picks: { key: Outcome; label: string }[] = [
    { key: 'HOME', label: homeLabel },
    { key: 'DRAW', label: '무' },
    { key: 'AWAY', label: awayLabel },
  ];

  return (
    <form action={action} className="opinion-row">
      <input type="hidden" name="matchId" value={matchId} />
      <input type="hidden" name="member" value={member} />
      <input type="hidden" name="pick" value={pick} />
      <span className="opinion-member">{member}</span>
      <div className="opinion-picks">
        {picks.map((p) => (
          <button
            key={p.key}
            type="button"
            className={`opinion-pick ${pick === p.key ? 'active' : ''}`}
            onClick={() => setPick(pick === p.key ? '' : p.key)}
          >
            {p.label}
          </button>
        ))}
      </div>
      <input
        name="comment"
        value={comment}
        onChange={(e) => setComment(e.target.value)}
        placeholder="코멘트(선택)"
        className="opinion-comment"
      />
      <SaveBtn />
      {state.ok && <span className="success">✓</span>}
      {state.error && <span className="error">⚠</span>}
    </form>
  );
}
