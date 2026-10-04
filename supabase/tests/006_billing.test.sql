-- Billing: plan changes only through the webhook function, isolation of subscriptions,
-- out-of-order events, plan recomputation.
begin;
select plan(15);

insert into auth.users (id, email) values
  ('11111111-1111-1111-1111-111111111111', 'a@example.test'),
  ('22222222-2222-2222-2222-222222222222', 'b@example.test');

-- ---- webhook sync (service side) ----
select is(public.sync_subscription('11111111-1111-1111-1111-111111111111', 'cus_A', 'sub_A1', 'pro', 'active',
  now() + interval '30 days', false, '2026-10-01 10:00+00') ->> 'plan', 'pro', 'an active subscription grants its plan');
select results_eq($$ select plan_id, stripe_customer_id from public.profiles where id = '11111111-1111-1111-1111-111111111111' $$,
  $$ values ('pro'::text, 'cus_A'::text) $$, 'profile carries the plan and the Stripe customer');
select is((public.sync_subscription('11111111-1111-1111-1111-111111111111', 'cus_A', 'sub_A1', 'pro', 'canceled',
  null, false, '2026-10-01 09:00+00') ->> 'stale')::boolean, true, 'an older event delivered late is ignored');
select is((select plan_id from public.profiles where id = '11111111-1111-1111-1111-111111111111'), 'pro', 'stale event did not downgrade');
select is(public.sync_subscription('11111111-1111-1111-1111-111111111111', 'cus_A', 'sub_A1', 'pro', 'past_due',
  now() + interval '30 days', false, '2026-10-02 10:00+00') ->> 'plan', 'pro', 'past_due keeps the plan while Stripe retries');
select is(public.sync_subscription('11111111-1111-1111-1111-111111111111', 'cus_A', 'sub_A1', 'creator', 'active',
  now() + interval '30 days', true, '2026-10-03 10:00+00') ->> 'plan', 'creator', 'a plan change is applied');
select is(public.sync_subscription('11111111-1111-1111-1111-111111111111', 'cus_A', 'sub_A1', 'creator', 'canceled',
  null, false, '2026-10-04 10:00+00') ->> 'plan', 'free', 'a canceled subscription returns to free');
select is(public.sync_subscription('11111111-1111-1111-1111-111111111111', 'cus_A', 'sub_A1', 'creator', 'unpaid',
  null, false, '2026-10-05 10:00+00') ->> 'plan', 'free', 'unpaid does not grant a plan');
select public.sync_subscription('22222222-2222-2222-2222-222222222222', 'cus_B', 'sub_B1', 'studio', 'active',
  now() + interval '30 days', false, '2026-10-01 10:00+00');

-- ---- as user A ----
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}', true);
select results_eq('select stripe_subscription_id from public.subscriptions', array['sub_A1'], 'A sees only their subscription');
select throws_ok($$ update public.profiles set plan_id = 'studio' where id = '11111111-1111-1111-1111-111111111111' $$,
  '42501', null, 'A cannot change their plan');
select throws_ok($$ update public.profiles set stripe_customer_id = 'cus_B' where id = '11111111-1111-1111-1111-111111111111' $$,
  '42501', null, 'A cannot change their Stripe customer');
select throws_ok($$ insert into public.subscriptions values ('sub_x', '11111111-1111-1111-1111-111111111111', 'cus_A', 'studio', 'active', null, false, now()) $$,
  '42501', null, 'A cannot create a subscription');
select throws_ok($$ select public.sync_subscription('11111111-1111-1111-1111-111111111111', 'cus_A', 'sub_x', 'studio', 'active', null, false, now()) $$,
  '42501', null, 'A cannot call the webhook sync');
select throws_ok('select * from public.stripe_events', '42501', null, 'webhook events are not readable by users');
select is_empty($$ select 1 from public.subscriptions where user_id = '22222222-2222-2222-2222-222222222222' $$,
  'A cannot read B''s subscription');

select * from finish();
rollback;
