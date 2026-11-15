// The page talks to the cluster only through this file.
//
// In production it delegates to the core client, which reads the public URL and anon key from
// packages/core/src/clusterConfig.ts. Until those are filled in, `configured()` is false and the
// page shows its honest "opens soon" state.
//
// DEV-ONLY OVERRIDE (stripped from production builds because `import.meta.env.DEV` is false there):
// set two localStorage keys in the browser console to point the dev page at any Supabase project,
// or at a Playwright route that fakes one:
//   localStorage.setItem("cluster-dev-url", "https://xyz.supabase.co")
//   localStorage.setItem("cluster-dev-key", "<anon key>")
// Remove them to go back to the real config.
import { clusterConfigured, fetchCluster as coreFetch, getRig as coreGet, leaveCluster as coreLeave, submitRig as coreSubmit, shareUrl } from "@vram-receipt/core";
import type { ClusterStats, Result, RigPayload, RigView, SubmitResult } from "@vram-receipt/core";

function devOverride(): { url: string; key: string } | null {
  if (!import.meta.env.DEV) return null;
  try {
    const url = localStorage.getItem("cluster-dev-url");
    const key = localStorage.getItem("cluster-dev-key");
    return url && key ? { url: url.replace(/\/$/, ""), key } : null;
  } catch {
    return null;
  }
}

async function devRpc<T>(o: { url: string; key: string }, fn: string, body: Record<string, unknown>): Promise<Result<T>> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 8000);
  try {
    const res = await fetch(`${o.url}/rest/v1/rpc/${fn}`, {
      method: "POST",
      headers: { apikey: o.key, Authorization: `Bearer ${o.key}`, "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: ctrl.signal,
    });
    if (!res.ok) return { ok: false, reason: `server answered ${res.status}` };
    const text = await res.text();
    return { ok: true, value: (text ? JSON.parse(text) : null) as T };
  } catch (e) {
    return { ok: false, reason: ctrl.signal.aborted ? "timed out" : e instanceof Error ? e.message : String(e) };
  } finally {
    clearTimeout(timer);
  }
}

export const configured = () => devOverride() != null || clusterConfigured();

export function fetchCluster(): Promise<Result<ClusterStats>> {
  const o = devOverride();
  return o ? devRpc<ClusterStats>(o, "cluster_stats", {}) : coreFetch();
}

export function getRig(id: string): Promise<Result<RigView | null>> {
  const o = devOverride();
  return o ? devRpc<RigView | null>(o, "get_rig", { p_id: id }) : coreGet(id);
}

export function leaveCluster(clientId: string): Promise<Result<{ removed: number }>> {
  const o = devOverride();
  return o ? devRpc<{ removed: number }>(o, "leave_cluster", { p_client_id: clientId }) : coreLeave(clientId);
}

export function submitRig(p: RigPayload): Promise<Result<SubmitResult>> {
  const o = devOverride();
  if (!o) return coreSubmit(p);
  return devRpc<SubmitResult>(o, "submit_rig", {
    p_client_id: p.clientId, p_gpu_model: p.gpuModel.slice(0, 60), p_vram_gb: p.vramGb, p_ram_gb: p.ramGb,
    p_generation: p.generation, p_country: p.country, p_source: p.source, p_gpu_count: p.gpuCount ?? 1,
  });
}

/** The public site root, derived from core's share URL (core does not export SITE_URL from its index). */
export const SITE = shareUrl("x").replace(/\/\?rig=x$/, "/");
export { shareUrl };

export const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Numbers come back from Postgres numeric as strings sometimes; normalise. */
export const num = (v: unknown) => (typeof v === "number" ? v : Number(v) || 0);
