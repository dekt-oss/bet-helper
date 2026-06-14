'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useFormState, useFormStatus } from 'react-dom';
import {
  upsertOpinionAction,
  deleteOpinionFormAction,
  type OpinionState,
} from '@/lib/opinions/actions';
import type { Opinion, Outcome } from '@/lib/types';

const initial: OpinionState = { ok: false };

// 의견 삭제 버튼(진행중 표시 + 완료 시 화면 자동 갱신).
function DelBtn() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className="opinion-del" disabled={pending} title="의견 삭제">
      {pending ? '삭제중…' : '🗑'}
    </button>
  );
}

function OpinionDelete({ matchId, member }: { matchId: string; member: string }) {
  const [state, action] = useFormState(deleteOpinionFormAction, initial);
  const router = useRouter();
  useEffect(() => {
    if (state.ok) router.refresh();
  }, [state.ok, router]);
  return (
    <form action={action} className="inline">
      <input type="hidden" name="matchId" value={matchId} />
      <input type="hidden" name="member" value={member} />
      <DelBtn />
      {state.error && <span className="error">⚠</span>}
    </form>
  );
}

function SaveBtn() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className="opinion-save" disabled={pending}>
      {pending ? '저장중…' : '저장'}
    </button>
  );
}

// 저장 진행/완료 상태 텍스트(useFormStatus 는 form 내부에서만 동작).
function SaveStatus({ ok, error }: { ok?: boolean; error?: string }) {
  const { pending } = useFormStatus();
  if (pending) return <span className="muted opinion-status">저장중입니다…</span>;
  if (ok) return <span className="success opinion-status">✓ 저장됨</span>;
  if (error) return <span className="error opinion-status">⚠ 실패</span>;
  return null;
}

/** 한 멤버의 경기 의견(승/무/패 + 코멘트) 입력 행. advisory=참고인(합의 무영향). */
export function OpinionForm({
  matchId,
  member,
  current,
  homeLabel,
  awayLabel,
  advisory,
}: {
  matchId: string;
  member: string;
  current?: Opinion;
  homeLabel: string;
  awayLabel: string;
  advisory?: boolean;
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
    <div className="opinion-row">
      <span className="opinion-member">
        {member}
        {advisory && <span className="muted"> (참고)</span>}
      </span>
      <form action={action} className="opinion-edit">
        <input type="hidden" name="matchId" value={matchId} />
        <input type="hidden" name="member" value={member} />
        <input type="hidden" name="pick" value={pick} />
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
        <SaveStatus ok={state.ok} error={state.error} />
      </form>
      {(current?.pick || current?.comment) && (
        <OpinionDelete matchId={matchId} member={member} />
      )}
    </div>
  );
}
