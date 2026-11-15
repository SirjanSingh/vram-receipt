import { SKUS, median } from "@vram-receipt/core";
import { QUARTER } from "./revenue";

const NS = "http://www.w3.org/2000/svg";
const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;

function el<K extends keyof SVGElementTagNameMap>(tag: K, attrs: Record<string, string | number> = {}, text?: string) {
  const e = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, String(v));
  if (text != null) e.textContent = text;
  return e;
}

/** Run `fn` the first time `node` scrolls into view (immediately if observers are unavailable). */
function onceVisible(node: Element, fn: () => void, threshold = 0.35) {
  if (!("IntersectionObserver" in window)) return fn();
  const io = new IntersectionObserver((entries) => {
    if (entries.some((e) => e.isIntersecting)) {
      io.disconnect();
      fn();
    }
  }, { threshold });
  io.observe(node);
}

// ---- revenue strip: one quarter, split into where the money came from ----
export function mountRevenue(host: HTMLElement) {
  const q = QUARTER;
  const other = Math.max(0, q.totalB - q.dataCenterB - q.edgeB);
  const pct = (v: number) => `${((v / q.totalB) * 100).toFixed(2)}%`;
  host.innerHTML = `
    <div class="rev-bar" role="img" aria-label="Nvidia revenue ${q.label}: $${q.dataCenterB.toFixed(1)} billion data center, $${q.edgeB.toFixed(1)} billion Edge Computing, of $${q.totalB.toFixed(1)} billion total.">
      <span class="rev-dc" style="--w:${pct(q.dataCenterB)}"><b>$${q.dataCenterB.toFixed(1)}B</b> data center</span>
      <span class="rev-edge" style="--w:${pct(q.edgeB)}"></span>
      ${other > 0.05 ? `<span class="rev-other" style="--w:${pct(other)}"></span>` : ""}
    </div>
    <p class="rev-cap"><span><b class="cash">$${q.edgeB.toFixed(1)}B</b> Edge Computing (PCs, consoles, more)</span>
      <span>Nvidia, ${q.label}. <a href="${q.sourceUrl}">Source</a> · <a href="${q.definitionUrl}">Segments</a></span></p>`;
  const run = () => host.classList.add("run");
  if (reduced) host.classList.add("run", "still");
  else onceVisible(host, run, 0.4);
}

// ---- six generation jars -------------------------------------------------
const GENS = [10, 16, 20, 30, 40, 50];
export const BUDGET = 500;
const CAP_GB = 12; // fixed scale for every jar
const COLS = 3;
const CHIP_W = 26, CHIP_H = 30, GAP = 3;
const SMALL_BODY = "M34 26 L34 34 C18 38 10 46 10 60 L10 168 C10 176 16 182 24 182 L96 182 C104 182 110 176 110 168 L110 60 C110 46 102 38 86 34 L86 26 Z";

export interface GenJar { generation: number; gb: number; years: string; count: number }

export const GEN_JARS: GenJar[] = GENS.map((g) => {
  const rows = SKUS.filter((s) => s.generation === g && s.mbPerRealDollar != null);
  const mbPerReal = median(rows.map((s) => s.mbPerRealDollar!))!;
  const years = rows.map((s) => s.launchDate.slice(0, 4)).sort();
  return {
    generation: g,
    gb: (mbPerReal * BUDGET) / 1024,
    years: years[0] === years.at(-1) ? years[0]! : `${years[0]} to ${years.at(-1)}`,
    count: rows.length,
  };
});

