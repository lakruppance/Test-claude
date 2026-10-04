-- Core pipeline schema (phase 1). Every table carries user_id so RLS can be expressed as
-- "user_id = auth.uid()". In phase 1 jobs are created server-side without a user (user_id is
-- null, so no end user can read them); phase 2 makes user_id mandatory.

create extension if not exists pgcrypto;

create or replace function public.set_updated_at() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create table public.jobs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users (id) on delete cascade,
  status text not null default 'uploading'
    check (status in ('uploading', 'queued', 'running', 'succeeded', 'failed', 'canceled')),
  source_key text not null,
  source_filename text,
  source_bytes bigint,
  duration_seconds numeric(10, 3),
  width integer,
  height integer,
  language text,
  current_step text,
  progress numeric(5, 2) not null default 0,
  error_code text,
  error_message text,
  options jsonb not null default '{}'::jsonb,
  trigger_run_id text,
  cost_usd numeric(12, 6) not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  finished_at timestamptz
);
create index jobs_user_id_created_at_idx on public.jobs (user_id, created_at desc);
create index jobs_status_idx on public.jobs (status);
create trigger jobs_set_updated_at before update on public.jobs
  for each row execute function public.set_updated_at();

create table public.job_steps (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references public.jobs (id) on delete cascade,
  user_id uuid references auth.users (id) on delete cascade,
  step text not null,
  status text not null default 'pending'
    check (status in ('pending', 'running', 'succeeded', 'failed')),
  attempts integer not null default 0,
  started_at timestamptz,
  finished_at timestamptz,
  error_code text,
  error_message text,
  output jsonb,
  unique (job_id, step)
);
create index job_steps_user_id_idx on public.job_steps (user_id);

create table public.transcripts (
  job_id uuid primary key references public.jobs (id) on delete cascade,
  user_id uuid references auth.users (id) on delete cascade,
  language text not null,
  duration_seconds numeric(10, 3) not null,
  source text not null,
  words jsonb not null,
  created_at timestamptz not null default now()
);
create index transcripts_user_id_idx on public.transcripts (user_id);

create table public.segments (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references public.jobs (id) on delete cascade,
  user_id uuid references auth.users (id) on delete cascade,
  rank integer not null,
  start_seconds numeric(10, 3) not null,
  end_seconds numeric(10, 3) not null check (end_seconds > start_seconds),
  score_global smallint not null check (score_global between 0 and 100),
  hook smallint not null check (hook between 0 and 100),
  autonomie smallint not null check (autonomie between 0 and 100),
  intensite smallint not null check (intensite between 0 and 100),
  chute smallint not null check (chute between 0 and 100),
  justification text not null,
  titre_propose text not null,
  accroche_ecran text not null default '',
  transcript_text text not null default '',
  sentence_start integer not null,
  sentence_end integer not null,
  created_at timestamptz not null default now(),
  unique (job_id, rank)
);
create index segments_user_id_idx on public.segments (user_id);

create table public.clips (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references public.jobs (id) on delete cascade,
  segment_id uuid not null references public.segments (id) on delete cascade,
  user_id uuid references auth.users (id) on delete cascade,
  style text not null,
  reframe_mode text not null,
  storage_key text not null,
  thumbnail_key text,
  width integer not null,
  height integer not null,
  duration_seconds numeric(10, 3) not null,
  bytes bigint not null,
  created_at timestamptz not null default now(),
  unique (segment_id, style)
);
create index clips_job_id_idx on public.clips (job_id);
create index clips_user_id_idx on public.clips (user_id);

create table public.cost_events (
  id bigint generated always as identity primary key,
  job_id uuid not null references public.jobs (id) on delete cascade,
  user_id uuid references auth.users (id) on delete cascade,
  step text not null,
  provider text not null,
  item text not null,
  quantity numeric(18, 6) not null,
  unit text not null,
  usd numeric(12, 6) not null,
  meta jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index cost_events_job_id_idx on public.cost_events (job_id);
create index cost_events_user_id_idx on public.cost_events (user_id);

-- Keep jobs.cost_usd equal to the sum of its cost events.
create or replace function public.add_cost_to_job() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  update public.jobs set cost_usd = cost_usd + new.usd where id = new.job_id;
  return new;
end;
$$;
create trigger cost_events_add_to_job after insert on public.cost_events
  for each row execute function public.add_cost_to_job();
revoke execute on function public.add_cost_to_job() from public, anon, authenticated;

-- Row Level Security: enabled AND forced on every table, read-only for the owner.
-- Writes happen server-side (service role) in phase 1.
do $$
declare t text;
begin
  foreach t in array array['jobs', 'job_steps', 'transcripts', 'segments', 'clips', 'cost_events']
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

-- Cost details are internal: users see the job total (jobs.cost_usd) only through admin views
-- later; no select for end users on cost_events.
drop policy cost_events_owner_select on public.cost_events;
create policy cost_events_no_user_access on public.cost_events for select to authenticated
  using (false);
