'use server';

// 전표(복수게임) 등록/삭제 Server Actions.
// 슬립 패널(장바구니)에서 모은 폴 목록을 JSON 으로 받아 검증 후 저장한다.

import { revalidatePath } from 'next/cache';
import { addSlip, deleteSlip, type NewLeg } from './slip-store';
import type { LegPick, MarketType } from '@/lib/types';

export interface SlipActionState {
  ok: boolean;
  error?: string;
}

const ALLOWED: Record<MarketType, LegPick[]> = {
  '1X2': ['HOME', 'DRAW', 'AWAY'],
  HANDICAP: ['HOME', 'DRAW', 'AWAY'],
  OU: ['OVER', 'UNDER'],
};

interface RawLeg {
  matchId?: unknown;
  market?: unknown;
  pick?: unknown;
  oddsAtPlacement?: unknown;
  line?: unknown;
}

export async function createSlipAction(
  _prev: SlipActionState,
  formData: FormData,
): Promise<SlipActionState> {
  const stake = Math.round(Number(formData.get('stake')));
  if (!Number.isFinite(stake) || stake <= 0)
    return { ok: false, error: '금액은 0보다 큰 숫자여야 합니다.' };

  let parsed: RawLeg[];
  try {
    parsed = JSON.parse(String(formData.get('legs') ?? '[]')) as RawLeg[];
  } catch {
    return { ok: false, error: '폴 데이터가 올바르지 않습니다.' };
  }
  if (!Array.isArray(parsed) || parsed.length === 0)
    return { ok: false, error: '최소 1개 경기를 담아주세요.' };

  const legs: NewLeg[] = [];
  const seen = new Set<string>();
  for (const l of parsed) {
    const matchId = String(l.matchId ?? '').trim();
    const market = l.market as MarketType;
    const pick = l.pick as LegPick;
    const odds = Number(l.oddsAtPlacement);
    const line = l.line == null ? undefined : Number(l.line);
    if (!matchId) return { ok: false, error: '경기가 비어있는 폴이 있습니다.' };
    if (!ALLOWED[market] || !ALLOWED[market].includes(pick))
      return { ok: false, error: '마켓/선택지가 올바르지 않습니다.' };
    if (!Number.isFinite(odds) || odds <= 0)
      return { ok: false, error: '배당이 올바르지 않은 폴이 있습니다.' };
    if (seen.has(matchId))
      return { ok: false, error: '같은 경기를 중복해서 담을 수 없습니다.' };
    seen.add(matchId);
    legs.push({
      matchId,
      market,
      pick,
      oddsAtPlacement: odds,
      line: line != null && Number.isFinite(line) ? line : undefined,
    });
  }

  const note = String(formData.get('note') ?? '').trim() || undefined;

  try {
    await addSlip({ legs, stake, note });
  } catch (err) {
    console.error('[action] addSlip 실패:', err);
    return { ok: false, error: '저장 실패: Supabase 테이블(slips.sql) 설정을 확인하세요.' };
  }
  revalidatePath('/bets');
  revalidatePath('/');
  return { ok: true };
}

export async function deleteSlipAction(
  _prev: SlipActionState,
  formData: FormData,
): Promise<SlipActionState> {
  const id = String(formData.get('id') ?? '').trim();
  if (!id) return { ok: false, error: '전표 ID 가 없습니다.' };
  try {
    const deleted = await deleteSlip(id);
    if (!deleted) return { ok: false, error: '해당 전표를 찾을 수 없습니다.' };
  } catch (err) {
    console.error('[action] deleteSlip 실패:', err);
    return { ok: false, error: '삭제 실패: Supabase 설정을 확인하세요.' };
  }
  revalidatePath('/bets');
  revalidatePath('/');
  return { ok: true };
}
