-- Channel monitoring tables: isolation between users and server-only writes.
begin;
select plan(8);

insert into auth.users (id, email) values
  ('11111111-1111-1111-1111-111111111111', 'a@example.test'),
  ('22222222-2222-2222-2222-222222222222', 'b@example.test');
insert into public.channels (id, user_id, youtube_channel_id, title) values
  ('cccccccc-0000-0000-0000-00000000000a', '11111111-1111-1111-1111-111111111111', 'UCaaaaaaaaaaaaaaaaaaaaaa', 'A'),
  ('cccccccc-0000-0000-0000-00000000000b', '22222222-2222-2222-2222-222222222222', 'UCbbbbbbbbbbbbbbbbbbbbbb', 'B');
insert into public.channel_videos (channel_id, user_id, youtube_video_id, title, published_at) values
  ('cccccccc-0000-0000-0000-00000000000a', '11111111-1111-1111-1111-111111111111', 'aaaaaaaaaaa', 'a', now()),
  ('cccccccc-0000-0000-0000-00000000000b', '22222222-2222-2222-2222-222222222222', 'bbbbbbbbbbb', 'b', now());

select results_eq('select max_channels from public.plans order by sort', array[0, 0, 1, 5], 'channel limits per plan');
select throws_ok($$ insert into public.channels (user_id, youtube_channel_id, title) values ('11111111-1111-1111-1111-111111111111', 'not-a-channel', 'x') $$,
  '23514', null, 'channel ids are validated');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}', true);
select results_eq('select title from public.channels', array['A'], 'A sees only own channels');
select results_eq('select youtube_video_id from public.channel_videos', array['aaaaaaaaaaa'], 'A sees only own detected videos');
select throws_ok($$ insert into public.channels (user_id, youtube_channel_id, title) values ('11111111-1111-1111-1111-111111111111', 'UCcccccccccccccccccccccc', 'x') $$, '42501', null, 'A cannot add channels directly');
select throws_ok($$ update public.channels set auto_process = true $$, '42501', null, 'A cannot update channels directly');
select throws_ok($$ delete from public.channel_videos $$, '42501', null, 'A cannot delete detected videos directly');

reset role;
set local role anon;
select throws_ok('select * from public.channels', '42501', null, 'anon cannot read channels');

select * from finish();
rollback;
