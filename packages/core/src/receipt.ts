import { SKUS, STEAM_VRAM, STEAM_SURVEY_LABEL } from "./generated/data";
import { matchGpu, sizesFor } from "./match";
import { genMedianMbPerDollar, steamPlacement } from "./metrics";
import { VERDICTS } from "./verdicts";
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

/** Header right side. The page swaps this string for its own wording. */
export const RECEIPT_TAG = "(local run)";

const money = (n: number) => `$${Math.round(n).toLocaleString("en-US")}`;
const fixed1 = (n: number) => n.toFixed(1);

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

const IND = "       ";

function gpuBlock(gpu: GpuInput, m: MatchResult, paidUsd: number | null | undefined, first: boolean, count = 1): string[] {
  const out: string[] = [];
  const size = gpu.unified ? "unified memory" : m.vramGb != null ? `${m.vramGb} GB${count > 1 ? " each" : ""}` : "VRAM unknown";
  const gen = m.generation != null ? `GEN: ${m.generation}-series` : "";
  out.push(...row(`GPU    ${count > 1 ? `${count}x ` : ""}${m.displayName} (${size})`, gen));

  if (m.kind === "desktop-sku" && m.sku && m.sku.msrpUsd != null && m.sku.mbPerDollar != null) {
    const s = m.sku;
    out.push(`${IND}launch MSRP ${money(s.msrpUsd!)} (MSRP, not street price)`);
    if (s.msrpRealUsd != null) out.push(`${IND}= ${money(s.msrpRealUsd)} in today's dollars (CPI)`);
    out.push(...row(`${IND}VRAM per launch dollar`, `${fixed1(s.mbPerDollar!)} MB/$`));
    const med = genMedianMbPerDollar(s.generation, SKUS);
    if (med != null) out.push(...row(`${IND}vs gen median MSRP`, `${fixed1(med)} MB/$`));
  } else if (gpu.unified) {
    out.push(...wrap("shared with system RAM, so it is counted once, below", IND));
  } else if (m.kind === "laptop") {
    out.push(...wrap("laptop GPU: no launch MSRP in the dataset (desktop GeForce only)", IND));
  } else if (m.kind === "known-model-other-vram") {
    const sizes = sizesFor(m.displayName, SKUS).map((g) => `${g} GB`).join(" / ");
    out.push(...wrap(
      m.vramGb == null
        ? `sold as ${sizes}: say which one, e.g. --gpu "${m.displayName} ${sizesFor(m.displayName, SKUS)[0]}GB"`
        : `no ${m.vramGb} GB row for this model in the dataset (it lists ${sizes})`,
      IND,
    ));
  } else if (m.kind === "desktop-sku") {
    out.push(...wrap("no launch MSRP confirmed from a primary source for this card", IND));
  } else {
    out.push(...wrap("no launch MSRP in the dataset for this card (desktop GeForce only)", IND));
  }
  if (first && paidUsd != null) out.push(...row("PAID   (you typed it)", money(paidUsd)));
  return out;
}

export function buildReceipt(input: ReceiptInput): Receipt {
  const matches = input.gpus.map((g) => matchGpu(g, SKUS));
  const sources = [...new Set(input.gpus.map((g) => g.source))];
  const machine = sources.map((s) => (s === "nvidia-smi" || s === "systeminformation" ? `detected via ${s}` : s)).join(" + ");

  const lines: string[] = [];
  lines.push(...row("VRAM RECEIPT", RECEIPT_TAG));
  lines.push(...row(`DATE ${input.date}`, `MACHINE: ${machine}`));
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
  if (dedicated.length > 1) {
    const total = dedicated.reduce((s, m) => s + m.vramGb!, 0);
    lines.push(...row("TOTAL VRAM", `${total} GB across ${dedicated.length} GPUs`));
  }
  lines.push(RULE);
  lines.push(input.ramGb != null ? `SYSTEM RAM   ${input.ramGb} GB` : "SYSTEM RAM   not detected (pass --ram 32)");
  lines.push(RULE);

  // The tier uses the card with the most VRAM, times how many identical copies of it the
  // rig has; the Steam placement stays per card, since the survey counts single cards.
  const best = matches.filter((m) => m.vramGb != null).sort((a, b) => b.vramGb! - a.vramGb!)[0] ?? null;
  const bestCount = best ? matches.filter((m) => m.displayName === best.displayName && m.vramGb === best.vramGb).length : 0;
  const tier = best ? tierFor(best.vramGb! * bestCount) : null;
  if (tier) {
    lines.push(`TIER   ${tier.name.toUpperCase()}`);
    lines.push(...wrap(tier.line, IND));
  } else {
    lines.push("TIER   none (no dedicated VRAM size to rank)");
  }
  lines.push(RULE);
  const placement = best ? steamPlacement(best.vramGb!, STEAM_VRAM) : null;
  if (placement) {
    lines.push(`STEAM  your VRAM bin: ${placement.bin.bin}`);
    lines.push(`${IND}${placement.bin.sharePct.toFixed(2)}% of Steam survey machines (${STEAM_SURVEY_LABEL})`);
    lines.push(`${IND}more VRAM than ${fixed1(placement.moreThanPct)}% (method: METHOD.md)`);
  } else {
    lines.push("STEAM  no dedicated VRAM size to place on the survey");
  }
  const gen = matches.find((m) => m.generation != null && m.kind !== "not-in-dataset")?.generation;
  if (gen != null && VERDICTS[gen]) lines.push(...wrap(`VERDICT  ${VERDICTS[gen]}`, ""));
  lines.push(RULE);
  // A receipt ends with a thank-you. This one is a goodbye: he stepped down on Nov 12, 2026.
  lines.push(...row("THANK YOU, JENSEN.", "1993 to 2026"));
  lines.push(RULE);
  lines.push(`Data: ${DATA_URL} (CC BY-SA 4.0)`);
  lines.push("unofficial fan project, not affiliated with or endorsed by");
  lines.push("NVIDIA or Jensen Huang");

  const priced = matches.some((m) => m.kind === "desktop-sku" && m.sku?.msrpUsd != null);
  return { lines, text: lines.join("\n"), matches, priced, best, bestCount, tier };
}
