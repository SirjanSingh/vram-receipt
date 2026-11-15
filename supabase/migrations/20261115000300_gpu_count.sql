-- Multi-GPU rigs: a server with 8 identical cards is one rig with gpu_count = 8.
-- vram_gb stays per card; total_vram_gb (per rig) drives totals, rank, tiers and the histogram.

alter table public.rigs
  add column gpu_count int not null default 1 check (gpu_count between 1 and 16),
  add column total_vram_gb numeric(7,1) generated always as (vram_gb * gpu_count) stored;
create index rigs_total_vram_idx on public.rigs (total_vram_gb);

-- Rank of a rig's total VRAM inside the cluster.
create or replace function public._placement(p_vram numeric)
returns json language sql stable security definer set search_path = public as $$
  select json_build_object(
    'rank', 1 + (select count(*) from rigs where total_vram_gb > p_vram),
    'total', (select count(*) from rigs),
    'more_than_pct', case when (select count(*) from rigs) = 0 then 0
      else round(100.0 * (select count(*) from rigs where total_vram_gb < p_vram) / (select count(*) from rigs), 1) end
  );
$$;
revoke all on function public._placement(numeric) from public, anon, authenticated;

-- New signature (extra p_gpu_count). The old one is dropped so PostgREST has one candidate;
-- p_gpu_count defaults to 1, so clients that do not send it keep working.
drop function if exists public.submit_rig(uuid, text, numeric, int, int, text, text);
create function public.submit_rig(
  p_client_id uuid, p_gpu_model text, p_vram_gb numeric, p_ram_gb int,
  p_generation int, p_country text, p_source text, p_gpu_count int default 1
) returns json language plpgsql security definer set search_path = public as $$
declare
  v_id uuid;
  v_total numeric;
begin
  -- Crude flood guard: the whole cluster accepts at most 60 writes per 10 seconds.
  if (select count(*) from rigs where updated_at > now() - interval '10 seconds') >= 60 then
    raise exception 'busy, try again in a minute' using errcode = 'P0001';
  end if;
  insert into rigs (client_id, gpu_model, vram_gb, ram_gb, generation, country, source, gpu_count)
  values (p_client_id, trim(p_gpu_model), p_vram_gb, p_ram_gb, p_generation, upper(nullif(p_country, '')), p_source,
          coalesce(p_gpu_count, 1))
  on conflict (client_id) do update set
    gpu_model = excluded.gpu_model, vram_gb = excluded.vram_gb, ram_gb = excluded.ram_gb,
    generation = excluded.generation, country = excluded.country, source = excluded.source,
    gpu_count = excluded.gpu_count, updated_at = now()
  returning id, total_vram_gb into v_id, v_total;
  return (select json_build_object('id', v_id) :: jsonb || _placement(v_total) :: jsonb) :: json;
end;
$$;
grant execute on function public.submit_rig(uuid, text, numeric, int, int, text, text, int) to anon;

create or replace function public.get_rig(p_id uuid)
returns json language sql stable security definer set search_path = public as $$
  select (json_build_object('id', id, 'gpu_model', gpu_model, 'vram_gb', vram_gb, 'gpu_count', gpu_count,
           'total_vram_gb', total_vram_gb, 'ram_gb', ram_gb,
           'generation', generation, 'country', country, 'created_at', created_at) :: jsonb
          || _placement(total_vram_gb) :: jsonb) :: json
  from rigs where id = p_id;
$$;

create or replace function public.cluster_stats()
returns json language sql stable security definer set search_path = public as $$
  select json_build_object(
    'total_rigs',    (select count(*) from rigs),
    'total_gpus',    (select coalesce(sum(gpu_count), 0) from rigs),
    'total_vram_gb', (select coalesce(sum(total_vram_gb), 0) from rigs),
    'total_ram_gb',  (select coalesce(sum(ram_gb), 0) from rigs),
    'countries', coalesce((select json_agg(c) from (
        select country, count(*) as rigs, sum(total_vram_gb) as vram_gb from rigs
        where country is not null group by country order by sum(total_vram_gb) desc limit 20) c), '[]'),
    'top_cards', coalesce((select json_agg(t) from (
        select gpu_model, count(*) as rigs, sum(gpu_count) as gpus, sum(total_vram_gb) as vram_gb from rigs
        group by gpu_model order by count(*) desc limit 10) t), '[]'),
    'histogram', coalesce((select json_agg(h) from (
        select total_vram_gb as vram_gb, count(*) as rigs from rigs group by total_vram_gb order by total_vram_gb) h), '[]'),
    'recent', coalesce((select json_agg(r) from (
        select id, gpu_model, total_vram_gb as vram_gb, gpu_count, country, created_at
        from rigs order by created_at desc limit 500) r), '[]')
  );
$$;
