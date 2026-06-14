'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useFormState, useFormStatus } from 'react-dom';
import { deleteBetAction, type ActionState } from '@/lib/bets/actions';

const initial: ActionState = { ok: false };

function DeleteButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      className="danger"
      disabled={pending}
      title="이 베팅 삭제"
      // 물리 삭제(되돌리기 없음) — 한 번 확인.
      onClick={(e) => {
        if (!confirm('이 베팅을 삭제할까요? 되돌릴 수 없습니다.')) {
          e.preventDefault();
        }
      }}
    >
      {pending ? '삭제 중…' : '🗑'}
    </button>
  );
}

/** 베팅 한 건 삭제 버튼. */
export function DeleteBet({ id }: { id: string }) {
  const [state, formAction] = useFormState(deleteBetAction, initial);
  const router = useRouter();
  useEffect(() => {
    if (state.ok) router.refresh();
  }, [state.ok, router]);
  return (
    <form action={formAction} className="inline">
      <input type="hidden" name="id" value={id} />
      <DeleteButton />
      {state.error && <span className="error">⚠ {state.error}</span>}
    </form>
  );
}
