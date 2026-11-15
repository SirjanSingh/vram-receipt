-- The join edge function (submit_rig_gated) is now the only write path. Drop the old direct one
-- so nothing can skip the Turnstile check and the per-network limit.
drop function if exists public.submit_rig(uuid, text, numeric, int, int, text, text, int);
