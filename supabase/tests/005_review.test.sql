-- Clip review columns stay server-managed; profile defaults are user-editable.
begin;
select plan(5);
insert into auth.users (id, email) values ('11111111-1111-1111-1111-111111111111', 'a@example.test');
insert into public.jobs (id, user_id, source_key, status) values ('aaaaaaaa-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', 's', 'succeeded');
insert into public.segments (id, job_id, user_id, rank, start_seconds, end_seconds, score_global, hook, autonomie, intensite, chute, justification, titre_propose, sentence_start, sentence_end)
  values ('aaaaaaaa-0000-0000-0000-0000000000a1', 'aaaaaaaa-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', 1, 0, 30, 80, 80, 80, 80, 80, 'j', 't', 0, 3);
insert into public.clips (job_id, segment_id, user_id, style, reframe_mode, storage_key, width, height, duration_seconds, bytes)
  values ('aaaaaaaa-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-0000000000a1', '11111111-1111-1111-1111-111111111111', 'impact', 'track', 'k', 1080, 1920, 30, 1);

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}', true);
select results_eq('select status from public.clips', array['pending_review'], 'new clips await review');
select throws_ok($$ update public.clips set status = 'approved' $$, '42501', null, 'clip status is changed through the API only');
select throws_ok($$ update public.segments set start_seconds = 1 $$, '42501', null, 'segment bounds are changed through the API only');
select lives_ok($$ update public.profiles set default_style = 'boite', default_with_hook = false where id = '11111111-1111-1111-1111-111111111111' $$, 'users set their defaults');
select throws_ok($$ update public.profiles set default_style = 'neon' where id = '11111111-1111-1111-1111-111111111111' $$, '23514', null, 'unknown styles are rejected');
select * from finish();
rollback;
