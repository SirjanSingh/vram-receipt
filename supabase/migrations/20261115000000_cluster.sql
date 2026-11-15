-- The global VRAM cluster. Anonymous clients never touch the table directly:
-- they can only call submit_rig, cluster_stats and get_rig (security definer).

create table public.rigs (
  id          uuid primary key default gen_random_uuid(),   -- public, used in share links
  client_id   uuid not null unique,                         -- random per install, never returned
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  gpu_model   text not null check (char_length(gpu_model) between 1 and 60),
  vram_gb     numeric(5,1) not null check (vram_gb > 0 and vram_gb <= 192),
  ram_gb      int check (ram_gb between 1 and 4096),
  generation  int check (generation in (10, 16, 20, 30, 40, 50)),
  country     text check (country ~ '^[A-Z]{2}$'),
  source      text not null check (source in ('cli', 'web'))
);
create index rigs_vram_idx on public.rigs (vram_gb);
create index rigs_created_idx on public.rigs (created_at desc);

alter table public.rigs enable row level security;  -- no policies on purpose
revoke all on public.rigs from anon, authenticated;

-- Rank of a VRAM size inside the cluster.
create or replace function public._placement(p_vram numeric)
returns json language sql stable security definer set search_path = public as $$
  select json_build_object(
    'rank', 1 + (select count(*) from rigs where vram_gb > p_vram),
    'total', (select count(*) from rigs),
    'more_than_pct', case when (select count(*) from rigs) = 0 then 0
      else round(100.0 * (select count(*) from rigs where vram_gb < p_vram) / (select count(*) from rigs), 1) end
  );
$$;

create or replace function public.submit_rig(
  p_client_id uuid, p_gpu_model text, p_vram_gb numeric, p_ram_gb int,
  p_generation int, p_country text, p_source text
) returns json language plpgsql security definer set search_path = public as $$
declare
  v_id uuid;
begin
  -- Crude flood guard: the whole cluster accepts at most 60 writes per 10 seconds.
  if (select count(*) from rigs where updated_at > now() - interval '10 seconds') >= 60 then
    raise exception 'busy, try again in a minute' using errcode = 'P0001';
  end if;
  insert into rigs (client_id, gpu_model, vram_gb, ram_gb, generation, country, source)
  values (p_client_id, trim(p_gpu_model), p_vram_gb, p_ram_gb, p_generation, upper(nullif(p_country, '')), p_source)
  on conflict (client_id) do update set
    gpu_model = excluded.gpu_model, vram_gb = excluded.vram_gb, ram_gb = excluded.ram_gb,
    generation = excluded.generation, country = excluded.country, source = excluded.source,
    updated_at = now()
  returning id into v_id;
  return (select json_build_object('id', v_id) :: jsonb || _placement(p_vram_gb) :: jsonb) :: json;
end;
$$;

create or replace function public.get_rig(p_id uuid)
returns json language sql stable security definer set search_path = public as $$
  select (json_build_object('id', id, 'gpu_model', gpu_model, 'vram_gb', vram_gb, 'ram_gb', ram_gb,
           'generation', generation, 'country', country, 'created_at', created_at) :: jsonb
          || _placement(vram_gb) :: jsonb) :: json
  from rigs where id = p_id;
$$;

create or replace function public.cluster_stats()
returns json language sql stable security definer set search_path = public as $$
  select json_build_object(
    'total_rigs',    (select count(*) from rigs),
    'total_vram_gb', (select coalesce(sum(vram_gb), 0) from rigs),
    'total_ram_gb',  (select coalesce(sum(ram_gb), 0) from rigs),
    'countries', coalesce((select json_agg(c) from (
        select country, count(*) as rigs, sum(vram_gb) as vram_gb from rigs
        where country is not null group by country order by sum(vram_gb) desc limit 20) c), '[]'),
    'top_cards', coalesce((select json_agg(t) from (
        select gpu_model, count(*) as rigs, sum(vram_gb) as vram_gb from rigs
        group by gpu_model order by count(*) desc limit 10) t), '[]'),
    'histogram', coalesce((select json_agg(h) from (
        select vram_gb, count(*) as rigs from rigs group by vram_gb order by vram_gb) h), '[]'),
    'recent', coalesce((select json_agg(r) from (
        select id, gpu_model, vram_gb, country, created_at from rigs order by created_at desc limit 500) r), '[]')
  );
$$;

revoke all on function public._placement(numeric) from public, anon, authenticated;
grant execute on function public.submit_rig(uuid, text, numeric, int, int, text, text) to anon;
grant execute on function public.get_rig(uuid) to anon;
grant execute on function public.cluster_stats() to anon;
