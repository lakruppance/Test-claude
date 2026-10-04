-- User A must never read or modify user B's rows, and anon must see nothing.
begin;
select plan(20);

insert into auth.users (id, email) values
  ('11111111-1111-1111-1111-111111111111', 'a@example.test'),
  ('22222222-2222-2222-2222-222222222222', 'b@example.test');

insert into public.jobs (id, user_id, source_key, status) values
  ('aaaaaaaa-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', 'users/a/s.mp4', 'succeeded'),
  ('bbbbbbbb-0000-0000-0000-000000000001', '22222222-2222-2222-2222-222222222222', 'users/b/s.mp4', 'succeeded');

insert into public.job_steps (job_id, user_id, step) values
  ('aaaaaaaa-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', 'prepare'),
  ('bbbbbbbb-0000-0000-0000-000000000001', '22222222-2222-2222-2222-222222222222', 'prepare');

insert into public.transcripts (job_id, user_id, language, duration_seconds, source, words) values
  ('aaaaaaaa-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', 'fr', 10, 'test', '[]'),
  ('bbbbbbbb-0000-0000-0000-000000000001', '22222222-2222-2222-2222-222222222222', 'fr', 10, 'test', '[]');

insert into public.segments (id, job_id, user_id, rank, start_seconds, end_seconds, score_global, hook,
  autonomie, intensite, chute, justification, titre_propose, sentence_start, sentence_end) values
  ('aaaaaaaa-0000-0000-0000-0000000000a1', 'aaaaaaaa-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', 1, 0, 30, 80, 80, 80, 80, 80, 'j', 't', 0, 3),
  ('bbbbbbbb-0000-0000-0000-0000000000b1', 'bbbbbbbb-0000-0000-0000-000000000001', '22222222-2222-2222-2222-222222222222', 1, 0, 30, 80, 80, 80, 80, 80, 'j', 't', 0, 3);

insert into public.clips (job_id, segment_id, user_id, style, reframe_mode, storage_key, width, height, duration_seconds, bytes) values
  ('aaaaaaaa-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-0000000000a1', '11111111-1111-1111-1111-111111111111', 'impact', 'track', 'users/a/c.mp4', 1080, 1920, 30, 1),
  ('bbbbbbbb-0000-0000-0000-000000000001', 'bbbbbbbb-0000-0000-0000-0000000000b1', '22222222-2222-2222-2222-222222222222', 'impact', 'track', 'users/b/c.mp4', 1080, 1920, 30, 1);

insert into public.cost_events (job_id, user_id, step, provider, item, quantity, unit, usd) values
  ('aaaaaaaa-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', 'prepare', 'modal', 'x', 1, 'core_second', 0.01),
  ('bbbbbbbb-0000-0000-0000-000000000001', '22222222-2222-2222-2222-222222222222', 'prepare', 'modal', 'x', 1, 'core_second', 0.01);

-- ---- as user A ----
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}', true);

select results_eq('select count(*)::int from public.jobs', array[1], 'A sees exactly one job');
select results_eq('select user_id::text from public.jobs', array['11111111-1111-1111-1111-111111111111'], 'A sees only own job');
select results_eq('select count(*)::int from public.job_steps', array[1], 'A sees only own steps');
select results_eq('select count(*)::int from public.transcripts', array[1], 'A sees only own transcript');
select results_eq('select count(*)::int from public.segments', array[1], 'A sees only own segment');
select results_eq('select count(*)::int from public.clips', array[1], 'A sees only own clip');
select results_eq('select count(*)::int from public.cost_events', array[0], 'A cannot read cost events');
select is_empty($$ select 1 from public.jobs where id = 'bbbbbbbb-0000-0000-0000-000000000001' $$, 'A cannot fetch B job by id');

select throws_ok($$ update public.jobs set status = 'failed' where id = 'bbbbbbbb-0000-0000-0000-000000000001' $$, '42501', null, 'A cannot update B job');
select throws_ok($$ update public.jobs set status = 'failed' where id = 'aaaaaaaa-0000-0000-0000-000000000001' $$, '42501', null, 'A cannot update jobs directly (server-side only)');
select throws_ok($$ delete from public.clips $$, '42501', null, 'A cannot delete clips');
select throws_ok($$ insert into public.jobs (user_id, source_key) values ('22222222-2222-2222-2222-222222222222', 'x') $$, '42501', null, 'A cannot insert a job for B');
select throws_ok($$ insert into public.segments (job_id, user_id, rank, start_seconds, end_seconds, score_global, hook, autonomie, intensite, chute, justification, titre_propose, sentence_start, sentence_end) values ('bbbbbbbb-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', 9, 0, 1, 1, 1, 1, 1, 1, 'j', 't', 0, 0) $$, '42501', null, 'A cannot attach a segment to B job');

-- ---- as user B ----
select set_config('request.jwt.claims', '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}', true);
select results_eq('select id::text from public.jobs', array['bbbbbbbb-0000-0000-0000-000000000001'], 'B sees only own job');
select results_eq('select storage_key from public.clips', array['users/b/c.mp4'], 'B sees only own clip');

-- ---- anonymous ----
reset role;
set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);
select throws_ok('select * from public.jobs', '42501', null, 'anon cannot read jobs');
select throws_ok('select * from public.clips', '42501', null, 'anon cannot read clips');
select throws_ok('select * from public.transcripts', '42501', null, 'anon cannot read transcripts');
select throws_ok('select * from public.segments', '42501', null, 'anon cannot read segments');
select throws_ok('select * from public.cost_events', '42501', null, 'anon cannot read cost events');

select * from finish();
rollback;
