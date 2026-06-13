-- 경기별 멤버 의견(합의) 테이블 (추가 마이그레이션)
-- Supabase > SQL Editor 에 붙여넣어 실행하세요. (앱이 연결된 프로젝트에서!)

create table if not exists public.opinions (
  match_id   text not null,
  member     text not null,
  pick       text not null default '',      -- 'HOME' | 'DRAW' | 'AWAY' | ''
  comment    text,
  updated_at timestamptz not null default now(),
  primary key (match_id, member)
);

alter table public.opinions enable row level security;

drop policy if exists "opinions read"  on public.opinions;
drop policy if exists "opinions write" on public.opinions;
create policy "opinions read"  on public.opinions for select using (true);
create policy "opinions write" on public.opinions for all using (true) with check (true);

-- Realtime: 의견 입력 시 모든 화면 즉시 반영
alter publication supabase_realtime add table public.opinions;

-- 스키마 캐시 새로고침(테이블 생성 직후 PostgREST 인식)
notify pgrst, 'reload schema';
