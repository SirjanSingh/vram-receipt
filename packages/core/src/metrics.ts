import type { Sku, SteamVramBin } from "./types";

export function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid]! : (s[mid - 1]! + s[mid]!) / 2;
}

/** Median VRAM per launch dollar over a generation's rows that have an MSRP. */
export function genMedianMbPerDollar(generation: number, skus: Sku[]): number | null {
  return median(skus.filter((s) => s.generation === generation && s.mbPerDollar != null).map((s) => s.mbPerDollar!));
}

export interface SteamPlacement {
  /** The survey bin this card falls in. */
  bin: SteamVramBin;
  /** Share of surveyed machines in bins strictly below it, "Other" dropped from the denominator. */
  moreThanPct: number;
}

/**
 * Place a nominal VRAM size on the Steam survey. The bin is the largest one
 * at or below the card's size (a 5 GB card lands in the 4 GB bin).
 */
export function steamPlacement(vramGb: number, bins: SteamVramBin[]): SteamPlacement | null {
  const known = bins.filter((b) => b.vramMb != null).sort((a, b) => a.vramMb! - b.vramMb!);
  const mb = vramGb * 1024;
  const atOrBelow = known.filter((b) => b.vramMb! <= mb);
  const bin = atOrBelow.at(-1);
  if (!bin) return null;
  const denominator = known.reduce((a, b) => a + b.sharePct, 0);
  const below = known.filter((b) => b.vramMb! < bin.vramMb!).reduce((a, b) => a + b.sharePct, 0);
  return { bin, moreThanPct: (below / denominator) * 100 };
}

/** os.totalmem()-style byte counts come in slightly under the installed size. */
export function nominalRamGb(bytes: number): number {
  const gib = bytes / 1024 ** 3;
  const sizes = [2, 4, 6, 8, 12, 16, 20, 24, 32, 36, 40, 48, 64, 96, 128, 192, 256, 384, 512];
  // Snap up to a common installed size when within 7% under it (firmware-reserved memory).
  for (const s of sizes) if (gib <= s && gib >= s * 0.93) return s;
  return Math.round(gib);
}
