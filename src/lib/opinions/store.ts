// 경기별 멤버 의견(합의용) 저장소. odds store 와 동일한 이중 백엔드 패턴.
// Supabase 의 opinions 테이블, 없으면 로컬 JSON 파일.

import { promises as fs } from 'fs';
import path from 'path';
import { cache } from 'react';
import type { Opinion } from '@/lib/types';
import { isSupabaseConfigured, getSupabaseServer } from '@/lib/db/supabase';

export interface OpinionInput {
  matchId: string;
  member: string;
  pick: Opinion['pick'];
  comment?: string;
}

export const listOpinions = cache(async (): Promise<Opinion[]> => {
  if (isSupabaseConfigured()) {
    try {
      return await sbList();
    } catch (err) {
      console.error('[opinions] Supabase 조회 실패 → 파일 폴백:', err);
      return fileList();
    }
  }
  return fileList();
});

export async function upsertOpinion(input: OpinionInput): Promise<Opinion> {
  return isSupabaseConfigured() ? sbUpsert(input) : fileUpsert(input);
}

export async function deleteOpinion(
  matchId: string,
  member: string,
): Promise<boolean> {
  return isSupabaseConfigured()
    ? sbDelete(matchId, member)
    : fileDelete(matchId, member);
}

/** matchId → (member → Opinion) 로 묶어 반환(화면 표시용). */
export function groupByMatch(list: Opinion[]): Record<string, Opinion[]> {
  const m: Record<string, Opinion[]> = {};
  for (const o of list) (m[o.matchId] ??= []).push(o);
  return m;
}

// ── Supabase ──────────────────────────────────────────────
interface Row {
  match_id: string;
  member: string;
  pick: string;
  comment: string | null;
  updated_at: string;
}
function rowToOpinion(r: Row): Opinion {
  return {
    matchId: r.match_id,
    member: r.member,
    pick: (r.pick as Opinion['pick']) ?? '',
    comment: r.comment ?? undefined,
    updatedAt: r.updated_at,
  };
}

async function sbList(): Promise<Opinion[]> {
  const sb = getSupabaseServer()!;
  const { data, error } = await sb
    .from('opinions')
    .select('*')
    .order('updated_at', { ascending: false });
  if (error) throw new Error(`supabase listOpinions: ${error.message}`);
  return (data as Row[]).map(rowToOpinion);
}

async function sbUpsert(input: OpinionInput): Promise<Opinion> {
  const sb = getSupabaseServer()!;
  const { data, error } = await sb
    .from('opinions')
    .upsert(
      {
        match_id: input.matchId,
        member: input.member,
        pick: input.pick,
        comment: input.comment ?? null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'match_id,member' },
    )
    .select()
    .single();
  if (error) throw new Error(`supabase upsertOpinion: ${error.message}`);
  return rowToOpinion(data as Row);
}

async function sbDelete(matchId: string, member: string): Promise<boolean> {
  const sb = getSupabaseServer()!;
  const { error } = await sb
    .from('opinions')
    .delete()
    .eq('match_id', matchId)
    .eq('member', member);
  if (error) throw new Error(`supabase deleteOpinion: ${error.message}`);
  return true;
}

// ── 로컬 JSON 폴백 ────────────────────────────────────────
const DATA_DIR = path.join(process.cwd(), 'data');
const FILE = path.join(DATA_DIR, 'opinions.json');

async function readAll(): Promise<Opinion[]> {
  try {
    return JSON.parse(await fs.readFile(FILE, 'utf-8')) as Opinion[];
  } catch (err: unknown) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return [];
    throw err;
  }
}

async function fileList(): Promise<Opinion[]> {
  return readAll();
}

async function fileUpsert(input: OpinionInput): Promise<Opinion> {
  const all = await readAll();
  const o: Opinion = {
    matchId: input.matchId,
    member: input.member,
    pick: input.pick,
    comment: input.comment,
    updatedAt: new Date().toISOString(),
  };
  const idx = all.findIndex(
    (x) => x.matchId === input.matchId && x.member === input.member,
  );
  if (idx === -1) all.push(o);
  else all[idx] = o;
  await fs.mkdir(DATA_DIR, { recursive: true });
  await fs.writeFile(FILE, JSON.stringify(all, null, 2), 'utf-8');
  return o;
}

async function fileDelete(matchId: string, member: string): Promise<boolean> {
  const all = await readAll();
  const idx = all.findIndex(
    (x) => x.matchId === matchId && x.member === member,
  );
  if (idx === -1) return false;
  all.splice(idx, 1);
  await fs.mkdir(DATA_DIR, { recursive: true });
  await fs.writeFile(FILE, JSON.stringify(all, null, 2), 'utf-8');
  return true;
}
