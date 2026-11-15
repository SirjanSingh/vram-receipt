import { readdirSync, readFileSync } from "node:fs";
import os from "node:os";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  SKUS, STEAM_VRAM, TIERS, buildReceipt, describePayload, genMedianMbPerDollar, matchGpu, median, nominalRamGb,
  parseNvidiaSmi, shareCardSvg, snapMbToGb, steamPlacement, tierFor, WIDTH,
} from "./index";
import type { RigPayload } from "./cluster";
import type { GpuInput } from "./types";

const flag = (name: string): GpuInput => ({ name, vramMb: null, source: "--gpu flag" });
const smi = (name: string, vramMb: number): GpuInput => ({ name, vramMb, source: "nvidia-smi" });

describe("parseNvidiaSmi", () => {
  it("parses one GPU", () => {
    expect(parseNvidiaSmi("NVIDIA GeForce RTX 4050 Laptop GPU, 6141\n")).toEqual([
      { name: "NVIDIA GeForce RTX 4050 Laptop GPU", vramMb: 6141, source: "nvidia-smi" },
    ]);
  });
  it("parses two GPUs with CRLF", () => {
    const out = parseNvidiaSmi("NVIDIA GeForce RTX 3090, 24576\r\nNVIDIA GeForce RTX 3060, 12288\r\n");
    expect(out.map((g) => g.vramMb)).toEqual([24576, 12288]);
  });
  it("returns nothing for errors and garbage, never a guess", () => {
    expect(parseNvidiaSmi("NVIDIA-SMI has failed because it couldn't communicate with the NVIDIA driver.")).toEqual([]);
    expect(parseNvidiaSmi("")).toEqual([]);
    expect(parseNvidiaSmi("Some GPU, [N/A]")).toEqual([]);
    expect(parseNvidiaSmi("Some GPU, 3")).toEqual([]);
  });
});

describe("snapMbToGb", () => {
  it.each([[6141, 6], [8188, 8], [11264, 11], [12282, 12], [24564, 24], [32607, 32], [3072, 3]])("%i MiB -> %i GB", (mb, gb) => {
    expect(snapMbToGb(mb)).toBe(gb);
  });
});

