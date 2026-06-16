'use client';

// 전표(또는 옛 단일 베팅) 삭제 버튼.
// 옛 단일 베팅이면 deleteBetAction, 네이티브 전표면 deleteSlipAction 으로 라우팅한다.

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useFormState, useFormStatus } from 'react-dom';
import { deleteBetAction, type ActionState } from '@/lib/bets/actions';
import { deleteSlipAction, type SlipActionState } from '@/lib/bets/slip-actions';

const initial: ActionState | SlipActionState = { ok: false };

function DeleteButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      className="danger"
      disabled={pending}
      title="삭제"
      onClick={(e) => {
        if (!confirm('이 전표를 삭제할까요? 되돌릴 수 없습니다.')) {
          e.preventDefault();
        }
      }}
    >
      {pending ? '삭제 중…' : '🗑'}
    </button>
  );
}

export function DeleteSlip({ id, legacyBetId }: { id: string; legacyBetId?: string }) {
  const action = legacyBetId ? deleteBetAction : deleteSlipAction;
  const [state, formAction] = useFormState(
    action as (p: ActionState | SlipActionState, f: FormData) => Promise<ActionState | SlipActionState>,
    initial,
  );
  const router = useRouter();
  useEffect(() => {
    if (state.ok) router.refresh();
  }, [state.ok, router]);
  return (
    <form action={formAction} className="inline">
      <input type="hidden" name="id" value={legacyBetId ?? id} />
      <DeleteButton />
      {state.error && <span className="error">⚠ {state.error}</span>}
    </form>
  );
}
