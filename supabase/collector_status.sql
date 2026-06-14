-- 수집기 상태(하트비트). 배너의 '베트맨 마지막 갱신' 정확도용.
-- Supabase SQL 편집기에서 1회 실행.
create table if not exists public.collector_status (
  key text primary key,
  updated_at timestamptz not null default now()
);

alter table public.collector_status enable row level security;

-- 소규모 비공개 그룹: 읽기/쓰기 공개(앱이 anon/service 키로 접근).
drop policy if exists "collector_status read" on public.collector_status;
create policy "collector_status read" on public.collector_status for select using (true);

drop policy if exists "collector_status write" on public.collector_status;
create policy "collector_status write" on public.collector_status for all using (true) with check (true);
