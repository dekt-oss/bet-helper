'use client';

import { useState } from 'react';
import { useFormState, useFormStatus } from 'react-dom';
import { settleBetAction, type ActionState } from '@/lib/bets/actions';

const initial: ActionState = { ok: false };

function SettleButtons() {
  const { pending } = useFormStatus();
  return (
    <div className="btn-row">
      <button
        type="submit"
        name="status"
        value="WON"
        className="primary"
        disabled={pending}
      >
        ✓ 적중
      </button>
      <button
        type="submit"
        name="status"
        value="LOST"
        className="danger"
        disabled={pending}
      >
        ✗ 미적중
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
      {/* 무효 시 원금 반환 계산용 — 서버가 상태별로 수령액을 결정한다. */}
      <input type="hidden" name="stake" value={stake} />
      <input
        name="payout"
        type="number"
        step="1000"
        min="0"
        value={payout}
        onChange={(e) => setPayout(e.target.value)}
        aria-label="적중 시 수령액 (원)"
        title="적중 시 수령액"
        className="payout-input"
      />
      <SettleButtons />
      {state.error && <span className="error">⚠ {state.error}</span>}
    </form>
  );
}
