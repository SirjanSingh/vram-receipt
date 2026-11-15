-- Let people remove their own entry. Only the install's private client_id can do it;
-- the public id that appears in share links and cluster_stats cannot.
create or replace function public.leave_cluster(p_client_id uuid)
returns json language sql security definer set search_path = public as $$
  with d as (delete from rigs where client_id = p_client_id returning 1)
  select json_build_object('removed', (select count(*) from d));
$$;
grant execute on function public.leave_cluster(uuid) to anon;
