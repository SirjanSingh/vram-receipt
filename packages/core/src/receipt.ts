import { SKUS, STEAM_VRAM } from "./generated/data";
import { matchGpu, sizesFor } from "./match";
import { genMedianMbPerDollar, steamPlacement } from "./metrics";
import { tierFor } from "./tiers";
import type { Tier } from "./tiers";
import type { GpuInput, MatchResult } from "./types";

export const WIDTH = 60;
export const DATA_URL = "github.com/SirjanSingh/vram-receipt";
const RULE = "-".repeat(WIDTH);

export interface ReceiptInput {
  gpus: GpuInput[];
  /** Nominal system RAM in GB, or null when unknown. */
  ramGb: number | null;
  /** Optional self-reported price, printed as typed. */
  paidUsd?: number | null;
  /** ISO date (YYYY-MM-DD). */
  date: string;
}

export interface Receipt {
  lines: string[];
  text: string;
  matches: MatchResult[];
  /** True when at least one GPU got the full price block. */
  priced: boolean;
  /** The card with the most known VRAM, or null when no size is known. */
  best: MatchResult | null;
  /** How many cards are identical to the best one (8 on a DGX). */
  bestCount: number;
  /** Tier of the best card times bestCount, or null when no VRAM size is known. */
  tier: Tier | null;
}

const money = (n: number) => `$${Math.round(n).toLocaleString("en-US")}`;

/** Left text, right text, padded to the receipt width. Wraps the right part to its own line if it will not fit. */
function row(left: string, right = ""): string[] {
  if (!right) return [left];
  const gap = WIDTH - left.length - right.length;
  if (gap >= 1) return [left + " ".repeat(gap) + right];
  return [left, " ".repeat(Math.max(0, WIDTH - right.length)) + right];
}

function wrap(text: string, indent: string): string[] {
  const out: string[] = [];
  let line = indent;
  for (const word of text.split(" ")) {
    if (line.length + word.length + 1 > WIDTH && line.trim().length) {
      out.push(line.trimEnd());
      line = indent;
    }
    line += (line.trim().length ? " " : "") + word;
  }
  if (line.trim().length) out.push(line.trimEnd());
  return out;
}

const IND = "  ";

/** One sentence on value: memory per launch dollar against the typical card of its generation. */
function valueLine(mbPerDollar: number, generation: number): string | null {
  const med = genMedianMbPerDollar(generation, SKUS);
  if (med == null || med <= 0) return null;
  const r = mbPerDollar / med;
  if (r >= 1.15) return `Good value: ${r.toFixed(1)}x the memory per dollar of its series.`;
  if (r <= 0.87) return `Pricey: ${Math.round((1 - r) * 100)}% less memory per dollar than its series.`;
  return "Fair value: about average memory per dollar.";
}

function gpuBlock(gpu: GpuInput, m: MatchResult, paidUsd: number | null | undefined, first: boolean, count = 1): string[] {
  const out: string[] = [];
  out.push(...row("Graphics card", `${count > 1 ? `${count}x ` : ""}${m.displayName}`));
  const mem = gpu.unified ? "shared with RAM"
    : m.vramGb != null ? (count > 1 ? `${m.vramGb * count} GB (${count} x ${m.vramGb} GB)` : `${m.vramGb} GB`)
    : "unknown";
  out.push(...row(`${IND}Video memory (VRAM)`, mem));

  if (m.kind === "desktop-sku" && m.sku && m.sku.msrpUsd != null) {
    out.push(...row(`${IND}Price at launch`, money(m.sku.msrpUsd)));
  } else if (m.kind === "known-model-other-vram" && m.vramGb == null) {
    const sizes = sizesFor(m.displayName, SKUS);
    out.push(...wrap(`Sold as ${sizes.map((g) => `${g} GB`).join(" / ")}: run with --gpu "${m.displayName} ${sizes[0]}GB"`, IND));
  } else if (!gpu.unified) {
    out.push(...row(`${IND}Price at launch`, "not on file"));
  }
  if (first && paidUsd != null) out.push(...row(`${IND}You paid`, money(paidUsd)));
  return out;
}

export function buildReceipt(input: ReceiptInput): Receipt {
  const matches = input.gpus.map((g) => matchGpu(g, SKUS));

  const lines: string[] = [];
  lines.push(...row("VRAM RECEIPT", input.date));
  lines.push(RULE);
  // Identical cards (a multi-GPU server) print once with a count instead of N copies.
  const groups: { gpu: GpuInput; m: MatchResult; count: number }[] = [];
  input.gpus.forEach((g, i) => {
    const m = matches[i]!;
    const prev = groups[groups.length - 1];
    if (prev && prev.m.displayName === m.displayName && prev.m.vramGb === m.vramGb && prev.m.kind === m.kind && !!prev.gpu.unified === !!g.unified) prev.count++;
    else groups.push({ gpu: g, m, count: 1 });
  });
  groups.forEach((g, i) => lines.push(...gpuBlock(g.gpu, g.m, input.paidUsd, i === 0, g.count)));
  const dedicated = matches.filter((m, i) => !input.gpus[i]!.unified && m.vramGb != null);
  if (groups.length > 1 && dedicated.length > 1) {
    lines.push(...row("Total video memory", `${dedicated.reduce((s, m) => s + m.vramGb!, 0)} GB`));
  }
  lines.push(...row("System memory (RAM)", input.ramGb != null ? `${input.ramGb} GB` : "not detected (add --ram 32)"));
  lines.push(RULE);

  // The tier uses the card with the most VRAM, times how many identical copies of it the
  // rig has; the Steam placement stays per card, since the survey counts single cards.
  const best = matches.filter((m) => m.vramGb != null).sort((a, b) => b.vramGb! - a.vramGb!)[0] ?? null;
  const bestCount = best ? matches.filter((m) => m.displayName === best.displayName && m.vramGb === best.vramGb).length : 0;
  const tier = best ? tierFor(best.vramGb! * bestCount) : null;
  const placement = best ? steamPlacement(best.vramGb!, STEAM_VRAM) : null;
  if (placement) lines.push(...wrap(`More VRAM than ${Math.round(placement.moreThanPct)}% of gamers on Steam.`, ""));
  const priced = groups.find((g) => g.m.kind === "desktop-sku" && g.m.sku?.mbPerDollar != null);
  const value = priced ? valueLine(priced.m.sku!.mbPerDollar!, priced.m.sku!.generation) : null;
  if (value) lines.push(...wrap(value, ""));
  if (placement || value) lines.push(RULE);
  if (tier) {
    lines.push(...row("YOUR RANK", tier.name.toUpperCase()));
    lines.push(...wrap(tier.line, ""));
  } else {
    lines.push(...row("YOUR RANK", "none (no separate video memory)"));
  }
  lines.push(RULE);
  // A receipt ends with a thank-you. This one is a goodbye: he stepped down on Nov 12, 2026.
  lines.push(...row("THANK YOU, JENSEN.", "1993 to 2026"));

  return { lines, text: lines.join("\n"), matches, priced: !!groups.find((g) => g.m.kind === "desktop-sku" && g.m.sku?.msrpUsd != null), best, bestCount, tier };
}
