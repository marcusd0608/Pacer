-- Launch readiness: AI rate limiting, anonymous usage metrics, waitlist, data requests.
-- Run once in the Supabase SQL editor for the Pacer project. Safe to re-run.

-- 1) Rate limiting for /api/ai ------------------------------------------------------------
create table if not exists public.rate_limits (
  key text not null,
  bucket timestamptz not null,
  count integer not null default 0,
  primary key (key, bucket)
);
alter table public.rate_limits enable row level security;
revoke all on public.rate_limits from anon, authenticated;

create or replace function public.rate_limit_hit(p_key text, p_window_seconds integer, p_limit integer)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_bucket timestamptz;
  v_count integer;
begin
  if p_key is null or length(p_key) > 80 or p_window_seconds not between 1 and 86400 or p_limit not between 1 and 100000 then
    return false;
  end if;
  v_bucket := to_timestamp(floor(extract(epoch from now()) / p_window_seconds) * p_window_seconds);
  insert into public.rate_limits as r (key, bucket, count) values (p_key, v_bucket, 1)
    on conflict (key, bucket) do update set count = r.count + 1
    returning r.count into v_count;
  if random() < 0.01 then
    delete from public.rate_limits where bucket < now() - interval '2 days';
  end if;
  return v_count <= p_limit;
end;
$$;
revoke all on function public.rate_limit_hit(text, integer, integer) from public;
grant execute on function public.rate_limit_hit(text, integer, integer) to anon, authenticated;

-- 2) Anonymous usage events (no names, no text, no student content) -------------------------
create table if not exists public.usage_events (
  id bigint generated always as identity primary key,
  ts timestamptz not null default now(),
  event text not null check (event in ('room_open','room_join','ask','snip','checkin_post','checkin_answer','revisit','board_clear','recap','waitlist_view')),
  role text not null check (role in ('teacher','student','visitor')),
  room_hash text check (room_hash is null or length(room_hash) <= 16),
  meta jsonb not null default '{}'::jsonb check (pg_column_size(meta) <= 400)
);
alter table public.usage_events enable row level security;
revoke all on public.usage_events from anon, authenticated;
grant insert on public.usage_events to anon, authenticated;
drop policy if exists "anyone can log a usage event" on public.usage_events;
create policy "anyone can log a usage event" on public.usage_events for insert to anon, authenticated with check (true);

create or replace view public.usage_daily with (security_invoker = true) as
  select date_trunc('day', ts) as day,
         count(distinct room_hash) filter (where event = 'room_open') as lectures_started,
         count(*) filter (where event = 'room_join') as student_joins,
         count(*) filter (where event in ('ask','snip')) as student_questions,
         count(*) filter (where event = 'checkin_post') as checkins_posted,
         count(*) filter (where event = 'checkin_answer') as checkin_answers,
         count(*) filter (where event = 'recap') as recaps_generated
  from public.usage_events group by 1 order by 1 desc;
revoke all on public.usage_daily from anon, authenticated;

-- 3) Waitlist and data requests (insert-only from the public site) --------------------------
create table if not exists public.waitlist (
  id bigint generated always as identity primary key,
  created_at timestamptz not null default now(),
  email text not null check (length(email) <= 254 and email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  role text check (role is null or role in ('teacher','ta','tutor','trainer','admin','other')),
  note text check (note is null or length(note) <= 500)
);
create unique index if not exists waitlist_email_unique on public.waitlist (lower(email));
alter table public.waitlist enable row level security;
revoke all on public.waitlist from anon, authenticated;
grant insert on public.waitlist to anon, authenticated;
drop policy if exists "anyone can join the waitlist" on public.waitlist;
create policy "anyone can join the waitlist" on public.waitlist for insert to anon, authenticated with check (true);

create table if not exists public.data_requests (
  id bigint generated always as identity primary key,
  created_at timestamptz not null default now(),
  email text not null check (length(email) <= 254 and email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  kind text not null check (kind in ('delete','export','question')),
  details text check (details is null or length(details) <= 1000),
  status text not null default 'new' check (status in ('new','in_progress','done'))
);
alter table public.data_requests enable row level security;
revoke all on public.data_requests from anon, authenticated;
grant insert on public.data_requests to anon, authenticated;
drop policy if exists "anyone can file a data request" on public.data_requests;
create policy "anyone can file a data request" on public.data_requests for insert to anon, authenticated with check (true);