function chip(x: number, y: number, h: number) {
  const g = el("g", { class: "chip" });
  g.append(
    el("rect", { x, y: y + (CHIP_H - h), width: CHIP_W, height: h, rx: 2, class: "chip-body" }),
  );
  if (h > 12) {
    g.append(el("rect", { x: x + 7, y: y + (CHIP_H - h) + h / 2 - 5, width: 12, height: 10, rx: 1, class: "chip-die" }));
    for (let i = 0; i < 3; i++) {
      const py = y + (CHIP_H - h) + 6 + i * ((h - 12) / 2);
      g.append(el("rect", { x: x - 2, y: py, width: 2, height: 2, class: "chip-pin" }), el("rect", { x: x + CHIP_W, y: py, width: 2, height: 2, class: "chip-pin" }));
    }
  }
  return g;
}

export function mountGenJars(host: HTMLElement, verdict: HTMLElement, replay: HTMLButtonElement) {
  const nodes: SVGSVGElement[] = [];
  // Shared glass gradient for the small jars (they used to borrow it from the hero jar).
  const defsSvg = el("svg", { width: 0, height: 0, "aria-hidden": "true", style: "position:absolute" });
  defsSvg.innerHTML = `<defs><linearGradient id="glass" x1="0" x2="1">
    <stop offset="0" stop-color="#fff" stop-opacity=".10"/><stop offset=".25" stop-color="#fff" stop-opacity=".02"/>
    <stop offset=".8" stop-color="#fff" stop-opacity="0"/><stop offset="1" stop-color="#fff" stop-opacity=".08"/></linearGradient></defs>`;
  host.append(defsSvg);
  for (const j of GEN_JARS) {
    const item = document.createElement("div");
    item.className = "gen-jar";
    item.setAttribute("role", "listitem");
    const svg = el("svg", { viewBox: "0 0 120 190", role: "img", "aria-label": `${j.generation} series: $${BUDGET} bought ${j.gb.toFixed(1)} GB of VRAM` });
    svg.append(el("path", { d: SMALL_BODY, fill: "url(#glass)", class: "small-glass" }));
    const chips = el("g", { class: "chips" });
    const full = Math.floor(j.gb);
    const frac = j.gb - full;
    const total = full + (frac > 0.05 ? 1 : 0);
    for (let i = 0; i < total; i++) {
      const col = i % COLS, row = Math.floor(i / COLS);
      const x = 60 - (COLS * CHIP_W + (COLS - 1) * GAP) / 2 + col * (CHIP_W + GAP);
      const y = 178 - (row + 1) * CHIP_H - row * GAP;
      const c = chip(x, y, i < full ? CHIP_H : Math.max(4, CHIP_H * frac));
      c.style.setProperty("--d", `${i * 85}ms`);
      chips.append(c);
    }
    svg.append(chips);
    // Capacity marks every 3 GB, same for every jar.
    for (let gb = 3; gb <= CAP_GB; gb += 3) {
      const rowsUp = gb / COLS;
      const y = 178 - rowsUp * CHIP_H - (rowsUp - 1) * GAP - 1.5;
      svg.append(el("path", { d: `M104 ${y} H110`, class: "tick" }));
    }
    svg.append(
      el("path", { d: SMALL_BODY, fill: "none", class: "small-edge" }),
      el("rect", { x: 30, y: 12, width: 60, height: 16, rx: 4, fill: "var(--lid)" }),
    );
    nodes.push(svg);
    const cap = document.createElement("div");
    cap.className = "gen-cap";
    cap.innerHTML = `<b>${j.generation} series</b><span class="gb">${j.gb.toFixed(1)} GB</span><span class="yrs">${j.years}</span>`;
    item.append(svg, cap);
    host.append(item);
  }

  const first = GEN_JARS[0]!, last = GEN_JARS.at(-1)!;
  verdict.textContent = `${first.gb.toFixed(1)} GB in the ${first.generation} series. ${last.gb.toFixed(1)} GB in the ${last.generation} series.`;

  const run = () => {
    host.classList.remove("run");
    void host.offsetWidth; // restart the CSS animation
    host.classList.add("run");
  };
  if (reduced) host.classList.add("run", "still");
  else onceVisible(host, run);
  replay.addEventListener("click", run);
  replay.hidden = reduced;
}
