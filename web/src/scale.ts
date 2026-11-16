// The pooled VRAM on a log scale, against real machines and models, so "2.1 TB" means something.
// Sizes: NVIDIA DGX H100 / DGX B200 / GB200 NVL72 spec pages, Llama 3.1 405B BF16 weights
// (Hugging Face, 810 GB). Decimal units, like the spec sheets.

interface Milestone { gb: number; label: string; size: string; passed: string; next: string }

const MILESTONES: Milestone[] = [
  { gb: 80, label: "H100", size: "80 GB", passed: "More VRAM than an H100.", next: "one H100, 80 GB" },
  { gb: 640, label: "DGX H100", size: "640 GB", passed: "More VRAM than a whole DGX H100.", next: "a DGX H100, 640 GB" },
  { gb: 810, label: "Llama 405B", size: "810 GB", passed: "Enough to hold Llama 3.1 405B at full precision.", next: "Llama 3.1 405B at full precision, 810 GB" },
  { gb: 1440, label: "DGX B200", size: "1.44 TB", passed: "More VRAM than a DGX B200.", next: "a DGX B200, 1.44 TB" },
  { gb: 13400, label: "GB200 NVL72", size: "13.4 TB", passed: "More VRAM than a GB200 NVL72 rack.", next: "a GB200 NVL72 rack, 13.4 TB" },
  { gb: 134000, label: "10 racks", size: "134 TB", passed: "More VRAM than ten NVL72 racks.", next: "ten NVL72 racks, 134 TB" },
];

export const fmtGb = (gb: number) =>
  gb >= 1000 ? `${(gb / 1000).toFixed(gb >= 100000 ? 0 : 1)} TB` : `${Math.round(gb).toLocaleString("en-US")} GB`;

const MIN = 4;
let relayout = () => {};
addEventListener("resize", () => relayout());
const el = <K extends keyof HTMLElementTagNameMap>(tag: K, cls?: string, text?: string) => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text != null) e.textContent = text;
  return e;
};

export function renderScale(root: HTMLElement, vram: number, you: { name: string; vramGb: number }) {
  const passed = [...MILESTONES].reverse().find((m) => vram >= m.gb) ?? null;
  const next = MILESTONES.find((m) => vram < m.gb) ?? null;
  const max = (next ?? MILESTONES[MILESTONES.length - 1]!).gb * 2.2;
  const x = (gb: number) => `${(100 * Math.log(Math.max(gb, MIN) / MIN)) / Math.log(max / MIN)}%`;

  const head = el("div", "scale-head");
  head.append(el("p", "eyebrow", "How big is that"));
  const h = el("h2");
  h.id = "scale-title";
  h.append(el("span", "scale-n", `${fmtGb(vram)} pooled.`), document.createTextNode(` ${passed ? passed.passed : "Not one H100 yet."}`));
  head.append(h);
  if (next) {
    const gap = next.gb - vram;
    const more = Math.ceil(gap / Math.max(you.vramGb, 1));
    head.append(el("p", "scale-next", `Next: ${next.next}. ${fmtGb(gap)} to go, about ${more.toLocaleString("en-US")} more ${you.name}s.`));
  }

  const track = el("div", "scale-track");
  track.setAttribute("role", "img");
  track.setAttribute("aria-label", `The cluster holds ${fmtGb(vram)}. ${passed?.passed ?? ""} ${next ? `Next: ${next.next}.` : ""}`);
  const fill = el("div", "scale-fill");
  fill.style.setProperty("--x", x(vram));
  track.append(fill);
  const marks: HTMLElement[] = [];
  const me = el("div", "scale-mark you");
  me.style.left = x(you.vramGb);
  me.dataset.gb = String(you.vramGb);
  me.append(el("b", "", "You"), el("span", "", `${you.vramGb} GB`));
  marks.push(me);
  for (const m of MILESTONES.filter((m) => m.gb <= max)) {
    const mk = el("div", `scale-mark${vram >= m.gb ? " on" : ""}`);
    mk.style.left = x(m.gb);
    mk.dataset.gb = String(m.gb);
    mk.append(el("b", "", m.label), el("span", "", m.size));
    marks.push(mk);
  }
  marks.sort((a, b) => Number(a.dataset.gb) - Number(b.dataset.gb));
  track.append(...marks);
  const dot = el("div", "scale-dot");
  dot.style.left = x(vram);
  track.append(dot);

  root.replaceChildren(head, track, el("p", "fine", "Log scale: each step along the bar is ten times the last. Sizes from NVIDIA spec sheets and Meta's Llama 3.1 release."));
  root.hidden = false;
  placeLabels(track, marks);
  relayout = () => placeLabels(track, marks);
  requestAnimationFrame(() => root.classList.add("in"));
}

/** Put each label in the first lane (above, below, further above, further below) where it fits. */
function placeLabels(track: HTMLElement, marks: HTMLElement[]) {
  const lanes: number[] = [-Infinity, -Infinity, -Infinity, -Infinity];
  const w = track.clientWidth;
  let used = 0;
  for (const mk of marks) {
    const left = (parseFloat(mk.style.left) / 100) * w;
    const half = Math.max(...Array.from(mk.children, (c) => (c as HTMLElement).offsetWidth)) / 2 + 8;
    let lane = lanes.findIndex((end) => left - half > end);
    if (lane < 0) lane = lanes.indexOf(Math.min(...lanes));
    lanes[lane] = left + half;
    mk.dataset.lane = String(lane);
    used = Math.max(used, lane);
  }
  track.dataset.lanes = String(used + 1);
}
