'use client';

// 배팅내역의 배당(배당률) 수정 — 옛 단일 베팅/네이티브 전표 공통.
// "✏ 배당" 버튼을 누르면 폴별 배당 입력칸이 펼쳐지고, 저장 시 총배당·수령액이 재계산된다.

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useFormState, useFormStatus } from 'react-dom';
import { editOddsAction, type SlipActionState } from '@/lib/bets/slip-actions';

const initial: SlipActionState = { ok: false };

export interface EditLeg {
  label: string;
  odds: number;
}

function SaveButton() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className="primary" disabled={pending}>
      {pending ? '저장 중…' : '저장'}
    </button>
  );
}

export function EditSlipOdds({
  id,
  legacyBetId,
  legs,
}: {
  id: string;
  legacyBetId?: string;
  legs: EditLeg[];
}) {
  const [open, setOpen] = useState(false);
  const [vals, setVals] = useState<string[]>(() => legs.map((l) => String(l.odds)));
  const [state, formAction] = useFormState(editOddsAction, initial);
  const router = useRouter();

  useEffect(() => {
    if (state.ok) {
      setOpen(false);
      router.refresh();
    }
  }, [state.ok, router]);

  if (!open) {
    return (
      <button type="button" className="ghost" title="배당 수정" onClick={() => setOpen(true)}>
        ✏ 배당
      </button>
    );
  }

  return (
    <form action={formAction} className="edit-odds">
      {legacyBetId ? (
        <input type="hidden" name="legacyBetId" value={legacyBetId} />
      ) : (
        <>
          <input type="hidden" name="id" value={id} />
          <input
            type="hidden"
            name="odds"
            value={JSON.stringify(vals.map((v) => (v === '' ? null : Number(v))))}
          />
        </>
      )}

      <div style={{ display: 'grid', gap: 6 }}>
        {legs.map((l, i) => (
          <label key={i} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12.5 }}>
            <span className="muted" style={{ minWidth: 0, flex: 1 }}>
              {l.label}
            </span>
            <input
              // 레거시(단일)는 name=odds 로 직접 전송, 조합은 hidden JSON 으로 전송.
              name={legacyBetId ? 'odds' : undefined}
              type="number"
              step="0.01"
              min="1"
              value={vals[i]}
              onChange={(e) =>
                setVals((prev) => prev.map((v, j) => (j === i ? e.target.value : v)))
              }
              style={{ width: 80 }}
              required
            />
          </label>
        ))}
      </div>

      <div className="btn-row" style={{ marginTop: 8, gap: 6 }}>
        <SaveButton />
        <button type="button" className="ghost" onClick={() => setOpen(false)}>
          취소
        </button>
      </div>
      {state.error && <span className="error">⚠ {state.error}</span>}
    </form>
  );
}
