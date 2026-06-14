// 수집기 하트비트: 베트맨 배당이 "마지막으로 성공 수집된 시각"을 저장/조회한다.
// 배너의 '마지막 갱신'은 표시 경기 필터(getOdds)와 무관하게 이 값으로 정확히 표시한다.
// (이전엔 화면에 보이는 베트맨 배당의 updatedAt 최대값을 썼는데, 끝난 경기가 베트맨 회차에서
//  빠지면 실제 수집 시각과 어긋나 오해를 줬다.)

import { promises as fs } from 'fs';
import path from 'path';
import { isSupabaseConfigured, getSupabaseServer } from '@/lib/db/supabase';

const KEY = 'betman';
const DATA_DIR = path.join(process.cwd(), 'data');
const FILE = path.join(DATA_DIR, 'collector_status.json');

/** 베트맨 수집 성공 시각 기록(now). Supabase 우선, 없으면 JSON 파일 폴백. */
export async function recordBetmanHeartbeat(): Promise<void> {
  const now = new Date().toISOString();
  if (isSupabaseConfigured()) {
    try {
      const sb = getSupabaseServer()!;
      const { error } = await sb
        .from('collector_status')
        .upsert({ key: KEY, updated_at: now }, { onConflict: 'key' });
      if (error) throw new Error(error.message);
      return;
    } catch (err) {
      console.error('[status] supabase heartbeat 실패 → 파일 폴백:', err);
    }
  }
  try {
    await fs.mkdir(DATA_DIR, { recursive: true });
    await fs.writeFile(FILE, JSON.stringify({ [KEY]: now }, null, 2), 'utf-8');
  } catch (err) {
    console.error('[status] 파일 heartbeat 실패:', err);
  }
}

/** 베트맨 마지막 수집 시각(ISO) 조회. 없으면 null. */
export async function getBetmanHeartbeat(): Promise<string | null> {
  if (isSupabaseConfigured()) {
    try {
      const sb = getSupabaseServer()!;
      const { data, error } = await sb
        .from('collector_status')
        .select('updated_at')
        .eq('key', KEY)
        .maybeSingle();
      if (error) throw new Error(error.message);
      return (data?.updated_at as string | undefined) ?? null;
    } catch (err) {
      console.error('[status] supabase 조회 실패 → 파일 폴백:', err);
    }
  }
  try {
    const raw = await fs.readFile(FILE, 'utf-8');
    return (JSON.parse(raw)?.[KEY] as string) ?? null;
  } catch {
    return null;
  }
}
