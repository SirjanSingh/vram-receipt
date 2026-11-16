-- A "Thank you, Jensen" button. The page shows the running total. Clicks go through the `thanks`
-- edge function, which passes a salted IP hash so one network can't run the count up. Hashes are
-- deleted after a day, like join_log; the total itself keeps no hashes.

create table public.thanks_total (
  id    int primary key default 1 check (id = 1),
  total bigint not null default 0
);
insert into public.thanks_total default values;
alter table public.thanks_total enable row level security;
revoke all on public.thanks_total from anon, authenticated;

create table public.thanks_log (
  ip_hash text not null,
  at      timestamptz not null default now()
);
create index thanks_log_ip_at_idx on public.thanks_log (ip_hash, at);
alter table public.thanks_log enable row level security;
revoke all on public.thanks_log from anon, authenticated;

create function public.get_thanks() returns bigint
language sql stable security definer set search_path = public as $$
  select total from thanks_total where id = 1;
$$;
grant execute on function public.get_thanks() to anon, authenticated;

create function public.add_thanks_gated(p_ip_hash text) returns bigint
language plpgsql security definer set search_path = public as $$
declare
  v_total bigint;
begin
  if p_ip_hash is null or char_length(p_ip_hash) <> 64 then
    raise exception 'bad request' using errcode = 'P0001';
  end if;
  perform pg_advisory_xact_lock(hashtext('thanks|' || p_ip_hash));
  delete from thanks_log where at < now() - interval '1 day';
  -- Five per network per day is plenty for a household; past that the click just isn't counted.
  if (select count(*) from thanks_log where ip_hash = p_ip_hash) < 5 then
    insert into thanks_log (ip_hash) values (p_ip_hash);
    update thanks_total set total = total + 1 where id = 1 returning total into v_total;
  else
    select total into v_total from thanks_total where id = 1;
  end if;
  return v_total;
end;
$$;
revoke all on function public.add_thanks_gated(text) from public, anon, authenticated;
grant execute on function public.add_thanks_gated(text) to service_role;
