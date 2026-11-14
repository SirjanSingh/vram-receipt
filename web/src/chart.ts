import { SKUS, median } from "@vram-receipt/core";
import type { Sku } from "@vram-receipt/core";

export type Basis = "nominal" | "real";

const GENS = [10, 16, 20, 30, 40, 50];
const W = 960, H = 440;
const M = { top: 26, right: 20, bottom: 62, left: 52 };
const Y_MAX = 40; // fixed for both bases so the toggle shows the shift, not a rescale
const NS = "http://www.w3.org/2000/svg";

const priced = SKUS.filter((s) => s.mbPerDollar != null && s.mbPerRealDollar != null);
const value = (s: Sku, b: Basis) => (b === "nominal" ? s.mbPerDollar! : s.mbPerRealDollar!);
const y = (v: number) => M.top + (1 - v / Y_MAX) * (H - M.top - M.bottom);
const band = (W - M.left - M.right) / GENS.length;
const cx0 = (gi: number) => M.left + band * (gi + 0.5);

function el<K extends keyof SVGElementTagNameMap>(tag: K, attrs: Record<string, string | number>, text?: string) {
  const e = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, String(v));
  if (text != null) e.textContent = text;
  return e;
}

/** Spread dots that would overlap: fixed x offsets computed once from the nominal values. */
function offsets(rows: Sku[]): Map<string, number> {
  const out = new Map<string, number>();
  const placed: { v: number; dx: number }[] = [];
  for (const s of [...rows].sort((a, b) => a.mbPerDollar! - b.mbPerDollar!)) {
    let dx = 0;
    for (const step of [0, -16, 16, -32, 32, -48, 48]) {
      dx = step;
      if (!placed.some((p) => p.dx === step && Math.abs(p.v - s.mbPerDollar!) < 1.9)) break;
    }
    placed.push({ v: s.mbPerDollar!, dx });
    out.set(s.skuId, dx);
  }
  return out;
}

export function mountChart(host: HTMLElement, tip: HTMLElement) {
  const svg = el("svg", { viewBox: `0 0 ${W} ${H}`, role: "img", "aria-labelledby": "chart-title" });
  svg.append(el("title", { id: "chart-title" }, "VRAM per launch dollar for each desktop GeForce card, grouped by generation"));

  for (const t of [0, 10, 20, 30, 40]) {
    svg.append(el("line", { class: t === 0 ? "axis" : "grid", x1: M.left, x2: W - M.right, y1: y(t), y2: y(t) }));
    svg.append(el("text", { x: M.left - 10, y: y(t) + 4, "text-anchor": "end" }, String(t)));
  }
  svg.append(el("text", { x: M.left - 40, y: M.top - 10 }, "MB per $"));

  const dots: { node: SVGCircleElement; sku: Sku }[] = [];
  const medians: { line: SVGLineElement; label: SVGTextElement; rows: Sku[] }[] = [];
  const tops: { label: SVGTextElement; rows: Sku[] }[] = [];

  GENS.forEach((g, gi) => {
    const rows = priced.filter((s) => s.generation === g);
    const off = offsets(rows);
    svg.append(el("text", { class: "gen-label", x: cx0(gi), y: H - 34, "text-anchor": "middle" }, `${g} series`));
    const line = el("line", { class: "median", x1: cx0(gi) - band * 0.4, x2: cx0(gi) + band * 0.4, y1: 0, y2: 0 });
    // The median value sits under the axis label, clear of the dots.
    const label = el("text", { class: "median-label", x: cx0(gi), y: H - 14, "text-anchor": "middle" });
    svg.append(line, label);
    medians.push({ line, label, rows });
    for (const s of rows) {
      const node = el("circle", { class: "dot", cx: cx0(gi) + off.get(s.skuId)!, cy: 0, r: 6, tabindex: 0 });
      dots.push({ node, sku: s });
      svg.append(node);
    }
    const top = el("text", { class: "top-label", x: cx0(gi), y: 0, "text-anchor": "middle" });
    svg.append(top);
    tops.push({ label: top, rows });
  });
  host.replaceChildren(svg);

  let basis: Basis = "nominal";
  const describe = (s: Sku) => {
    const price = basis === "nominal" ? `$${s.msrpUsd!.toLocaleString("en-US")} launch MSRP` : `$${Math.round(s.msrpRealUsd!).toLocaleString("en-US")} in today's dollars`;
    return `${s.model} ${s.vramGb} GB\n${price}\n${value(s, basis).toFixed(1)} MB per dollar\nlaunched ${s.launchDate}`;
  };
  const show = (d: { node: SVGCircleElement; sku: Sku }) => {
    const box = host.getBoundingClientRect();
    const r = d.node.getBoundingClientRect();
    tip.textContent = describe(d.sku);
    tip.hidden = false;
    const half = tip.offsetWidth / 2;
    const x = Math.min(Math.max(r.left + r.width / 2 - box.left, half), box.width - half);
    tip.style.left = `${x}px`;
    tip.style.top = `${r.top - box.top}px`;
  };
  for (const d of dots) {
    d.node.addEventListener("pointerenter", () => show(d));
    d.node.addEventListener("focus", () => show(d));
    d.node.addEventListener("pointerleave", () => (tip.hidden = true));
    d.node.addEventListener("blur", () => (tip.hidden = true));
  }

  function render(b: Basis) {
    basis = b;
    tip.hidden = true;
    for (const d of dots) {
      d.node.setAttribute("cy", String(y(value(d.sku, b))));
      d.node.setAttribute("aria-label", describe(d.sku).replace(/\n/g, ", "));
    }
    for (const m of medians) {
      const med = median(m.rows.map((s) => value(s, b)))!;
      m.line.setAttribute("y1", String(y(med)));
      m.line.setAttribute("y2", String(y(med)));
      m.label.textContent = `median ${med.toFixed(1)}`;
    }
    for (const t of tops) {
      const best = [...t.rows].sort((a, c) => value(c, b) - value(a, b))[0]!;
      t.label.setAttribute("y", String(y(value(best, b)) - 13));
      t.label.textContent = `${best.model} ${best.vramGb} GB`;
    }
  }
  render("nominal");
  return { render };
}

export function fillTable(table: HTMLTableElement) {
  const head = ["Card", "Launched", "Launch MSRP", "Today's dollars", "MB/$", "MB/$ today"];
  const tr = (cells: string[], tag: "th" | "td") => {
    const row = document.createElement("tr");
    for (const c of cells) {
      const cell = document.createElement(tag);
      cell.textContent = c;
      row.append(cell);
    }
    return row;
  };
  const thead = document.createElement("thead");
  thead.append(tr(head, "th"));
  const tbody = document.createElement("tbody");
  for (const s of SKUS) {
    tbody.append(tr([
      `${s.model} ${s.vramGb} GB`,
      s.launchDate,
      s.msrpUsd != null ? `$${s.msrpUsd.toLocaleString("en-US")}` : "no confirmed source",
      s.msrpRealUsd != null ? `$${Math.round(s.msrpRealUsd).toLocaleString("en-US")}` : "",
      s.mbPerDollar != null ? s.mbPerDollar.toFixed(1) : "",
      s.mbPerRealDollar != null ? s.mbPerRealDollar.toFixed(1) : "",
    ], "td"));
  }
  table.replaceChildren(thead, tbody);
}

export const pricedCount = priced.length;
export const blankCount = SKUS.length - priced.length;
