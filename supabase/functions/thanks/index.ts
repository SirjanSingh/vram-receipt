// The "Thank you, Jensen" button. Counts a click, at most five per network per day, and returns
// the new total. The caller's IP is hashed with the same secret salt as `join` and never stored.

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const reply = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json" } });

function clientIp(req: Request): string | null {
  const ip = req.headers.get("cf-connecting-ip") ?? req.headers.get("sb-forwarded-for");
  if (!ip) return null;
  if (ip.includes(":")) {
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

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });
  if (req.method !== "POST") return reply(405, { message: "POST only" });
  const salt = Deno.env.get("IP_SALT");
  const url = Deno.env.get("SUPABASE_URL");
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!salt || !url || !key) return reply(503, { message: "Paused right now." });
  const ip = clientIp(req);
  if (!ip) return reply(400, { message: "Could not read your network address." });

  const res = await fetch(`${url}/rest/v1/rpc/add_thanks_gated`, {
    method: "POST",
    headers: { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({ p_ip_hash: await sha256Hex(`thanks|${salt}|${ip}`) }),
  });
  if (!res.ok) return reply(503, { message: "Try again in a minute." });
  return reply(200, { total: await res.json() });
});
