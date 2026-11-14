import type { GpuInput, MatchResult, Sku } from "./types";

const LAPTOP = /\b(laptop|notebook|mobile|max-?q)\b|\bMX\s?\d{3}\b/i;
const MODEL = /(?:\b(GTX|RTX|GT)\s*)?\b(\d{4})(?:\s*(Ti))?(?:\s*(SUPER))?(?:\s+(D)\b)?/i;

/** Strip vendor noise so "NVIDIA GeForce RTX 3060" and "rtx3060" look alike. */
export function cleanName(name: string): string {
  return name
    .replace(/\((TM|R)\)|[™®]/gi, " ")
    .replace(/\b(NVIDIA|GeForce)\b/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** A trailing "12GB" / "12 GB" typed after the model, as in --gpu "RTX 3060 12GB". */
export function vramHintGb(name: string): number | null {
  const m = name.match(/(\d{1,3})\s*GB\b/i);
  return m ? Number(m[1]) : null;
}

/** nvidia-smi reports slightly under nominal (6141 MiB for a 6 GB card). Snap to whole GB. */
export function snapMbToGb(mb: number): number {
  return Math.max(1, Math.round(mb / 1024));
}

export function generationOf(modelNumber: number): number | null {
  if (modelNumber >= 1000 && modelNumber < 1100) return 10;
  if (modelNumber >= 1600 && modelNumber < 1700) return 16;
  for (const g of [20, 30, 40, 50]) if (modelNumber >= g * 100 && modelNumber < g * 100 + 100) return g;
  return null;
}

/**
 * Match a reported GPU against the dataset. Rules:
 * - laptop / Max-Q / mobile parts never match a desktop row;
 * - Ti and SUPER must match exactly;
 * - VRAM picks the row for models sold with more than one size;
 * - no fuzzy fallback. No match means no price, never a guess.
 */
export function matchGpu(input: GpuInput, skus: Sku[]): MatchResult {
  const displayName = cleanName(input.name).replace(/\s*\d{1,3}\s*GB\b/i, "").trim() || input.name.trim();
  const hint = vramHintGb(input.name);
  const vramGb = input.unified ? null : input.vramMb != null ? snapMbToGb(input.vramMb) : hint;
  const none = (kind: MatchResult["kind"], generation: number | null, v: number | null = vramGb): MatchResult => ({
    kind, sku: null, generation, vramGb: v, displayName,
  });

  const m = cleanName(input.name).match(MODEL);
  if (!m || input.unified) return none("not-in-dataset", null);
  const [, typedPrefix, numStr, ti, sup, dSuffix] = m;
  const generation = generationOf(Number(numStr));
  // "3060 ti" typed without its prefix: only accepted for a GeForce model number.
  if (!typedPrefix && (generation == null || /radeon|rx|arc|intel|amd/i.test(input.name))) return none("not-in-dataset", null);
  const prefix = typedPrefix ?? (generation! >= 20 ? "RTX" : /^10[13]0$/.test(numStr!) ? "GT" : "GTX");
  if (generation == null) return none("not-in-dataset", null);
  if (LAPTOP.test(input.name) || input.mobile) return none("laptop", generation);
  if (dSuffix) return none("not-in-dataset", generation);

  const model = `${prefix.toUpperCase()} ${numStr}${ti ? " Ti" : ""}${sup ? " SUPER" : ""}`;
  const candidates = skus.filter((s) => s.model.toLowerCase() === model.toLowerCase());
  if (candidates.length === 0) return none("not-in-dataset", generation);

  if (vramGb == null) {
    // Only safe when the model was sold with a single memory size.
    if (candidates.length === 1) {
      const sku = candidates[0]!;
      return { kind: "desktop-sku", sku, generation: sku.generation, vramGb: sku.vramGb, displayName: sku.model };
    }
    return { kind: "known-model-other-vram", sku: null, generation, vramGb: null, displayName: model };
  }
  const sku = candidates.find((s) => s.vramGb === vramGb) ?? null;
  if (!sku) return { kind: "known-model-other-vram", sku: null, generation, vramGb, displayName: model };
  return { kind: "desktop-sku", sku, generation: sku.generation, vramGb, displayName: sku.model };
}

/** Memory sizes the dataset knows for a model, used in the "which one?" hint. */
export function sizesFor(model: string, skus: Sku[]): number[] {
  return skus.filter((s) => s.model.toLowerCase() === model.toLowerCase()).map((s) => s.vramGb).sort((a, b) => a - b);
}