describe("matchGpu", () => {
  it("matches a desktop card from nvidia-smi", () => {
    const m = matchGpu(smi("NVIDIA GeForce RTX 3060", 12288), SKUS);
    expect(m.kind).toBe("desktop-sku");
    expect(m.sku?.skuId).toBe("rtx-3060-12gb");
  });
  it("uses VRAM to pick between sizes of the same model", () => {
    expect(matchGpu(smi("NVIDIA GeForce RTX 4060 Ti", 16380), SKUS).sku?.skuId).toBe("rtx-4060-ti-16gb");
    expect(matchGpu(smi("NVIDIA GeForce RTX 4060 Ti", 8188), SKUS).sku?.skuId).toBe("rtx-4060-ti-8gb");
    expect(matchGpu(smi("NVIDIA GeForce GTX 1060 3GB", 3072), SKUS).sku?.skuId).toBe("gtx-1060-3gb");
    expect(matchGpu(smi("NVIDIA GeForce GTX 1060 6GB", 6144), SKUS).sku?.skuId).toBe("gtx-1060-6gb");
  });
  it("never matches a laptop GPU to a desktop row", () => {
    for (const name of ["NVIDIA GeForce RTX 4050 Laptop GPU", "NVIDIA GeForce RTX 4060 Laptop GPU", "GeForce RTX 2070 with Max-Q Design", "NVIDIA GeForce RTX 3080 Ti Laptop GPU"]) {
      const m = matchGpu(smi(name, 8188), SKUS);
      expect(m.kind).toBe("laptop");
      expect(m.sku).toBeNull();
    }
    expect(matchGpu(smi("NVIDIA GeForce RTX 4050 Laptop GPU", 6141), SKUS).generation).toBe(40);
  });
  it("treats a desktop-named GPU in a laptop chassis as a laptop", () => {
    const m = matchGpu({ ...smi("GeForce GTX 1060", 6144), mobile: true }, SKUS);
    expect(m.kind).toBe("laptop");
  });
  it("keeps Ti and SUPER exact", () => {
    expect(matchGpu(flag("RTX 4070"), SKUS).sku?.skuId).toBe("rtx-4070-12gb");
    expect(matchGpu(flag("RTX 4070 SUPER"), SKUS).sku?.skuId).toBe("rtx-4070-super-12gb");
    expect(matchGpu(flag("rtx 4070 ti"), SKUS).sku?.skuId).toBe("rtx-4070-ti-12gb");
    expect(matchGpu(flag("RTX 4070 Ti Super"), SKUS).sku?.skuId).toBe("rtx-4070-ti-super-16gb");
    expect(matchGpu(flag("GTX 1650 Ti"), SKUS).kind).toBe("not-in-dataset");
    expect(matchGpu(flag("RTX 4090 D"), SKUS).kind).toBe("not-in-dataset");
  });
  it("reads the size from the --gpu flag", () => {
    expect(matchGpu(flag("RTX 3060 12GB"), SKUS).sku?.skuId).toBe("rtx-3060-12gb");
    expect(matchGpu(flag("RTX 3080 10 GB"), SKUS).sku?.skuId).toBe("rtx-3080-10gb");
  });
  it("accepts a model typed without its prefix", () => {
    expect(matchGpu(flag("3060 ti"), SKUS).sku?.skuId).toBe("rtx-3060-ti-8gb");
    expect(matchGpu(flag("4090"), SKUS).sku?.skuId).toBe("rtx-4090-24gb");
    expect(matchGpu(flag("1080 ti"), SKUS).sku?.skuId).toBe("gtx-1080-ti-11gb");
    expect(matchGpu(flag("1030"), SKUS).sku?.skuId).toBe("gt-1030-2gb");
    expect(matchGpu(flag("RX 7800 XT"), SKUS).kind).toBe("not-in-dataset");
    expect(matchGpu(smi("AMD Radeon RX 5700 XT", 8192), SKUS).kind).toBe("not-in-dataset");
    expect(matchGpu(flag("Intel Arc A770 16GB"), SKUS).kind).toBe("not-in-dataset");
    expect(matchGpu(flag("card from 2019"), SKUS).kind).toBe("not-in-dataset");
  });
  it("asks which size when the model has several and none was given", () => {
    const m = matchGpu(flag("RTX 3060"), SKUS);
    expect(m.kind).toBe("known-model-other-vram");
    expect(m.sku).toBeNull();
    expect(m.vramGb).toBeNull();
  });
  it("does not invent a row for a size the dataset lacks", () => {
    const m = matchGpu(flag("RTX 4090 48GB"), SKUS);
    expect(m.kind).toBe("known-model-other-vram");
    expect(m.sku).toBeNull();
  });
  it("leaves other vendors unmatched", () => {
    expect(matchGpu(smi("AMD Radeon RX 7800 XT", 16384), SKUS).kind).toBe("not-in-dataset");
    expect(matchGpu(flag("Intel(R) UHD Graphics 630"), SKUS).kind).toBe("not-in-dataset");
    expect(matchGpu(flag("nonsense"), SKUS).kind).toBe("not-in-dataset");
    expect(matchGpu({ name: "Apple M2", vramMb: null, source: "systeminformation", unified: true }, SKUS).vramGb).toBeNull();
  });
});

