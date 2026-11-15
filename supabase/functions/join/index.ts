// The only way to join the cluster. Web joins must carry a Turnstile token; CLI joins cannot solve
// one, so every join, with or without a token, gets the same per-network limit in submit_rig_gated.
// The caller's IP is hashed with a secret salt and never stored or logged in the clear.
//
// Secrets (set with `supabase secrets set`, never in the repo): TURNSTILE_SECRET, IP_SALT.
// SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are provided by the platform.

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const reply = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json" } });
const fail = (status: number, message: string) => reply(status, { message });

/** Cloudflare sets cf-connecting-ip in front of Supabase and drops a client's own copy. */
function clientIp(req: Request): string | null {
  const ip = req.headers.get("cf-connecting-ip") ?? req.headers.get("sb-forwarded-for");
  if (!ip) return null;
  // IPv6 users usually get a whole /64, so count the /64 as one network.
  if (ip.includes(":")) {
    // Expand "::" so compressed forms of the same /64 group together.
    const [head, tail = ""] = ip.trim().toLowerCase().split("::");
    const h = head ? head.split(":") : [];
    const t = tail ? tail.split(":") : [];
    const full = ip.includes("::") ? [...h, ...Array(8 - h.length - t.length).fill("0"), ...t] : h;
    return full.slice(0, 4).map((x) => x.replace(/^0+(?=.)/, "")).join(":") + "::/64";
  }
  return ip.trim();
}

async function sha256Hex(s: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function turnstileOk(token: string, ip: string, secret: string): Promise<boolean> {
  try {
    const res = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ secret, response: token, remoteip: ip }),
    });
    const data = await res.json();
    return data?.success === true;
  } catch {
    return false;
  }
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });
  if (req.method !== "POST") return fail(405, "POST only");

  const salt = Deno.env.get("IP_SALT");
  const secret = Deno.env.get("TURNSTILE_SECRET");
  const url = Deno.env.get("SUPABASE_URL");
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  // Fail closed: without its secrets the gate refuses everything.
  if (!salt || !secret || !url || !key) return fail(503, "Joining is paused right now.");

  const ip = clientIp(req);
  if (!ip) return fail(400, "Could not read your network address.");

  let b: Record<string, unknown>;
  try {
    b = await req.json();
  } catch {
    return fail(400, "Bad request.");
  }
  if (typeof b.p_client_id !== "string" || !UUID.test(b.p_client_id)) return fail(400, "Bad request.");

  const token = typeof b.turnstile_token === "string" ? b.turnstile_token.slice(0, 2048) : "";
  if (b.p_source === "web" || token) {
    if (!token || !(await turnstileOk(token, ip, secret))) return fail(403, "The human check failed. Reload and try again.");
  }

  const res = await fetch(`${url}/rest/v1/rpc/submit_rig_gated`, {
    method: "POST",
    headers: { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      p_ip_hash: await sha256Hex(`${salt}|${ip}`),
      p_client_id: b.p_client_id,
      p_gpu_model: b.p_gpu_model,
      p_vram_gb: b.p_vram_gb,
      p_ram_gb: b.p_ram_gb ?? null,
      p_generation: b.p_generation ?? null,
      p_country: b.p_country ?? null,
      // Without a token the join is a CLI join, whatever the body says.
      p_source: token ? "web" : "cli",
      p_gpu_count: b.p_gpu_count ?? 1,
    }),
  });
  if (res.ok) return reply(200, await res.json());

  // Generic messages only: database errors can echo the submitted row back.
  const text = await res.text().catch(() => "");
  if (text.includes("rate_limited")) return fail(429, "Too many joins from your network. Try again later.");
  if (text.includes("busy")) return fail(503, "The cluster is busy, try again in a minute.");
  return fail(400, "That rig did not pass the checks.");
});
