-- GPU names are shown publicly: allow only the characters real card names use.
alter table public.rigs add constraint rigs_gpu_model_charset
  check (gpu_model ~ '^[A-Za-z0-9 .+()/_-]+$');
