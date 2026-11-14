import type { GpuInput } from "./types";

/**
 * Parse the output of
 *   nvidia-smi --query-gpu=name,memory.total --format=csv,noheader,nounits
 * One GPU per line: "NVIDIA GeForce RTX 3060, 12288". Lines that do not fit
 * are dropped; an empty result means "not detected", never a guess.
 */
export function parseNvidiaSmi(stdout: string): GpuInput[] {
  const out: GpuInput[] = [];
  for (const raw of stdout.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) continue;
    const i = line.lastIndexOf(",");
    if (i <= 0) continue;
    const name = line.slice(0, i).trim();
    const mem = line.slice(i + 1).trim();
    if (!name || !/^\d+$/.test(mem)) continue;
    const vramMb = Number(mem);
    if (vramMb < 256 || vramMb > 256 * 1024) continue;
    out.push({ name, vramMb, source: "nvidia-smi" });
  }
  return out;
}
