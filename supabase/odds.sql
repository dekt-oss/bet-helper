-- 베트맨 승부식 배당 테이블 (추가 마이그레이션)
-- Supabase > SQL Editor 에 붙여넣어 실행하세요. (기존 schema.sql 실행 이후)

create table if not exists public.odds (
  match_id   text primary key,
  home       numeric(6, 2) not null,
  draw       numeric(6, 2) not null,
  away       numeric(6, 2) not null,
  source     text not null default 'betman',
  updated_at timestamptz not null default now()
);

alter table public.odds enable row level security;

drop policy if exists "odds read"   on public.odds;
drop policy if exists "odds insert" on public.odds;
drop policy if exists "odds update" on public.odds;
create policy "odds read"   on public.odds for select using (true);
create policy "odds insert" on public.odds for insert with check (true);
create policy "odds update" on public.odds for update using (true);

-- Realtime: 배당 입력 시 모든 화면 즉시 반영
alter publication supabase_realtime add table public.odds;
