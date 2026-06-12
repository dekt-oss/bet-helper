'use server';

// 베트맨 승부식 배당 입력 Server Action.

import { revalidatePath } from 'next/cache';
import { upsertOdds } from './store';
import { parseBetmanGameSlip, matchOddsToMatches } from '@/lib/data-sources/betman';
import { getMatches } from '@/lib/data-sources';

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

export interface ImportState {
  ok: boolean;
  error?: string;
  count?: number;
}

/**
 * 베트맨 gameSlip.do 응답(JSON)을 붙여넣어 월드컵 승무패 배당을 일괄 저장한다.
 * (베트맨 사이트가 봇/네트워크 차단을 하므로, 브라우저에서 복사한 응답을 그대로 가져오는 방식)
 */
export async function importBetmanAction(
  _prev: ImportState,
  formData: FormData,
): Promise<ImportState> {
  const raw = String(formData.get('json') ?? '').trim();
  if (!raw) return { ok: false, error: '베트맨 응답(JSON)을 붙여넣으세요.' };

  const parsed = parseBetmanGameSlip(raw);
  if (parsed.length === 0)
    return {
      ok: false,
      error: '월드컵 승무패 배당을 찾지 못했습니다. gameSlip.do 응답이 맞는지 확인하세요.',
    };

  try {
    // 우리 경기와 팀명으로 매칭해 matchId 를 보정(매칭 실패해도 그대로 저장)
    const { matches } = await getMatches();
    const matched = matchOddsToMatches(parsed, matches);
    for (const o of matched) {
      await upsertOdds({ matchId: o.matchId, home: o.home, draw: o.draw, away: o.away });
    }
    revalidatePath('/odds');
    revalidatePath('/bets');
    revalidatePath('/fixtures');
    revalidatePath('/');
    return { ok: true, count: matched.length };
  } catch (err) {
    console.error('[action] importBetman 실패:', err);
    return { ok: false, error: '저장 실패: Supabase odds 테이블을 확인하세요 (odds.sql 실행).' };
  }
}
