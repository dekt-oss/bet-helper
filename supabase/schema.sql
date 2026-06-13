-- bet-helper Supabase 스키마
-- Supabase 프로젝트 > SQL Editor 에 붙여넣어 실행하세요.
-- (이후 .env.local 에 NEXT_PUBLIC_SUPABASE_URL / ANON_KEY / SERVICE_ROLE_KEY 설정)

create table if not exists public.bets (
  id                uuid primary key default gen_random_uuid(),
  match_id          text not null,
  placed_by         text not null,
  pick              text not null check (pick in ('HOME', 'DRAW', 'AWAY')),
  odds_at_placement numeric(6, 2) not null,
  stake             integer not null check (stake > 0),
  status            text not null default 'PENDING'
                      check (status in ('PENDING', 'WON', 'LOST', 'VOID')),
  payout            integer,
  note              text,
  created_at        timestamptz not null default now()
);

create index if not exists bets_created_at_idx on public.bets (created_at desc);

-- RLS: 친구 몇 명이 쓰는 비공개 도구라 anon 키로 읽기/쓰기를 허용한다.
-- (공개 배포 시에는 인증을 붙여 정책을 좁히는 것을 권장)
alter table public.bets enable row level security;

drop policy if exists "public read"   on public.bets;
drop policy if exists "public insert" on public.bets;
drop policy if exists "public update" on public.bets;
drop policy if exists "public delete" on public.bets;
create policy "public read"   on public.bets for select using (true);
create policy "public insert" on public.bets for insert with check (true);
create policy "public update" on public.bets for update using (true);
create policy "public delete" on public.bets for delete using (true);

-- Realtime 활성화 (입력 즉시 모든 화면 반영)
alter publication supabase_realtime add table public.bets;

-- 시드: 체코전 (3만원 베팅 → 2.45배 적중 → 73,500원 수령)
insert into public.bets (match_id, placed_by, pick, odds_at_placement, stake, status, payout, note, created_at)
select '대한민국 vs 체코', '공동', 'HOME', 2.45, 30000, 'WON', 73500, '체코전 적중', '2026-06-10T18:00:00Z'
where not exists (select 1 from public.bets);
