export interface Sku {
  skuId: string;
  model: string;
  generation: number;
  vramGb: number;
  memType: string;
  launchDate: string;
  msrpUsd: number | null;
  fePriceUsd: number | null;
  msrpSourceUrl: string | null;
  msrpRealUsd: number | null;
  mbPerDollar: number | null;
  mbPerRealDollar: number | null;
  notes: string;
}

export interface SteamVramBin {
  bin: string;
  vramMb: number | null;
  sharePct: number;
}

export interface SteamRamBin {
  bin: string;
  ramGb: number | null;
  sharePct: number;
}

/** A GPU as reported by the machine or typed by the user. */
export interface GpuInput {
  /** Name exactly as reported or typed. */
  name: string;
  /** Dedicated memory in MiB, or null when it is unknown or untrustworthy. */
  vramMb: number | null;
  /** How we learned about it, printed on the receipt. */
  source: "nvidia-smi" | "systeminformation" | "--gpu flag" | "picked on the page";
  /** Apple Silicon and similar: memory is shared with system RAM. */
  unified?: boolean;
  /** The machine is a laptop. 10 and 20 series notebook GPUs report desktop names, so the name alone is not enough. */
  mobile?: boolean;
}

export type MatchKind = "desktop-sku" | "known-model-other-vram" | "laptop" | "not-in-dataset";

export interface MatchResult {
  kind: MatchKind;
  sku: Sku | null;
  /** Generation when it can be read from the name, even without a SKU match. */
  generation: number | null;
  /** Nominal VRAM in GB after snapping, or null when unknown. */
  vramGb: number | null;
  /** Cleaned display name. */
  displayName: string;
}
