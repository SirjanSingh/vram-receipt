import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import { join } from "node:path";
import { PassThrough } from "node:stream";
import { afterEach, describe, expect, it } from "vitest";
import { buildReceipt, matchGpu, SKUS } from "@vram-receipt/core";
import { ArgError, parseArgs } from "./args";
import { describePayload } from "@vram-receipt/core";
import { askYesNo, buildPayload, clientIdFor, decideJoin, readClientId, saveClientId } from "./join";

describe("parseArgs", () => {
  it("defaults: no join either way", () => {
    const a = parseArgs([]);
    expect(a.join).toBe(false);
    expect(a.noJoin).toBe(false);
  });
  it("--join and --no-join", () => {
    expect(parseArgs(["--join"]).join).toBe(true);
    expect(parseArgs(["--no-join"]).noJoin).toBe(true);
    expect(() => parseArgs(["--join", "--no-join"])).toThrow(ArgError);
  });
  it("keeps the old flags", () => {
    const a = parseArgs(["--gpu", "RTX 3060 12GB", "--ram=32", "--paid", "$450", "--no-png", "--json"]);
    expect(a).toMatchObject({ gpus: ["RTX 3060 12GB"], ram: 32, paid: 450, noPng: true, json: true });
    expect(parseArgs(["-h"]).help).toBe(true);
    expect(() => parseArgs(["--ram", "0"])).toThrow(ArgError);
    expect(() => parseArgs(["--joinn"])).toThrow(/Unknown option/);
    expect(() => parseArgs(["--gpu"])).toThrow(/needs a value/);
  });
});

describe("decideJoin", () => {
  const base = { join: false, noJoin: false, json: false, interactive: true, configured: true, hasPayload: true };
  it("asks only in a terminal with no flag", () => {
    expect(decideJoin(base)).toBe("ask");
    expect(decideJoin({ ...base, interactive: false })).toBe("hint");
  });
  it("--join sends without asking, in or out of a terminal", () => {
    expect(decideJoin({ ...base, join: true })).toBe("send");
    expect(decideJoin({ ...base, join: true, interactive: false })).toBe("send");
    expect(decideJoin({ ...base, join: true, json: true })).toBe("send");
  });
  it("--no-join, --json and nothing to send never ask or send", () => {
    expect(decideJoin({ ...base, noJoin: true })).toBe("skip");
    expect(decideJoin({ ...base, json: true })).toBe("skip");
    expect(decideJoin({ ...base, hasPayload: false, join: true })).toBe("skip");
  });
  it("an unconfigured cluster never asks or sends", () => {
    expect(decideJoin({ ...base, configured: false })).toBe("closed");
    expect(decideJoin({ ...base, configured: false, join: true })).toBe("closed");
    expect(decideJoin({ ...base, configured: false, join: true, json: true })).toBe("skip");
    expect(decideJoin({ ...base, configured: false, noJoin: true })).toBe("skip");
  });
});

describe("askYesNo", () => {
  const ask = (answer: string | null) => {
    const input = new PassThrough();
    const output = new PassThrough();
    const p = askYesNo("Add? [y/N] ", input, output);
    if (answer == null) input.end();
    else input.write(`${answer}\n`);
    return p;
  };
  it("yes only on y or yes", async () => {
    expect(await ask("y")).toBe(true);
    expect(await ask("YES")).toBe(true);
    expect(await ask("")).toBe(false);
    expect(await ask("n")).toBe(false);
    expect(await ask("sure")).toBe(false);
  });
  it("closed input is a no", async () => {
    expect(await ask(null)).toBe(false);
  });
});

describe("buildPayload", () => {
  const m = (name: string, vramMb: number | null) => matchGpu({ name, vramMb, source: "nvidia-smi" }, SKUS);
  const id = "6f1c2a3b-4d5e-4f60-8a7b-9c0d1e2f3a4b";
  it("sends the card, sizes, generation, a zone-based country and nothing else", () => {
    const p = buildPayload(m("NVIDIA GeForce RTX 3060", 12288), 31.6, id, "Asia/Kolkata")!;
    expect(p).toEqual({ clientId: id, gpuModel: "RTX 3060", vramGb: 12, gpuCount: 1, ramGb: 32, generation: 30, country: "IN", source: "cli" });
    expect(Object.keys(p).sort()).toEqual(["clientId", "country", "generation", "gpuCount", "gpuModel", "ramGb", "source", "vramGb"]);
    expect(buildPayload(m("NVIDIA GeForce RTX 3060", 12288), null, id, "Etc/UTC")!.country).toBeNull();
  });
  it("lists generation and source in the preview", () => {
    const lines = describePayload(buildPayload(m("NVIDIA GeForce RTX 3060", 12288), 32, id)!).join("\n");
    expect(lines).toContain("30 series");
    expect(lines).toContain("cli");
  });
  it("sends every identical card of a multi-GPU server, per-card VRAM plus a count", () => {
    const v100 = { name: "Tesla V100-SXM2-32GB", vramMb: 32768, source: "nvidia-smi" as const };
    const r = buildReceipt({ gpus: Array.from({ length: 8 }, () => v100), ramGb: 512, date: "2026-11-15" });
    expect(r.bestCount).toBe(8);
    const p = buildPayload(r.best, 512, id, "Asia/Kolkata", r.bestCount)!;
    expect(p).toMatchObject({ gpuModel: "Tesla V100-SXM2", vramGb: 32, gpuCount: 8 });
    const lines = describePayload(p).join("\n");
    expect(lines).toContain("gpus     8");
    expect(lines).toContain("32 GB each, 256 GB total");
    expect(buildPayload(r.best, 512, id, undefined, 99)!.gpuCount).toBe(16);
  });
  it("nothing to send without a known VRAM size", () => {
    expect(buildPayload(null, 32, id)).toBeNull();
    expect(buildPayload(matchGpu({ name: "RTX 3060", vramMb: null, source: "--gpu flag" }, SKUS), 32, id)).toBeNull();
    expect(buildPayload(matchGpu({ name: "Apple M2", vramMb: null, source: "systeminformation", unified: true }, SKUS), 32, id)).toBeNull();
  });
});

describe("client id", () => {
  const dirs: string[] = [];
  const tmp = () => {
    const d = mkdtempSync(join(os.tmpdir(), "vr-id-"));
    dirs.push(d);
    return d;
  };
  afterEach(() => {
    for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
  });
  it("is not created until it is saved, then is reused", () => {
    const dir = join(tmp(), ".vram-receipt");
    const first = clientIdFor(dir);
    expect(first.saved).toBe(false);
    expect(readClientId(dir)).toBeNull();
    expect(saveClientId(first.id, dir)).toBe(true);
    expect(clientIdFor(dir)).toEqual({ id: first.id, saved: true });
  });
  it("replaces a corrupt id file", () => {
    const dir = tmp();
    writeFileSync(join(dir, "id"), "not-a-uuid");
    const c = clientIdFor(dir);
    expect(c.saved).toBe(false);
    expect(c.id).toMatch(/^[0-9a-f-]{36}$/);
    expect(readFileSync(join(dir, "id"), "utf8")).toBe("not-a-uuid");
  });
  it("an unwritable folder falls back to a fresh id per run", () => {
    const file = join(tmp(), "a-file");
    writeFileSync(file, "x");
    expect(saveClientId("6f1c2a3b-4d5e-4f60-8a7b-9c0d1e2f3a4b", join(file, "sub"))).toBe(false);
  });
});
