'use client';

import { useState } from 'react';
import { useFormState, useFormStatus } from 'react-dom';
import { settleBetAction, type ActionState } from '@/lib/bets/actions';

const initial: ActionState = { ok: false };

function SettleButtons() {
  const { pending } = useFormStatus();
  return (
    <div className="btn-row">
      <button type="submit" name="status" value="WON" className="primary" disabled={pending}>
        적중
      </button>
      <button type="submit" name="status" value="LOST" disabled={pending}>
        미적중
      </button>
      <button type="submit" name="status" value="VOID" disabled={pending}>
        무효
      </button>
    </div>
  );
}

/** PENDING 베팅 한 건을 정산한다. 적중 시 수령액(기본값=금액×배당) 자동 제안. */
export function SettleBet({
  id,
  stake,
  oddsAtPlacement,
}: {
  id: string;
  stake: number;
  oddsAtPlacement: number;
}) {
  const [state, formAction] = useFormState(settleBetAction, initial);
  const [payout, setPayout] = useState(
    String(Math.round(stake * oddsAtPlacement)),
  );

  return (
    <form action={formAction} className="btn-row" style={{ flexWrap: 'wrap' }}>
      <input type="hidden" name="id" value={id} />
      <input
        name="payout"
        type="number"
        step="1000"
        min="0"
        value={payout}
        onChange={(e) => setPayout(e.target.value)}
        title="적중 시 수령액"
        style={{ width: 110 }}
      />
      <SettleButtons />
      {state.error && <span className="error">⚠ {state.error}</span>}
    </form>
  );
}
