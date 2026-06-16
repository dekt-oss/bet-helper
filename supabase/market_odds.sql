-- 멀티마켓 배당 테이블 (승무패 + 핸디캡 + 언더오버)
-- Supabase > SQL Editor 에 붙여넣어 실행하세요. (기존 schema.sql/odds.sql 이후)

create table if not exists public.market_odds (
  match_id   text not null,
  market     text not null check (market in ('1X2', 'HANDICAP', 'OU')),
  -- 같은 경기-마켓이라도 핸디/기준선이 다르면 별도 행 → 복합 PK 의 일부.
  line_key   numeric(6, 2) not null default 0,
  bet_id     text,
  home       numeric(6, 2),
  draw       numeric(6, 2),
  away       numeric(6, 2),
  handicap   numeric(6, 2),
  line       numeric(6, 2),
  over       numeric(6, 2),
  under      numeric(6, 2),
  source     text not null default 'betman',
  updated_at timestamptz not null default now(),
  primary key (match_id, market, line_key)
);

alter table public.market_odds enable row level security;

drop policy if exists "market_odds read"   on public.market_odds;
drop policy if exists "market_odds insert" on public.market_odds;
drop policy if exists "market_odds update" on public.market_odds;
create policy "market_odds read"   on public.market_odds for select using (true);
create policy "market_odds insert" on public.market_odds for insert with check (true);
create policy "market_odds update" on public.market_odds for update using (true);

-- Realtime: 배당 입력 시 모든 화면 즉시 반영
alter publication supabase_realtime add table public.market_odds;
