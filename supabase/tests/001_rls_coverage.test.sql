-- Fails if any table in the public schema lacks enabled+forced RLS or has no policy.
begin;
select plan(3);

select is_empty(
  $$ select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'public' and c.relkind in ('r', 'p') and not c.relrowsecurity $$,
  'RLS is enabled on every public table'
);

select is_empty(
  $$ select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'public' and c.relkind in ('r', 'p') and not c.relforcerowsecurity $$,
  'RLS is forced on every public table'
);

select is_empty(
  $$ select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'public' and c.relkind in ('r', 'p')
       and not exists (select 1 from pg_policies p
                       where p.schemaname = 'public' and p.tablename = c.relname) $$,
  'every public table has at least one policy'
);

select * from finish();
rollback;
