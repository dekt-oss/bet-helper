-- 구매전표(복수게임/조합) 테이블 — 전표(bet_slips) + 폴(bet_legs)
-- Supabase > SQL Editor 에 붙여넣어 실행하세요. (기존 schema.sql 이후)

create table if not exists public.bet_slips (
  id            uuid primary key default gen_random_uuid(),
  placed_by     text not null default '공동',
  combined_odds numeric(10, 2) not null,
  stake         integer not null check (stake > 0),
  status        text not null default 'PENDING'
                  check (status in ('PENDING', 'WON', 'LOST', 'VOID')),
  payout        integer,
  note          text,
  created_at    timestamptz not null default now()
);

create table if not exists public.bet_legs (
  slip_id           uuid not null references public.bet_slips(id) on delete cascade,
  leg_index         integer not null,
  match_id          text not null,
  market            text not null check (market in ('1X2', 'HANDICAP', 'OU')),
  pick              text not null check (pick in ('HOME', 'DRAW', 'AWAY', 'OVER', 'UNDER')),
  line              numeric(6, 2),
  odds_at_placement numeric(6, 2) not null,
  status            text not null default 'PENDING'
                      check (status in ('PENDING', 'WON', 'LOST', 'VOID')),
  primary key (slip_id, leg_index)
);

create index if not exists bet_slips_created_at_idx on public.bet_slips (created_at desc);
create index if not exists bet_legs_slip_idx on public.bet_legs (slip_id);

alter table public.bet_slips enable row level security;
alter table public.bet_legs  enable row level security;

drop policy if exists "slips read"   on public.bet_slips;
drop policy if exists "slips insert" on public.bet_slips;
drop policy if exists "slips update" on public.bet_slips;
drop policy if exists "slips delete" on public.bet_slips;
create policy "slips read"   on public.bet_slips for select using (true);
create policy "slips insert" on public.bet_slips for insert with check (true);
create policy "slips update" on public.bet_slips for update using (true);
create policy "slips delete" on public.bet_slips for delete using (true);

drop policy if exists "legs read"   on public.bet_legs;
drop policy if exists "legs insert" on public.bet_legs;
drop policy if exists "legs update" on public.bet_legs;
drop policy if exists "legs delete" on public.bet_legs;
create policy "legs read"   on public.bet_legs for select using (true);
create policy "legs insert" on public.bet_legs for insert with check (true);
create policy "legs update" on public.bet_legs for update using (true);
create policy "legs delete" on public.bet_legs for delete using (true);

-- Realtime 활성화 (입력 즉시 모든 화면 반영)
alter publication supabase_realtime add table public.bet_slips;
alter publication supabase_realtime add table public.bet_legs;