describe("metrics", () => {
  it("median", () => {
    expect(median([3, 1, 2])).toBe(2);
    expect(median([4, 1, 2, 3])).toBe(2.5);
    expect(median([])).toBeNull();
  });
  it("gen median only uses priced rows", () => {
    const priced = SKUS.filter((s) => s.generation === 40 && s.mbPerDollar != null).map((s) => s.mbPerDollar!);
    expect(genMedianMbPerDollar(40, SKUS)).toBe(median(priced));
  });
  it("steam percentile = bins strictly below, Other dropped", () => {
    const p = steamPlacement(8, STEAM_VRAM)!;
    expect(p.bin.bin).toBe("8 GB");
    // 512MB..6GB = 2.81+1.46+3.78+1.30+5.54+5.20 = 20.09 ; denominator = 100 - 1.38 (Other) = 98.62
    expect(p.moreThanPct).toBeCloseTo((20.09 / 98.62) * 100, 2);
    expect(steamPlacement(5, STEAM_VRAM)!.bin.bin).toBe("4 GB");
    expect(steamPlacement(48, STEAM_VRAM)!.bin.bin).toBe("32 GB");
    expect(steamPlacement(1, STEAM_VRAM)!.moreThanPct).toBeCloseTo((2.81 / 98.62) * 100, 2);
  });
  it("nominal RAM", () => {
    expect(nominalRamGb(15.7 * 1024 ** 3)).toBe(16);
    expect(nominalRamGb(31.9 * 1024 ** 3)).toBe(32);
    expect(nominalRamGb(7.6 * 1024 ** 3)).toBe(8);
    expect(nominalRamGb(64 * 1024 ** 3)).toBe(64);
  });
});

