// Client for the opt-in global cluster (Supabase RPC over plain fetch, no SDK).
// The URL and anon key are public by design: the anon role can only call the
// three functions in supabase/migrations, never read or write the table.
import { CLUSTER_ANON_KEY, CLUSTER_URL, SITE_URL } from "./clusterConfig";

export interface RigPayload {
  /** Random per install (CLI) or per browser (web). Lets a re-run update instead of duplicate. */
  clientId: string;
  gpuModel: string;
  /** Per card. */
  vramGb: number;
  /** Identical cards in this rig (a multi-GPU server). Missing means 1. */
  gpuCount?: number;
  ramGb: number | null;
  generation: number | null;
  /** ISO 3166-1 alpha-2 guessed from the time zone, or null. Never from an IP. */
  country: string | null;
  source: "cli" | "web";
}

export interface Placement {
  rank: number;
  total: number;
  more_than_pct: number;
}
export interface SubmitResult extends Placement { id: string }
export interface RigView extends Placement {
  id: string;
  gpu_model: string;
  /** Per card. */
  vram_gb: number;
  /** Older rows may lack these; treat as 1 card and vram_gb. */
  gpu_count?: number;
  total_vram_gb?: number;
  ram_gb: number | null;
  generation: number | null;
  country: string | null;
  created_at: string;
}
export interface ClusterStats {
  total_rigs: number;
  total_gpus?: number;
  /** Sum of every rig's total VRAM (cards x per-card VRAM). */
  total_vram_gb: number;
  total_ram_gb: number;
  countries: { country: string; rigs: number; vram_gb: number }[];
  top_cards: { gpu_model: string; rigs: number; gpus?: number; vram_gb: number }[];
  /** Keyed by a rig's total VRAM. */
  histogram: { vram_gb: number; rigs: number }[];
  /** vram_gb here is the rig's total VRAM. */
  recent: { id: string; gpu_model: string; vram_gb: number; gpu_count?: number; country: string | null; created_at: string }[];
}

export type Result<T> = { ok: true; value: T } | { ok: false; reason: string };

export const clusterConfigured = () => CLUSTER_URL !== "" && CLUSTER_ANON_KEY !== "";
export const shareUrl = (id: string) => `${SITE_URL}/?rig=${encodeURIComponent(id)}`;

async function call<T>(path: string, body: Record<string, unknown>, timeoutMs = 8000): Promise<Result<T>> {
  if (!clusterConfigured()) return { ok: false, reason: "the cluster is not set up yet" };
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(`${CLUSTER_URL}${path}`, {
      method: "POST",
      headers: { apikey: CLUSTER_ANON_KEY, Authorization: `Bearer ${CLUSTER_ANON_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: ctrl.signal,
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      const msg = /"message":"([^"]+)"/.exec(text)?.[1];
      return { ok: false, reason: msg ?? `server answered ${res.status}` };
    }
    return { ok: true, value: (await res.json()) as T };
  } catch (e) {
    return { ok: false, reason: ctrl.signal.aborted ? "timed out" : e instanceof Error ? e.message : String(e) };
  } finally {
    clearTimeout(timer);
  }
}

const rpc = <T>(fn: string, body: Record<string, unknown>) => call<T>(`/rest/v1/rpc/${fn}`, body);

/** Join or update through the `join` edge function, the only write path, with a per-network limit. */
export function submitRig(p: RigPayload): Promise<Result<SubmitResult>> {
  return call<SubmitResult>("/functions/v1/join", {
    p_client_id: p.clientId,
    // Same charset the table enforces; anything else would make the insert fail.
    p_gpu_model: p.gpuModel.replace(/[^A-Za-z0-9 .+()\/_-]/g, "").replace(/\s+/g, " ").trim().slice(0, 60) || "Unknown GPU",
    p_vram_gb: p.vramGb,
    p_ram_gb: p.ramGb,
    p_generation: p.generation,
    p_country: p.country,
    p_source: p.source,
    p_gpu_count: gpuCountOf(p),
  });
}

/** 1 to 16, like the table allows. */
export const gpuCountOf = (p: { gpuCount?: number }) => Math.min(16, Math.max(1, Math.floor(p.gpuCount ?? 1) || 1));
/** "8x Tesla V100-SXM2" for a multi-GPU rig, the plain name otherwise. */
export const rigLabel = (model: string, count = 1) => (count > 1 ? `${count}x ${model}` : model);

/** Remove this install's entry. Needs the private client id, not the public share id. */
export const leaveCluster = (clientId: string) => rpc<{ removed: number }>("leave_cluster", { p_client_id: clientId });

export const fetchCluster = () => rpc<ClusterStats>("cluster_stats", {});
export const getRig = (id: string) => rpc<RigView | null>("get_rig", { p_id: id });

/** Exactly what will be sent, for showing before asking. */
export function describePayload(p: RigPayload): string[] {
  return [
    `gpu      ${p.gpuModel}`,
    ...(gpuCountOf(p) > 1
      ? [`gpus     ${gpuCountOf(p)}`, `vram     ${p.vramGb} GB each, ${p.vramGb * gpuCountOf(p)} GB total`]
      : [`vram     ${p.vramGb} GB`]),
    `ram      ${p.ramGb != null ? `${p.ramGb} GB` : "not sent"}`,
    `gen      ${p.generation != null ? `${p.generation} series` : "not sent"}`,
    `country  ${p.country ?? "not sent"} (from your time zone, not your IP)`,
    `source   ${p.source}`,
    `id       a random id, so running it again updates your entry`,
  ];
}
