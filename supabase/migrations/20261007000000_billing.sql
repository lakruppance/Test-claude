-- Phase 5: Stripe billing. Plans are sold as Stripe prices found by lookup key; the webhook is
-- the only writer of subscription state and of profiles.plan_id.

alter table public.plans add column stripe_lookup_key text unique;
update public.plans set stripe_lookup_key = case id
  when 'creator' then 'pepite_creator_monthly'
  when 'pro' then 'pepite_pro_monthly'
  when 'studio' then 'pepite_studio_monthly'
end;

-- Whether the free-plan watermark was burned in (regenerating after an upgrade removes it).
alter table public.clips add column watermarked boolean not null default false;

-- Not in the user's column grants: users can read it (own row) but never change it.
alter table public.profiles add column stripe_customer_id text unique;

create table public.subscriptions (
  stripe_subscription_id text primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  stripe_customer_id text not null,
  plan_id text not null references public.plans (id),
  status text not null,
  current_period_end timestamptz,
  cancel_at_period_end boolean not null default false,
  -- Stripe event time of the last applied update: older events delivered late are ignored.
  last_event_at timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index subscriptions_user_idx on public.subscriptions (user_id);
create trigger subscriptions_set_updated_at before update on public.subscriptions
  for each row execute function public.set_updated_at();

alter table public.subscriptions enable row level security;
alter table public.subscriptions force row level security;
create policy subscriptions_owner_select on public.subscriptions
  for select to authenticated using (user_id = (select auth.uid()));
revoke insert, update, delete on public.subscriptions from anon, authenticated;

-- Processed webhook events (idempotency). Server-only: RLS on, no policy.
create table public.stripe_events (
  id text primary key,
  type text not null,
  processed_at timestamptz not null default now()
);
alter table public.stripe_events enable row level security;
alter table public.stripe_events force row level security;
create policy stripe_events_no_client_access on public.stripe_events
  for all to anon, authenticated using (false) with check (false);
revoke all on public.stripe_events from anon, authenticated;

-- Statuses that keep the paid plan. past_due: Stripe is still retrying the payment.
create or replace function public.subscription_grants_plan(p_status text) returns boolean
language sql immutable set search_path = '' as $$
  select p_status in ('active', 'trialing', 'past_due');
$$;

-- Applies a subscription snapshot atomically and recomputes the user's plan from all of their
-- subscriptions (the best granting one wins, otherwise free). Service role only.
create or replace function public.sync_subscription(
  p_user uuid,
  p_customer text,
  p_subscription text,
  p_plan text,
  p_status text,
  p_period_end timestamptz,
  p_cancel_at_period_end boolean,
  p_event_at timestamptz
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_last timestamptz;
  v_plan text;
begin
  -- Serialize updates for this user (two events for the same user can arrive together).
  perform 1 from public.profiles where id = p_user for update;
  if not found then
    return jsonb_build_object('ok', false, 'reason', 'no_profile');
  end if;

  select last_event_at into v_last from public.subscriptions where stripe_subscription_id = p_subscription;
  if v_last is not null and v_last > p_event_at then
    return jsonb_build_object('ok', true, 'stale', true);
  end if;

  insert into public.subscriptions as s (stripe_subscription_id, user_id, stripe_customer_id, plan_id, status,
    current_period_end, cancel_at_period_end, last_event_at)
  values (p_subscription, p_user, p_customer, p_plan, p_status, p_period_end, p_cancel_at_period_end, p_event_at)
  on conflict (stripe_subscription_id) do update set
    plan_id = excluded.plan_id, status = excluded.status, current_period_end = excluded.current_period_end,
    cancel_at_period_end = excluded.cancel_at_period_end, last_event_at = excluded.last_event_at;

  select s.plan_id into v_plan
  from public.subscriptions s join public.plans pl on pl.id = s.plan_id
  where s.user_id = p_user and public.subscription_grants_plan(s.status)
  order by pl.sort desc limit 1;

  update public.profiles set plan_id = coalesce(v_plan, 'free'), stripe_customer_id = p_customer
  where id = p_user;
  return jsonb_build_object('ok', true, 'plan', coalesce(v_plan, 'free'));
end;
$$;

revoke execute on function public.sync_subscription(uuid, text, text, text, text, timestamptz, boolean, timestamptz)
  from public, anon, authenticated;
grant execute on function public.sync_subscription(uuid, text, text, text, text, timestamptz, boolean, timestamptz)
  to service_role;