describe("dataset", () => {
  it("every priced row has a source and computed columns", () => {
    for (const s of SKUS.filter((x) => x.msrpUsd != null)) {
      expect(s.msrpSourceUrl, s.skuId).toMatch(/^https:\/\//);
      expect(s.mbPerDollar, s.skuId).toBeCloseTo((s.vramGb * 1024) / s.msrpUsd!, 1);
      expect(s.msrpRealUsd!, s.skuId).toBeGreaterThanOrEqual(s.msrpUsd!);
    }
  });
  it("covers all six generations", () => {
    expect([...new Set(SKUS.map((s) => s.generation))].sort((a, b) => a - b)).toEqual([10, 16, 20, 30, 40, 50]);
  });
});

describe("buildReceipt", () => {
  const date = "2026-11-16";
  it("full receipt for a priced desktop card", () => {
    const r = buildReceipt({ gpus: [flag("RTX 3060 12GB")], ramGb: 32, date });
    expect(r.priced).toBe(true);
    expect(r.text).toContain("launch MSRP $329 (MSRP, not street price)");
    expect(r.text).toContain("in today's dollars (CPI)");
    expect(r.text).toContain("VRAM per launch dollar");
    expect(r.text).toContain("vs gen median MSRP");
    expect(r.text).toContain("SYSTEM RAM   32 GB");
    expect(r.text).toContain("your VRAM bin: 12 GB");
    expect(r.text).toContain("Survived the shortage. Kept the card.");
    expect(r.text).toContain("not affiliated with or endorsed by");
  });
  it("no price block for a laptop GPU", () => {
    const r = buildReceipt({ gpus: [smi("NVIDIA GeForce RTX 4050 Laptop GPU", 6141)], ramGb: 16, date });
    expect(r.priced).toBe(false);
    expect(r.text).toContain("RTX 4050 Laptop GPU (6 GB)");
    expect(r.text).not.toContain("launch MSRP $");
    expect(r.text).toContain("your VRAM bin: 6 GB");
  });
  it("no price for a row without a confirmed MSRP", () => {
    const r = buildReceipt({ gpus: [flag("GTX 1050 Ti")], ramGb: 8, date });
    expect(r.priced).toBe(false);
    expect(r.text).toContain("no launch MSRP confirmed");
  });
  it("prints one block per GPU and places the larger one on Steam", () => {
    const r = buildReceipt({ gpus: [smi("NVIDIA GeForce RTX 3090", 24576), smi("NVIDIA GeForce RTX 3060", 12288)], ramGb: 64, date });
    expect(r.lines.filter((l) => l.startsWith("GPU")).length).toBe(2);
    expect(r.text).toContain("your VRAM bin: 24 GB");
  });
  it("unified memory is not double counted", () => {
    const r = buildReceipt({ gpus: [{ name: "Apple M2 Pro", vramMb: null, source: "systeminformation", unified: true }], ramGb: 32, date });
    expect(r.text).toContain("(unified memory)");
    expect(r.text).toContain("no dedicated VRAM size");
    expect(r.text).toContain("SYSTEM RAM   32 GB");
  });
  it("never exceeds the receipt width and has no em dashes", () => {
    const inputs = [
      [flag("RTX 3060 12GB")], [flag("RTX 3060")], [flag("RTX 4070 Ti SUPER")], [flag("RTX 4090 48GB")],
      [smi("NVIDIA GeForce RTX 4050 Laptop GPU", 6141)], [smi("AMD Radeon RX 7900 XTX", 24576)],
    ];
    for (const gpus of inputs) {
      const r = buildReceipt({ gpus, ramGb: 16, paidUsd: 450, date });
      for (const l of r.lines) expect(l.length, l).toBeLessThanOrEqual(WIDTH);
      expect(r.text).not.toMatch(/[\u2013\u2014]/);
    }
  });
});

describe("tiers", () => {
  it("boundaries: each tier starts at its minGb", () => {
    expect(tierFor(0).id).toBe("spare-change");
    expect(tierFor(2).id).toBe("spare-change");
    expect(tierFor(3.9).id).toBe("spare-change");
    expect(tierFor(4).id).toBe("tip-jar");
    expect(tierFor(6).id).toBe("tip-jar");
    expect(tierFor(8).id).toBe("keynote-ticket");
    expect(tierFor(11).id).toBe("keynote-ticket");
    expect(tierFor(12).id).toBe("front-row");
    expect(tierFor(16).id).toBe("backstage");
    expect(tierFor(20).id).toBe("backstage");
    expect(tierFor(24).id).toBe("leather-jacket");
    expect(tierFor(32).id).toBe("the-kitchen");
    expect(tierFor(192).id).toBe("the-kitchen");
    for (const t of TIERS) expect(tierFor(t.minGb)).toBe(t);
  });
  it("tier lines carry no numbers and no em dashes", () => {
    for (const t of TIERS) {
      expect(t.line, t.id).not.toMatch(/\d/);
      expect(t.line + t.name, t.id).not.toMatch(/[\u2013\u2014]/);
    }
  });
});

describe("receipt tier line", () => {
  const date = "2026-11-16";
  it("uses the card with the most VRAM", () => {
    const r = buildReceipt({ gpus: [smi("NVIDIA GeForce RTX 3060", 12288), smi("NVIDIA GeForce RTX 3090", 24576)], ramGb: 64, date });
    expect(r.tier?.id).toBe("leather-jacket");
    expect(r.best?.vramGb).toBe(24);
    expect(r.text).toContain("TIER   LEATHER JACKET");
    expect(r.text).toContain(tierFor(24).line);
  });
  it("header says local run and nothing that would become false after a join", () => {
    const r = buildReceipt({ gpus: [flag("RTX 3060 12GB")], ramGb: 32, date });
    expect(r.lines[0]).toMatch(/^VRAM RECEIPT +\(local run\)$/);
    expect(r.text).not.toContain("not uploaded");
  });
  it("no tier without a dedicated VRAM size", () => {
    const r = buildReceipt({ gpus: [{ name: "Apple M2 Pro", vramMb: null, source: "systeminformation", unified: true }], ramGb: 32, date });
    expect(r.tier).toBeNull();
    expect(r.text).toContain("TIER   none");
  });
  it("every tier fits the receipt width", () => {
    for (const t of TIERS) {
      const gb = Math.max(t.minGb, 2);
      const r = buildReceipt({ gpus: [flag(`RTX 4090 ${gb}GB`)], ramGb: 16, paidUsd: 450, date });
      expect(r.tier?.id).toBe(tierFor(gb).id);
      for (const l of r.lines) expect(l.length, l).toBeLessThanOrEqual(WIDTH);
      expect(r.text).not.toMatch(/[\u2013\u2014]/);
    }
  });
});

const payload: RigPayload = {
  clientId: "6f1c2a3b-4d5e-4f60-8a7b-9c0d1e2f3a4b", gpuModel: "RTX 3060", vramGb: 12, ramGb: 32,
  generation: 30, country: "IN", source: "cli",
};

describe("describePayload", () => {
  it("shows the fields and nothing that identifies the machine or person", () => {
    const text = describePayload(payload).join("\n");
    expect(text).toContain("RTX 3060");
    expect(text).toContain("12 GB");
    expect(text).toContain("32 GB");
    expect(text).toContain("IN");
    expect(text).not.toContain(payload.clientId);
    const host = os.hostname();
    const user = (() => { try { return os.userInfo().username; } catch { return ""; } })();
    if (host.length >= 3) expect(text.toLowerCase()).not.toContain(host.toLowerCase());
    if (user.length >= 3) expect(text.toLowerCase()).not.toContain(user.toLowerCase());
    for (const l of describePayload(payload)) expect(l).not.toMatch(/[\u2013\u2014]/);
  });
  it("says not sent for missing RAM and country", () => {
    const text = describePayload({ ...payload, ramGb: null, country: null }).join("\n");
    expect(text.match(/not sent/g)?.length).toBe(2);
  });
});

describe("shareCardSvg", () => {
  it("returns an SVG with the VRAM and an escaped tier name", () => {
    const tier = { ...tierFor(12), name: "Front <Row> & Co" };
    const svg = shareCardSvg({
      gpuModel: "RTX <3060> & friends", vramGb: 12, ramGb: 32, tier, rank: 7, total: 1234, moreThanPct: 40.5,
      date: "2026-11-15", fonts: { mono: "JetBrains Mono" },
    });
    expect(svg.trim()).toMatch(/^<svg[\s\S]*<\/svg>$/);
    expect(svg).toContain('xmlns="http://www.w3.org/2000/svg"');
    expect(svg).toContain("12");
    expect(svg).toMatch(/front &lt;row&gt; &amp; co/i);
    expect(svg).not.toMatch(/<row>/i);
    expect(svg).not.toContain("<3060>");
    expect(svg).not.toMatch(/[\u2013\u2014]/);
  });
  it("renders without a rank", () => {
    const svg = shareCardSvg({
      gpuModel: "RTX 3060", vramGb: 12, ramGb: null, tier: tierFor(12), rank: null, total: null, moreThanPct: null,
      date: "2026-11-15", fonts: { mono: "JetBrains Mono" },
    });
    expect(svg.trim()).toMatch(/^<svg[\s\S]*<\/svg>$/);
  });
});

describe("cluster client (configured, fetch mocked)", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.doUnmock("./clusterConfig");
    vi.resetModules();
  });
  const configured = async () => {
    vi.resetModules();
    vi.doMock("./clusterConfig", () => ({ CLUSTER_URL: "https://example.supabase.co", CLUSTER_ANON_KEY: "anon-key", SITE_URL: "https://site.example" }));
    return import("./cluster");
  };

  it("sends nothing when the config is empty", async () => {
    const spy = vi.fn();
    vi.stubGlobal("fetch", spy);
    vi.resetModules();
    vi.doMock("./clusterConfig", () => ({ CLUSTER_URL: "", CLUSTER_ANON_KEY: "", SITE_URL: "https://site.example" }));
    const c = await import("./cluster");
    expect(c.clusterConfigured()).toBe(false);
    const res = await c.submitRig(payload);
    expect(res.ok).toBe(false);
    expect(spy).not.toHaveBeenCalled();
  });

  it("submitRig posts exactly the payload fields and returns the placement", async () => {
    const spy = vi.fn(async (_url: string, _init: RequestInit) => new Response(JSON.stringify({ id: "abc", rank: 3, total: 10, more_than_pct: 70 }), { status: 200 }));
    vi.stubGlobal("fetch", spy);
    const c = await configured();
    expect(c.clusterConfigured()).toBe(true);
    const res = await c.submitRig(payload);
    expect(res).toEqual({ ok: true, value: { id: "abc", rank: 3, total: 10, more_than_pct: 70 } });
    expect(spy).toHaveBeenCalledTimes(1);
    const [url, init] = spy.mock.calls[0]!;
    expect(url).toBe("https://example.supabase.co/rest/v1/rpc/submit_rig");
    const body = JSON.parse(String(init.body));
    expect(Object.keys(body).sort()).toEqual(["p_client_id", "p_country", "p_generation", "p_gpu_count", "p_gpu_model", "p_ram_gb", "p_source", "p_vram_gb"]);
    expect(body.p_gpu_count).toBe(1);
    expect(body.p_vram_gb).toBe(12);
    expect(String(init.body)).not.toContain(os.hostname());
    expect(c.shareUrl("abc")).toBe("https://site.example/?rig=abc");
  });

  it("turns a server error into a reason instead of throwing", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response('{"message":"busy, try again in a minute"}', { status: 400 })));
    const c = await configured();
    expect(await c.submitRig(payload)).toEqual({ ok: false, reason: "busy, try again in a minute" });
  });

  it("turns a network failure into a reason", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => { throw new TypeError("fetch failed"); }));
    const c = await configured();
    expect(await c.submitRig(payload)).toEqual({ ok: false, reason: "fetch failed" });
  });
});

