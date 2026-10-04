-- Phase 3: ingestion sources (upload, Google Drive / Dropbox links, YouTube) and YouTube
-- channel monitoring through the public RSS feed.

alter table public.jobs
  add column source_kind text not null default 'upload'
    check (source_kind in ('upload', 'drive', 'dropbox', 'youtube')),
  add column source_url text;

alter table public.plans add column max_channels integer not null default 0;
update public.plans set max_channels = case id when 'pro' then 1 when 'studio' then 5 else 0 end;

create table public.channels (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  youtube_channel_id text not null check (youtube_channel_id ~ '^UC[A-Za-z0-9_-]{22}$'),
  title text not null,
  auto_process boolean not null default false,
  last_checked_at timestamptz,
  last_error text,
  created_at timestamptz not null default now(),
  unique (user_id, youtube_channel_id)
);
create index channels_last_checked_idx on public.channels (last_checked_at nulls first);

create table public.channel_videos (
  id uuid primary key default gen_random_uuid(),
  channel_id uuid not null references public.channels (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  youtube_video_id text not null check (youtube_video_id ~ '^[A-Za-z0-9_-]{11}$'),
  title text not null,
  published_at timestamptz not null,
  status text not null default 'new' check (status in ('new', 'queued', 'ignored')),
  job_id uuid references public.jobs (id) on delete set null,
  detected_at timestamptz not null default now(),
  unique (channel_id, youtube_video_id)
);
create index channel_videos_user_status_idx on public.channel_videos (user_id, status, published_at desc);

do $$
declare t text;
begin
  foreach t in array array['channels', 'channel_videos']
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

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table public.channel_videos;
  end if;
end;
$$;
