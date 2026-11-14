import { describe, expect, it } from "vitest";
import {
  SKUS, STEAM_VRAM, buildReceipt, genMedianMbPerDollar, matchGpu, median, nominalRamGb,
  parseNvidiaSmi, snapMbToGb, steamPlacement, WIDTH,
} from "./index";
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
      expect(r.text).not.toMatch(/[–—]/);
    }
  });
});
