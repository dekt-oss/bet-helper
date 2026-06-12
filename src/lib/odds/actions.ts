'use server';

// 베트맨 승부식 배당 입력 Server Action.

import { revalidatePath } from 'next/cache';
import { upsertOdds } from './store';

export interface OddsActionState {
  ok: boolean;
  error?: string;
}

function num(v: FormDataEntryValue | null): number {
  return typeof v === 'string' ? parseFloat(v) : NaN;
}

export async function saveOddsAction(
  _prev: OddsActionState,
  formData: FormData,
): Promise<OddsActionState> {
  const matchId = String(formData.get('matchId') ?? '').trim();
  const home = num(formData.get('home'));
  const draw = num(formData.get('draw'));
  const away = num(formData.get('away'));

  if (!matchId) return { ok: false, error: '경기를 선택하세요.' };
  for (const [label, v] of [
    ['승', home],
    ['무', draw],
    ['패', away],
  ] as const) {
    if (!Number.isFinite(v) || v <= 1 || v > 100)
      return { ok: false, error: `${label} 배당은 1보다 큰 숫자여야 합니다.` };
  }

  try {
    await upsertOdds({ matchId, home, draw, away });
  } catch (err) {
    console.error('[action] upsertOdds 실패:', err);
    return {
      ok: false,
      error: '저장 실패: Supabase odds 테이블이 있는지 확인하세요 (odds.sql 실행).',
    };
  }
  revalidatePath('/odds');
  revalidatePath('/bets');
  return { ok: true };
}
