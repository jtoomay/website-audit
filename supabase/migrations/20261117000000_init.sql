-- StackScout initial schema: user profiles (plan + usage), saved scans, screenshot storage.

-- ─────────────────────────────── profiles ───────────────────────────────
create table public.profiles (
  id                uuid primary key references auth.users (id) on delete cascade,
  email             text,
  plan              text not null default 'free' check (plan in ('free', 'pro', 'agency')),
  scans_this_month  integer not null default 0,
  usage_month       text not null default to_char(now() at time zone 'utc', 'YYYY-MM'),
  created_at        timestamptz not null default now()
);

alter table public.profiles enable row level security;

create policy "profiles: read own"
  on public.profiles for select to authenticated
  using (id = auth.uid());
-- No insert/update policies: plan + usage are only changed by the API server (service role).

-- Create a profile automatically for every new auth user.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email) values (new.id, new.email)
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ──────────────────────────────── scans ─────────────────────────────────
create table public.scans (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null references auth.users (id) on delete cascade,
  url              text not null,
  final_url        text,
  host             text,
  status           text not null default 'running' check (status in ('running', 'complete', 'failed')),
  error            text,
  primary_stack    text,
  tech_names       text[] not null default '{}',
  report           jsonb,
  screenshot_path  text,
  duration_ms      integer,
  created_at       timestamptz not null default now()
);

create index scans_user_created_idx on public.scans (user_id, created_at desc);
create index scans_user_host_idx on public.scans (user_id, host);
create index scans_tech_names_idx on public.scans using gin (tech_names);

alter table public.scans enable row level security;

create policy "scans: read own"
  on public.scans for select to authenticated
  using (user_id = auth.uid());

create policy "scans: delete own"
  on public.scans for delete to authenticated
  using (user_id = auth.uid());
-- Inserts/updates happen only from the API server (service role bypasses RLS).

-- ───────────────────────────── usage quota ──────────────────────────────
-- Atomically resets the monthly counter when the month rolls over, then
-- consumes one scan credit if the user is under p_limit.
create or replace function public.consume_scan_credit(p_user uuid, p_limit integer)
returns table (allowed boolean, used integer)
language plpgsql
security definer
set search_path = public
as $$
declare
  cur_month text := to_char(now() at time zone 'utc', 'YYYY-MM');
  v_used integer;
begin
  update profiles
     set scans_this_month = 0, usage_month = cur_month
   where id = p_user and usage_month <> cur_month;

  update profiles
     set scans_this_month = scans_this_month + 1
   where id = p_user and scans_this_month < p_limit
  returning scans_this_month into v_used;

  if v_used is null then
    select scans_this_month into v_used from profiles where id = p_user;
    return query select false, coalesce(v_used, 0);
  else
    return query select true, v_used;
  end if;
end;
$$;

create or replace function public.refund_scan_credit(p_user uuid)
returns void
language sql
security definer
set search_path = public
as $$
  update profiles set scans_this_month = greatest(scans_this_month - 1, 0) where id = p_user;
$$;

-- Only the server (service_role) may call these.
revoke all on function public.consume_scan_credit(uuid, integer) from public, anon, authenticated;
revoke all on function public.refund_scan_credit(uuid) from public, anon, authenticated;
grant execute on function public.consume_scan_credit(uuid, integer) to service_role;
grant execute on function public.refund_scan_credit(uuid) to service_role;

-- ─────────────────────────── screenshot storage ─────────────────────────
-- Files live at screenshots/<user_id>/<scan_id>.jpg
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('screenshots', 'screenshots', false, 5242880, array['image/jpeg', 'image/png'])
on conflict (id) do nothing;

create policy "screenshots: read own"
  on storage.objects for select to authenticated
  using (bucket_id = 'screenshots' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "screenshots: delete own"
  on storage.objects for delete to authenticated
  using (bucket_id = 'screenshots' and (storage.foldername(name))[1] = auth.uid()::text);
