-- Accounts, plans, rights declarations and quotas: isolation, no self-escalation, quota logic.
begin;
select plan(24);

insert into auth.users (id, email) values
  ('11111111-1111-1111-1111-111111111111', 'a@example.test'),
  ('22222222-2222-2222-2222-222222222222', 'b@example.test');

select results_eq('select count(*)::int from public.profiles where id in (''11111111-1111-1111-1111-111111111111'', ''22222222-2222-2222-2222-222222222222'')',
  array[2], 'a profile is created for each new user');
select results_eq('select plan_id from public.profiles where id = ''11111111-1111-1111-1111-111111111111''',
  array['free'], 'new users start on the free plan');

insert into public.jobs (id, user_id, source_key, status) values
  ('aaaaaaaa-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', 's/a1', 'running'),
  ('aaaaaaaa-0000-0000-0000-000000000002', '11111111-1111-1111-1111-111111111111', 's/a2', 'running'),
  ('aaaaaaaa-0000-0000-0000-000000000003', '11111111-1111-1111-1111-111111111111', 's/a3', 'running'),
  ('bbbbbbbb-0000-0000-0000-000000000001', '22222222-2222-2222-2222-222222222222', 's/b1', 'running');

insert into public.rights_declarations (user_id, job_id, content_kind, content_ref, statement_version, statement) values
  ('11111111-1111-1111-1111-111111111111', 'aaaaaaaa-0000-0000-0000-000000000001', 'upload', 'a.mp4', 'v1', 'x'),
  ('22222222-2222-2222-2222-222222222222', 'bbbbbbbb-0000-0000-0000-000000000001', 'upload', 'b.mp4', 'v1', 'x');

-- ---- quota logic (server side, as postgres) ----
select is((public.reserve_minutes('11111111-1111-1111-1111-111111111111', 'aaaaaaaa-0000-0000-0000-000000000001', 20) ->> 'ok')::boolean,
  true, 'reservation within the free quota succeeds');
select is((public.reserve_minutes('11111111-1111-1111-1111-111111111111', 'aaaaaaaa-0000-0000-0000-000000000001', 20) ->> 'already')::boolean,
  true, 'reservation is idempotent per job');
select is(public.reserve_minutes('11111111-1111-1111-1111-111111111111', 'aaaaaaaa-0000-0000-0000-000000000002', 15) ->> 'reason',
  'quota_exceeded', 'reservation beyond 30 free minutes is refused');
select lives_ok($$ select public.release_minutes('aaaaaaaa-0000-0000-0000-000000000001') $$, 'release works');
select lives_ok($$ select public.release_minutes('aaaaaaaa-0000-0000-0000-000000000001') $$, 'release is idempotent');
select is((public.reserve_minutes('11111111-1111-1111-1111-111111111111', 'aaaaaaaa-0000-0000-0000-000000000003', 25) ->> 'ok')::boolean,
  true, 'released minutes can be used again');
select public.reserve_minutes('22222222-2222-2222-2222-222222222222', 'bbbbbbbb-0000-0000-0000-000000000001', 5);

-- ---- as user A ----
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}', true);

select results_eq('select count(*)::int from public.profiles', array[1], 'A sees only own profile');
select results_eq('select count(*)::int from public.rights_declarations', array[1], 'A sees only own rights declarations');
select results_eq('select count(*)::int from public.usage_events where user_id <> ''11111111-1111-1111-1111-111111111111''', array[0], 'A sees no usage of B');
select is(public.minutes_used('11111111-1111-1111-1111-111111111111'), 25.000::numeric, 'A sees own minutes used');
select is(public.minutes_used('22222222-2222-2222-2222-222222222222'), 0::numeric, 'A cannot compute B minutes');
select results_eq('select count(*)::int from public.plans', array[4], 'plans catalog is readable');

select lives_ok($$ update public.profiles set display_name = 'Alice' where id = '11111111-1111-1111-1111-111111111111' $$, 'A can rename themself');
select throws_ok($$ update public.profiles set plan_id = 'studio' where id = '11111111-1111-1111-1111-111111111111' $$, '42501', null, 'A cannot change own plan');
select throws_ok($$ update public.profiles set is_admin = true where id = '11111111-1111-1111-1111-111111111111' $$, '42501', null, 'A cannot make themself admin');
update public.profiles set display_name = 'hacked' where id = '22222222-2222-2222-2222-222222222222';
select throws_ok($$ insert into public.rights_declarations (user_id, content_kind, content_ref, statement_version, statement) values ('11111111-1111-1111-1111-111111111111', 'upload', 'x', 'v1', 'x') $$, '42501', null, 'A cannot write rights declarations directly');
select throws_ok($$ insert into public.usage_events (user_id, period_start, minutes, kind) values ('11111111-1111-1111-1111-111111111111', current_date, -1000, 'release') $$, '42501', null, 'A cannot credit themself minutes');
select throws_ok($$ select public.reserve_minutes('11111111-1111-1111-1111-111111111111', 'aaaaaaaa-0000-0000-0000-000000000002', 1) $$, '42501', null, 'A cannot call reserve_minutes');
select throws_ok($$ select public.release_minutes('aaaaaaaa-0000-0000-0000-000000000003') $$, '42501', null, 'A cannot call release_minutes');

-- ---- anonymous ----
reset role;
select is((select display_name from public.profiles where id = '22222222-2222-2222-2222-222222222222'), null, 'A update of B profile had no effect');
set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);
select throws_ok('select * from public.profiles', '42501', null, 'anon cannot read profiles');
select throws_ok('select * from public.usage_events', '42501', null, 'anon cannot read usage');

select * from finish();
rollback;
