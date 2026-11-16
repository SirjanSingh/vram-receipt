// Rankings: your percentile, countries, top cards. Everything is built with textContent because
// gpu_model and country come from other people's submissions.
import { STEAM_SURVEY_LABEL, STEAM_VRAM, TIERS, countryName, steamPlacement, tierFor } from "@vram-receipt/core";
import type { ClusterStats } from "@vram-receipt/core";
import { num } from "./api";

const $ = (id: string) => document.getElementById(id)!;
const h = <K extends keyof HTMLElementTagNameMap>(tag: K, cls?: string, text?: string) => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text != null) e.textContent = text;
  return e;
};
const fmtGb = (gb: number) => (gb >= 1000 ? `${(gb / 1000).toFixed(gb >= 10000 ? 0 : 1)} TB` : `${Math.round(gb).toLocaleString("en-US")} GB`);
const fmtPct = (p: number) => (p >= 10 ? p.toFixed(0) : p.toFixed(1));

export interface YouState {
  vramGb: number;
  /** Server placement once joined. */
  joined: { rank: number; total: number; moreThanPct: number } | null;
}

/** Same definition as _placement in the SQL: share of rigs with strictly less VRAM. */
export function estimatePct(stats: ClusterStats, vramGb: number) {
  const total = num(stats.total_rigs);
  if (!total) return null;
  const less = stats.histogram.filter((b) => num(b.vram_gb) < vramGb).reduce((a, b) => a + num(b.rigs), 0);
  return { pct: (100 * less) / total, rank: 1 + stats.histogram.filter((b) => num(b.vram_gb) > vramGb).reduce((a, b) => a + num(b.rigs), 0), total };
}

function ring(pct: number, color: string) {
  const r = 52, c = 2 * Math.PI * r;
  const ns = "http://www.w3.org/2000/svg";
  const svg = document.createElementNS(ns, "svg");
  svg.setAttribute("viewBox", "0 0 128 128");
  svg.setAttribute("aria-hidden", "true");
  svg.innerHTML = `<circle cx="64" cy="64" r="${r}" fill="none" stroke="#2d2c27" stroke-width="10"/>
    <circle class="ring-fg" cx="64" cy="64" r="${r}" fill="none" stroke="${color}" stroke-width="10" stroke-linecap="round"
      stroke-dasharray="${c}" stroke-dashoffset="${c}" transform="rotate(-90 64 64)" style="--to:${c * (1 - Math.max(0, Math.min(100, pct)) / 100)}"/>`;
  return svg;
}

export function renderYou(you: YouState, stats: ClusterStats | null, configured: boolean) {
  const host = $("pct");
  const cap = $("pct-cap");
  const color = tierFor(you.vramGb).color;
  let pct: number;
  let caption: string;
  let big: string;
  if (you.joined) {
    pct = you.joined.moreThanPct;
    big = `${fmtPct(pct)}%`;
    caption = `of the cluster has less VRAM than you. Rank #${you.joined.rank.toLocaleString("en-US")} of ${you.joined.total.toLocaleString("en-US")}.`;
  } else if (stats && num(stats.total_rigs) > 0) {
    const e = estimatePct(stats, you.vramGb)!;
    pct = e.pct;
    big = `${fmtPct(pct)}%`;
    caption = `of the cluster has less VRAM than you. Estimate before joining: about #${e.rank.toLocaleString("en-US")}.`;
  } else {
    const place = steamPlacement(you.vramGb, STEAM_VRAM);
    pct = place ? place.moreThanPct : 0;
    big = `${fmtPct(pct)}%`;
    caption = `of Steam survey machines (${STEAM_SURVEY_LABEL}) have less VRAM than you. ${configured ? "Cluster ranks appear as rigs join." : "Cluster ranks start when it opens."}`;
  }
  const wrap = h("div", "pct-ring");
  wrap.append(ring(pct, color), h("span", "pct-num", big));
  host.replaceChildren(wrap);
  cap.textContent = caption;
  requestAnimationFrame(() => wrap.classList.add("run"));
}

function bars(host: HTMLElement, rows: { label: string; sub: string; value: number; color?: string }[], empty: string) {
  if (!rows.length) {
    host.replaceChildren(h("li", "empty", empty));
    return;
  }
  const max = Math.max(...rows.map((r) => r.value));
  host.replaceChildren(
    ...rows.map((r, i) => {
      const li = h("li");
      li.style.setProperty("--w", `${Math.max(3, (100 * r.value) / max)}%`);
      li.style.setProperty("--d", `${i * 60}ms`);
      if (r.color) li.style.setProperty("--c", r.color);
      li.append(h("span", "bar"), h("span", "b-label", r.label), h("span", "b-sub", r.sub));
      return li;
    }),
  );
}

export function renderBoards(stats: ClusterStats | null, configured: boolean, failed: boolean) {
  const emptyMsg = !configured ? "Opens with the cluster." : failed ? "Couldn't reach the cluster." : "No rigs yet. Be the first.";
  const countries = (stats?.countries ?? []).slice(0, 8).map((c) => ({
    label: `${c.country}  ${countryName(c.country)}`,
    sub: fmtGb(num(c.vram_gb)),
    value: num(c.vram_gb),
  }));
  bars($("countries"), countries, emptyMsg);
  const cards = (stats?.top_cards ?? []).slice(0, 8).map((c) => {
    const avg = num(c.vram_gb) / Math.max(1, num(c.rigs));
    const gpus = num(c.gpus) || num(c.rigs);
    const sub = `${num(c.rigs).toLocaleString("en-US")} ${num(c.rigs) === 1 ? "rig" : "rigs"}${gpus > num(c.rigs) ? `, ${gpus.toLocaleString("en-US")} GPUs` : ""}`;
    return { label: c.gpu_model, sub, value: num(c.rigs), color: tierFor(avg).color };
  });
  bars($("cards"), cards, emptyMsg);
  $("ranks-note").textContent = !configured ? "Cluster opens soon." : failed ? "Cluster unreachable right now." : stats ? `${num(stats.total_rigs).toLocaleString("en-US")} rigs so far.` : "";
}

/** The seven tiers as a ladder, the current one lit. Counts per tier come from the histogram. */
export function renderLadder(host: HTMLElement, vramGb: number, stats: ClusterStats | null) {
  const mine = tierFor(vramGb);
  const counts = new Map<string, number>();
  for (const b of stats?.histogram ?? []) {
    const t = tierFor(num(b.vram_gb));
    counts.set(t.id, (counts.get(t.id) ?? 0) + num(b.rigs));
  }
  host.replaceChildren(
    ...TIERS.map((t) => {
      const li = h("li");
      li.style.setProperty("--c", t.color);
      if (t.id === mine.id) {
        li.classList.add("on");
        li.setAttribute("aria-current", "true");
      }
      li.title = `${t.name}: ${t.minGb}+ GB`;
      const n = counts.get(t.id);
      li.append(h("span", "l-gb", `${t.minGb}+`), h("span", "l-name", t.name));
      if (stats && num(stats.total_rigs) > 0) li.append(h("span", "l-n", `${(n ?? 0).toLocaleString("en-US")}`));
      return li;
    }),
  );
}

export { fmtGb };
