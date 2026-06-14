'use server';

// 경기별 멤버 의견 입력/수정 Server Action.

import { revalidatePath } from 'next/cache';
import { upsertOpinion, deleteOpinion } from './store';
import type { Outcome } from '@/lib/types';

export interface OpinionState {
  ok: boolean;
  error?: string;
}

const OUTCOMES: Outcome[] = ['HOME', 'DRAW', 'AWAY'];

export async function upsertOpinionAction(
  _prev: OpinionState,
  formData: FormData,
): Promise<OpinionState> {
  const matchId = String(formData.get('matchId') ?? '').trim();
  const member = String(formData.get('member') ?? '').trim();
  const pick = String(formData.get('pick') ?? '') as Outcome | '';
  const comment = String(formData.get('comment') ?? '').trim() || undefined;

  if (!matchId || !member) return { ok: false, error: '경기/멤버 정보가 없습니다.' };
  if (pick && !OUTCOMES.includes(pick))
    return { ok: false, error: '승/무/패 선택이 올바르지 않습니다.' };

  try {
    await upsertOpinion({ matchId, member, pick, comment });
  } catch (err) {
    console.error('[action] upsertOpinion 실패:', err);
    return {
      ok: false,
      error: '저장 실패: Supabase opinions 테이블을 확인하세요 (opinions.sql 실행).',
    };
  }
  revalidatePath('/fixtures');
  return { ok: true };
}

/** useFormState 용 삭제 액션 — 진행/완료 상태를 돌려줘 버튼에 '삭제중…' 표시 가능. */
export async function deleteOpinionFormAction(
  _prev: OpinionState,
  formData: FormData,
): Promise<OpinionState> {
  const matchId = String(formData.get('matchId') ?? '').trim();
  const member = String(formData.get('member') ?? '').trim();
  if (!matchId || !member) return { ok: false, error: '경기/멤버 정보가 없습니다.' };
  try {
    await deleteOpinion(matchId, member);
  } catch (err) {
    console.error('[action] deleteOpinion 실패:', err);
    return { ok: false, error: '삭제 실패: Supabase 설정을 확인하세요.' };
  }
  revalidatePath('/fixtures');
  return { ok: true };
}
