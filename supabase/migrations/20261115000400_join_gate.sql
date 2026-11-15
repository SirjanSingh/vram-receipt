-- Spam gate. Joins now go through the `join` edge function, which checks Turnstile on the web and
-- passes a salted hash of the caller's IP here. The raw IP is never stored, and hashes are deleted
-- after a day.

create table public.join_log (
  ip_hash   text not null,
  client_id uuid not null,
  is_new    boolean not null,
  at        timestamptz not null default now()
);
create index join_log_ip_at_idx on public.join_log (ip_hash, at);
alter table public.join_log enable row level security;
revoke all on public.join_log from anon, authenticated;

create function public.submit_rig_gated(
  p_ip_hash text, p_client_id uuid, p_gpu_model text, p_vram_gb numeric, p_ram_gb int,
  p_generation int, p_country text, p_source text, p_gpu_count int default 1
) returns json language plpgsql security definer set search_path = public as $$
declare
  v_new boolean;
  v_id uuid;
  v_total numeric;
begin
  if p_ip_hash is null or char_length(p_ip_hash) <> 64 then
    raise exception 'bad request' using errcode = 'P0001';
  end if;
  -- One lock per network, so parallel requests from it are counted one at a time.
  perform pg_advisory_xact_lock(hashtext(p_ip_hash));
  delete from join_log where at < now() - interval '1 day';

  v_new := not exists (select 1 from rigs where client_id = p_client_id);
  if (select count(*) from join_log where ip_hash = p_ip_hash and at > now() - interval '1 hour') >= 10
     or (v_new and (select count(*) from join_log where ip_hash = p_ip_hash and is_new) >= 3) then
    raise exception 'rate_limited' using errcode = 'P0001';
  end if;
  -- Backstop for the whole cluster, well above what the per-network limit lets one caller do.
  if (select count(*) from join_log where at > now() - interval '10 seconds') >= 300 then
    raise exception 'busy' using errcode = 'P0001';
  end if;

  insert into rigs (client_id, gpu_model, vram_gb, ram_gb, generation, country, source, gpu_count)
  values (p_client_id, trim(p_gpu_model), p_vram_gb, p_ram_gb, p_generation, upper(nullif(p_country, '')), p_source,
          coalesce(p_gpu_count, 1))
  on conflict (client_id) do update set
    gpu_model = excluded.gpu_model, vram_gb = excluded.vram_gb, ram_gb = excluded.ram_gb,
    generation = excluded.generation, country = excluded.country, source = excluded.source,
    gpu_count = excluded.gpu_count, updated_at = now()
  returning id, total_vram_gb into v_id, v_total;
  insert into join_log (ip_hash, client_id, is_new) values (p_ip_hash, p_client_id, v_new);
  return (select json_build_object('id', v_id) :: jsonb || _placement(v_total) :: jsonb) :: json;
end;
$$;
revoke all on function public.submit_rig_gated(text, uuid, text, numeric, int, int, text, text, int) from public, anon, authenticated;
grant execute on function public.submit_rig_gated(text, uuid, text, numeric, int, int, text, text, int) to service_role;
