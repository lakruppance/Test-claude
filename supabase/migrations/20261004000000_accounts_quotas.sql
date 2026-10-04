-- Phase 2: user accounts, plans, rights declarations and usage (quota) tracking.
-- Every table: RLS enabled AND forced; users read their own rows; writes that matter for
-- billing or legal records happen server-side (service role) only.

-- Jobs created during phase 1 without an owner cannot be attributed: remove them, then make
-- ownership mandatory everywhere.
delete from public.jobs where user_id is null;
alter table public.jobs alter column user_id set not null;
alter table public.job_steps alter column user_id set not null;
alter table public.transcripts alter column user_id set not null;
alter table public.segments alter column user_id set not null;
alter table public.clips alter column user_id set not null;
alter table public.cost_events alter column user_id set not null;

-- ---------------------------------------------------------------------------- plans
create table public.plans (
  id text primary key,
  name text not null,
  price_eur_cents integer not null check (price_eur_cents >= 0),
  monthly_minutes integer not null check (monthly_minutes >= 0),
  max_video_minutes integer not null check (max_video_minutes > 0),
  watermark boolean not null,
  direct_publish boolean not null,
  channel_monitoring boolean not null,
  sort smallint not null
);
insert into public.plans values
  ('free',    'Gratuit',  0,     30,   20,  true,  false, false, 1),
  ('creator', 'Créateur', 1900,  300,  90,  false, true,  false, 2),
  ('pro',     'Pro',      4900,  1000, 180, false, true,  true,  3),
  ('studio',  'Studio',   12900, 3000, 180, false, true,  true,  4);

-- ---------------------------------------------------------------------------- profiles
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text,
  display_name text check (char_length(display_name) <= 80),
  locale text not null default 'fr' check (locale in ('fr', 'en')),
  plan_id text not null default 'free' references public.plans (id),
  is_admin boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger profiles_set_updated_at before update on public.profiles
  for each row execute function public.set_updated_at();

create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles (id, email, display_name)
  values (
    new.id,
    new.email,
    left(coalesce(new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name'), 80)
  )
  on conflict (id) do nothing;
  return new;
end;
$$;
revoke execute on function public.handle_new_user() from public, anon, authenticated;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- Profiles for users that already exist.
insert into public.profiles (id, email)
select id, email from auth.users
on conflict (id) do nothing;

-- ---------------------------------------------------------------------------- rights
-- Record of the user's statement that they own the content or are authorized by its creator.
create table public.rights_declarations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  job_id uuid references public.jobs (id) on delete set null,
  content_kind text not null check (content_kind in ('upload', 'youtube', 'drive', 'dropbox', 'channel')),
  content_ref text not null,
  statement_version text not null,
  statement text not null,
  ip_address inet,
  user_agent text,
  created_at timestamptz not null default now()
);
create index rights_declarations_user_id_idx on public.rights_declarations (user_id, created_at desc);

-- ---------------------------------------------------------------------------- usage
-- Minutes of source video processed. A job reserves its duration when processing starts and
-- the reservation is released if the job fails.
create table public.usage_events (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  job_id uuid references public.jobs (id) on delete set null,
  period_start date not null,
  minutes numeric(10, 3) not null,
  kind text not null check (kind in ('reserve', 'release')),
  created_at timestamptz not null default now()
);
create index usage_events_user_period_idx on public.usage_events (user_id, period_start);
create unique index usage_events_one_per_job_kind on public.usage_events (job_id, kind)
  where job_id is not null;

create or replace function public.current_period_start() returns date
language sql stable set search_path = '' as $$
  select date_trunc('month', now() at time zone 'utc')::date;
$$;

-- Runs with the caller's rights: users only sum their own rows (RLS).
create or replace function public.minutes_used(p_user uuid, p_period date default null)
returns numeric language sql stable security invoker set search_path = '' as $$
  select coalesce(sum(minutes), 0)
  from public.usage_events
  where user_id = p_user and period_start = coalesce(p_period, public.current_period_start());
$$;

-- Atomic quota check + reservation (service role only). Idempotent per job.
create or replace function public.reserve_minutes(p_user uuid, p_job uuid, p_minutes numeric)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_limit integer;
  v_used numeric;
  v_period date := public.current_period_start();
begin
  select pl.monthly_minutes into v_limit
  from public.profiles pr join public.plans pl on pl.id = pr.plan_id
  where pr.id = p_user
  for update of pr;  -- serializes concurrent reservations of the same user
  if v_limit is null then
    return jsonb_build_object('ok', false, 'reason', 'no_profile');
  end if;
  if exists (select 1 from public.usage_events where job_id = p_job and kind = 'reserve') then
    return jsonb_build_object('ok', true, 'already', true);
  end if;
  select coalesce(sum(minutes), 0) into v_used
  from public.usage_events where user_id = p_user and period_start = v_period;
  if v_used + p_minutes > v_limit then
    return jsonb_build_object('ok', false, 'reason', 'quota_exceeded', 'used', v_used,
                              'limit', v_limit, 'requested', p_minutes);
  end if;
  insert into public.usage_events (user_id, job_id, period_start, minutes, kind)
  values (p_user, p_job, v_period, p_minutes, 'reserve');
  return jsonb_build_object('ok', true, 'used', v_used + p_minutes, 'limit', v_limit);
end;
$$;

create or replace function public.release_minutes(p_job uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  insert into public.usage_events (user_id, job_id, period_start, minutes, kind)
  select user_id, job_id, period_start, -minutes, 'release'
  from public.usage_events
  where job_id = p_job and kind = 'reserve'
  on conflict do nothing;
end;
$$;
revoke execute on function public.reserve_minutes(uuid, uuid, numeric) from public, anon, authenticated;
revoke execute on function public.release_minutes(uuid) from public, anon, authenticated;
grant execute on function public.reserve_minutes(uuid, uuid, numeric) to service_role;
grant execute on function public.release_minutes(uuid) to service_role;

-- ---------------------------------------------------------------------------- RLS
alter table public.plans enable row level security;
alter table public.plans force row level security;
revoke insert, update, delete, truncate on public.plans from anon, authenticated;
create policy plans_public_read on public.plans for select to anon, authenticated using (true);

alter table public.profiles enable row level security;
alter table public.profiles force row level security;
revoke all on public.profiles from anon;
revoke insert, update, delete, truncate on public.profiles from authenticated;
-- Users may only change these columns; plan_id and is_admin are server-managed.
grant update (display_name, locale) on public.profiles to authenticated;
create policy profiles_owner_select on public.profiles for select to authenticated
  using (id = (select auth.uid()));
create policy profiles_owner_update on public.profiles for update to authenticated
  using (id = (select auth.uid())) with check (id = (select auth.uid()));

do $$
declare t text;
begin
  foreach t in array array['rights_declarations', 'usage_events']
  loop
    execute format('alter table public.%I enable row level security', t);
    execute format('alter table public.%I force row level security', t);
    execute format('revoke all on public.%I from anon', t);
    execute format('revoke insert, update, delete, truncate on public.%I from authenticated', t);
    execute format(
      'create policy %I on public.%I for select to authenticated using (user_id = (select auth.uid()))',
      t || '_owner_select', t
    );
  end loop;
end;
$$;

-- ---------------------------------------------------------------------------- realtime
-- Live job progress in the browser (Realtime applies the same RLS policies).
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table public.jobs, public.job_steps;
  end if;
end;
$$;
