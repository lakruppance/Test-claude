-- Phase 4: clip review (approve / reject / re-render), per-platform metadata, user defaults.

alter table public.clips
  add column status text not null default 'pending_review'
    check (status in ('pending_review', 'approved', 'rejected', 'rendering', 'render_failed')),
  add column reviewed_at timestamptz,
  add column with_hook boolean not null default true,
  add column render_error text;

alter table public.segments
  add column platform_meta jsonb not null default '{}'::jsonb,
  add column original_start_seconds numeric(10, 3),
  add column original_end_seconds numeric(10, 3);
update public.segments set original_start_seconds = start_seconds, original_end_seconds = end_seconds;

alter table public.profiles
  add column default_style text not null default 'impact' check (default_style in ('impact', 'boite', 'epure')),
  add column default_with_hook boolean not null default true;
grant update (default_style, default_with_hook) on public.profiles to authenticated;

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table public.clips;
  end if;
end;
$$;
