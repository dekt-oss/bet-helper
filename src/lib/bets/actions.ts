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

  try {
    await addBet({
      matchId,
      placedBy,
      pick,
      oddsAtPlacement,
      stake: Math.round(stake),
      note,
    });
  } catch (err) {
    console.error('[action] addBet 실패:', err);
    return {
      ok: false,
      error:
        '저장 실패: Supabase 테이블/키 설정을 확인하세요 (schema.sql 실행 여부).',
    };
  }
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

  // 수령액은 상태별로 서버가 권위있게 결정한다(클라이언트 입력은 WON 에만 사용).
  //  - WON  : 입력한 수령액 (기본 제안값 = 금액×배당)
  //  - VOID : 원금 반환 (= 금액)
  //  - LOST : 0원
  const stake = Math.round(num(formData.get('stake')));
  let payout: number;
  if (status === 'WON') {
    payout = Math.round(num(formData.get('payout')));
    if (!Number.isFinite(payout) || payout < 0)
      return { ok: false, error: '수령액은 0 이상의 숫자여야 합니다.' };
  } else if (status === 'VOID') {
    payout = Number.isFinite(stake) && stake > 0 ? stake : 0;
  } else {
    payout = 0; // LOST
  }

  try {
    const updated = await updateBet(id, { status, payout });
    if (!updated) return { ok: false, error: '해당 베팅을 찾을 수 없습니다.' };
  } catch (err) {
    console.error('[action] updateBet 실패:', err);
    return { ok: false, error: '정산 저장 실패: Supabase 설정을 확인하세요.' };
  }

  revalidatePath('/bets');
  revalidatePath('/');
  return { ok: true };
}