describe("no network outside the cluster client", () => {
  // Only packages/core/src/cluster.ts may talk to the network, and only with fetch,
  // after the person said yes. (The bundled systeminformation library ships helpers
  // for a website check and the Docker socket; nothing here calls them.)
  const others = /node:https?|node:net|node:dgram|node:tls|from "https?"|XMLHttpRequest|WebSocket|sendBeacon|inetChecksite|inetLatency|docker/;
  const banned = new RegExp(`\\bfetch\\(|${others.source}`);
  it("source files use no network API, except fetch in cluster.ts", () => {
    const dirs = [new URL("./", import.meta.url), new URL("../../cli/src/", import.meta.url)];
    let checked = 0;
    for (const dir of dirs) {
      for (const f of readdirSync(dir)) {
        if (!f.endsWith(".ts") || f.endsWith(".test.ts")) continue;
        const src = readFileSync(new URL(f, dir), "utf8");
        const isCluster = f === "cluster.ts" && dir.href.endsWith("/core/src/");
        expect((isCluster ? others : banned).test(src), f).toBe(false);
        checked++;
      }
    }
    expect(checked).toBeGreaterThan(10);
  });
  it("cluster.ts is the one file that calls fetch", () => {
    expect(readFileSync(new URL("./cluster.ts", import.meta.url), "utf8")).toMatch(/\bfetch\(/);
  });
});

describe("shipped cluster config", () => {
  it("ships only the public anon key, never a service-role key", async () => {
    const { CLUSTER_ANON_KEY } = await import("./clusterConfig");
    if (!CLUSTER_ANON_KEY) return;
    const claims = JSON.parse(Buffer.from(CLUSTER_ANON_KEY.split(".")[1]!, "base64url").toString("utf8"));
    expect(claims.role).toBe("anon");
  });
});

describe("multi-GPU servers", () => {
  const date = "2026-11-15";
  const v100 = () => smi("Tesla V100-SXM2-32GB", 32768);
  it("keeps the model name when the size is glued on with a dash", () => {
    expect(matchGpu(v100(), SKUS).displayName).toBe("Tesla V100-SXM2");
  });
  it("prints identical cards once with a count and a VRAM total", () => {
    const r = buildReceipt({ gpus: Array.from({ length: 8 }, v100), ramGb: 512, date });
    expect(r.lines.filter((l) => l.startsWith("GPU")).length).toBe(1);
    expect(r.text).toContain("8x Tesla V100-SXM2 (32 GB each)");
    expect(r.text).toMatch(/TOTAL VRAM\s+256 GB across 8 GPUs/);
    expect(r.tier?.id).toBe("the-kitchen");
  });
  it("keeps different cards on separate lines", () => {
    const r = buildReceipt({ gpus: [smi("NVIDIA GeForce RTX 3060", 12288), v100()], ramGb: 64, date });
    expect(r.lines.filter((l) => l.startsWith("GPU")).length).toBe(2);
  });
});
