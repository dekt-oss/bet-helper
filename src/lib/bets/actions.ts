'use server';

// 베팅 등록/정산 Server Actions.
// 폼에서 직접 호출하며, 성공 시 revalidatePath 로 /bets 목록을 즉시 갱신한다.
// (기존 /api/bets route 는 curl/외부용으로 그대로 유지)

import { revalidatePath } from 'next/cache';
import { addBet, updateBet } from './store';
import type { Outcome } from '@/lib/types';

export interface ActionState {
  ok: boolean;
  error?: string;
}

const OUTCOMES: Outcome[] = ['HOME', 'DRAW', 'AWAY'];

function num(v: FormDataEntryValue | null): number {
  return typeof v === 'string' ? parseFloat(v) : NaN;
}

export async function createBetAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const matchId = String(formData.get('matchId') ?? '').trim();
  const placedBy = String(formData.get('placedBy') ?? '').trim();
  const pick = String(formData.get('pick') ?? '') as Outcome;
  const oddsAtPlacement = num(formData.get('oddsAtPlacement'));
  const stake = num(formData.get('stake'));
  const note = String(formData.get('note') ?? '').trim() || undefined;

  if (!matchId) return { ok: false, error: '경기를 선택하세요.' };
  if (!placedBy) return { ok: false, error: '건 사람을 입력하세요.' };
  if (!OUTCOMES.includes(pick))
    return { ok: false, error: '승/무/패를 선택하세요.' };
  if (!Number.isFinite(oddsAtPlacement) || oddsAtPlacement <= 0)
    return { ok: false, error: '배당은 0보다 큰 숫자여야 합니다.' };
  if (!Number.isFinite(stake) || stake <= 0)
    return { ok: false, error: '금액은 0보다 큰 숫자여야 합니다.' };

  await addBet({
    matchId,
    placedBy,
    pick,
    oddsAtPlacement,
    stake: Math.round(stake),
    note,
  });
  revalidatePath('/bets');
  revalidatePath('/');
  return { ok: true };
}

export async function settleBetAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const id = String(formData.get('id') ?? '').trim();
  const status = String(formData.get('status') ?? '') as
    | 'WON'
    | 'LOST'
    | 'VOID';

  if (!id) return { ok: false, error: '베팅 ID 가 없습니다.' };
  if (!['WON', 'LOST', 'VOID'].includes(status))
    return { ok: false, error: '정산 상태가 올바르지 않습니다.' };

  // 적중(WON)일 때만 수령액을 기록한다. 미적중/무효는 0/미설정.
  let payout: number | undefined;
  if (status === 'WON') {
    payout = Math.round(num(formData.get('payout')));
    if (!Number.isFinite(payout) || payout < 0)
      return { ok: false, error: '수령액은 0 이상의 숫자여야 합니다.' };
  } else if (status === 'VOID') {
    // 무효: 원금 반환을 수령액으로 기록(있으면)
    const p = num(formData.get('payout'));
    payout = Number.isFinite(p) ? Math.round(p) : undefined;
  }

  const updated = await updateBet(id, { status, payout });
  if (!updated) return { ok: false, error: '해당 베팅을 찾을 수 없습니다.' };

  revalidatePath('/bets');
  revalidatePath('/');
  return { ok: true };
}
